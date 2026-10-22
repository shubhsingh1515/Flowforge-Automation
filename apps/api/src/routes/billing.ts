import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, WorkspaceRole } from "@flowforge/database";
import { getAllPlans, getPlan } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { entitlementService } from "../services/entitlements.js";
import { billingService } from "../services/billing.js";
import { usageService } from "../services/usage.js";
import { invitationService } from "../services/invitations.js";
import { config } from "../config.js";

const CheckoutSchema = z.object({
  targetPlan: z.enum(["PRO", "BUSINESS"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(10),
});

export async function billingRoutes(server: FastifyInstance) {
  // 1. Public list of available subscription plans
  server.get("/plans", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "List all available subscription plans and included quotas",
    },
    handler: async () => {
      return {
        plans: getAllPlans(),
      };
    },
  });

  // 2. Get current workspace subscription & entitlements
  server.get("/billing/subscription", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Get current workspace subscription status, plan limits, and usage",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const entitlements = await entitlementService.getWorkspaceEntitlements(workspaceId);
      return entitlements;
    },
  });

  // 3. Create Hosted Stripe Checkout Session
  server.post("/billing/checkout", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Create a hosted checkout session to upgrade workspace subscription",
      body: CheckoutSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, email, name } = request.authUser!;

      // Enforce billing permission: only OWNER or ADMIN can purchase
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can manage subscription billing.",
        });
      }

      const { targetPlan, successUrl, cancelUrl } = CheckoutSchema.parse(request.body);

      const defaultSuccessUrl = `${config.frontendUrl}/settings?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const defaultCancelUrl = `${config.frontendUrl}/settings?tab=billing&checkout=cancelled`;

      const session = await billingService.createCheckoutSession({
        workspaceId,
        targetPlan,
        userEmail: email,
        userName: name,
        successUrl: successUrl || defaultSuccessUrl,
        cancelUrl: cancelUrl || defaultCancelUrl,
      });

      return reply.status(200).send(session);
    },
  });

  // 4. Create Stripe Customer Portal Session
  server.post("/billing/portal", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Create customer billing portal session for payment method & invoice management",
      body: z.any().optional(),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, email, name } = request.authUser!;

      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can access billing portal.",
        });
      }

      const returnUrl = (request.body as any)?.returnUrl || `${config.frontendUrl}/settings?tab=billing`;
      const portal = await billingService.createPortalSession(workspaceId, email, name, returnUrl);

      return reply.status(200).send(portal);
    },
  });

  // 5. Cancel Subscription (at period end)
  server.post("/billing/cancel", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Request subscription cancellation at the end of the current billing period",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole } = request.authUser!;

      if (workspaceRole !== "OWNER") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners can cancel subscriptions.",
        });
      }

      const result = await billingService.cancelSubscription(workspaceId, true);
      return reply.status(200).send(result);
    },
  });

  // 6. Get Detailed Usage & Ledger History
  server.get("/billing/usage", {
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Get current period usage aggregates and recent usage records",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const sub = await entitlementService.getOrCreateSubscription(workspaceId);
      const periodStart = sub.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [summary, history] = await Promise.all([
        usageService.getUsageForPeriod(workspaceId, periodStart),
        usageService.getRecentUsageHistory(workspaceId, 25),
      ]);

      return {
        summary,
        history,
      };
    },
  });

  // 7. Verified Stripe Billing Webhook
  server.post("/billing/webhook", {
    config: {
      rateLimit: false, // Don't rate limit provider webhooks
    },
    schema: {
      tags: ["Billing & Monetization"],
      summary: "Process incoming verified Stripe billing lifecycle events",
    },
    handler: async (request, reply) => {
      const signature = (request.headers["stripe-signature"] as string) || "";
      const rawPayload = request.body;

      let event: any;
      try {
        event = billingService.constructWebhookEvent(
          typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload),
          signature
        );
      } catch (err: any) {
        server.log.warn({ msg: "Webhook signature verification failed", error: err.message });
        return reply.status(400).send({
          error: "Bad Request",
          message: `Webhook signature verification failed: ${err.message}`,
        });
      }

      const result = await billingService.handleWebhookEvent(event);
      return reply.status(200).send({ received: true, ...result });
    },
  });

  // 8. Invite Workspace Member
  server.post("/workspaces/members/invite", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Invite a new team member to the workspace",
      body: InviteMemberSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, id: userId } = request.authUser!;

      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can invite team members.",
        });
      }

      const { email, role } = InviteMemberSchema.parse(request.body);

      try {
        const result = await invitationService.createInvitation({
          workspaceId,
          email,
          role: role as WorkspaceRole,
          invitedByUserId: userId,
        });

        return reply.status(201).send({
          success: true,
          invitation: result.invitation,
          inviteLink: `${config.frontendUrl}/register?inviteToken=${result.rawToken}`,
        });
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bad Request",
          message: err.message,
        });
      }
    },
  });

  // 9. List Pending Invitations
  server.get("/workspaces/invitations", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "List pending member invitations for the workspace",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const invitations = await invitationService.listPendingInvitations(workspaceId);
      return { invitations };
    },
  });

  // 10. Revoke Member Invitation
  server.delete("/workspaces/invitations/:id", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Revoke a pending member invitation",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole } = request.authUser!;
      const { id } = request.params as { id: string };

      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can revoke invitations.",
        });
      }

      try {
        await invitationService.revokeInvitation(id, workspaceId);
        return reply.status(200).send({ success: true, message: "Invitation revoked." });
      } catch (err: any) {
        return reply.status(404).send({ error: "Not Found", message: err.message });
      }
    },
  });

  // 11. Accept Workspace Invitation
  server.post("/invitations/accept", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Accept an invitation token to join a workspace",
      body: AcceptInviteSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { id: userId } = request.authUser!;
      const { token } = AcceptInviteSchema.parse(request.body);

      try {
        const result = await invitationService.acceptInvitation(token, userId);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bad Request",
          message: err.message,
        });
      }
    },
  });

  // 12. Remove Workspace Member
  server.delete("/workspaces/members/:userId", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Remove a member from the workspace",
      params: z.object({ userId: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, id: currentUserId } = request.authUser!;
      const { userId: targetUserId } = request.params as { userId: string };

      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can remove members.",
        });
      }

      // Check target member's role
      const targetMembership = await prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: targetUserId,
          },
        },
      });

      if (!targetMembership) {
        return reply.status(404).send({ error: "Not Found", message: "Member not found in workspace." });
      }

      // Prevent non-owners from removing an owner
      if (targetMembership.role === "OWNER" && workspaceRole !== "OWNER") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners can remove an owner.",
        });
      }

      // Prevent deleting the last owner of a workspace
      if (targetMembership.role === "OWNER") {
        const ownerCount = await prisma.workspaceMembership.count({
          where: {
            workspaceId,
            role: "OWNER",
          },
        });

        if (ownerCount <= 1) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Cannot remove the only remaining workspace owner. Transfer ownership first.",
          });
        }
      }

      await prisma.workspaceMembership.delete({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: targetUserId,
          },
        },
      });

      return reply.status(200).send({ success: true, message: "Member removed from workspace." });
    },
  });
}
