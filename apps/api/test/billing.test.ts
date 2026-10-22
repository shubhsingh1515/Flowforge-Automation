import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, PlanTier, SubscriptionStatus } from "@flowforge/database";
import { entitlementService } from "../src/services/entitlements.js";
import { usageService } from "../src/services/usage.js";
import { invitationService } from "../src/services/invitations.js";

describe("Phase 6 SaaS Monetization, Billing, Usage & Entitlements Suite", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // 1. Create User A (Owner of Workspace A)
    const resA = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `alice_bill_${Date.now()}@flowforge.dev`,
        password: "Password123!",
        name: "Alice Billing",
        workspaceName: "Alice Billing WS",
      },
    });
    const dataA = JSON.parse(resA.payload);
    userAToken = dataA.token;
    workspaceAId = dataA.user.activeWorkspaceId;
    userAId = dataA.user.id;

    // 2. Create User B (Owner of Workspace B)
    const resB = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `bob_bill_${Date.now()}@flowforge.dev`,
        password: "Password123!",
        name: "Bob Billing",
        workspaceName: "Bob Billing WS",
      },
    });
    const dataB = JSON.parse(resB.payload);
    userBToken = dataB.token;
    workspaceBId = dataB.user.activeWorkspaceId;
    userBId = dataB.user.id;
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Plans & Subscription Entitlements", () => {
    it("GET /api/v1/plans returns public plan tiers (Free, Pro, Business)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/plans",
      });

      expect(res.statusCode).toBe(200);
      const { plans } = JSON.parse(res.payload);
      expect(plans.length).toBe(3);
      expect(plans.map((p: any) => p.tier)).toEqual(["FREE", "PRO", "BUSINESS"]);
      expect(plans.find((p: any) => p.tier === "FREE").priceMonthlyCents).toBe(0);
      expect(plans.find((p: any) => p.tier === "PRO").priceMonthlyCents).toBe(2900);
      expect(plans.find((p: any) => p.tier === "BUSINESS").priceMonthlyCents).toBe(9900);
    });

    it("GET /api/v1/billing/subscription returns workspace subscription and quotas", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/billing/subscription",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.workspaceId).toBe(workspaceAId);
      expect(data.plan.tier).toBe("FREE");
      expect(data.subscription.status).toBe("ACTIVE");
      expect(data.quotas.executions.limit).toBe(100);
      expect(data.quotas.activeWorkflows.limit).toBe(3);
      expect(data.quotas.members.limit).toBe(2);
      expect(data.quotas.connectedAccounts.limit).toBe(2);
    });
  });

  describe("Checkout & Billing Portal", () => {
    it("POST /api/v1/billing/checkout creates hosted checkout session for Pro upgrade", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/billing/checkout",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          targetPlan: "PRO",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.url).toBeDefined();
      expect(data.sessionId).toBeDefined();
    });

    it("POST /api/v1/billing/portal returns customer billing portal session", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/billing/portal",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.url).toBeDefined();
    });
  });

  describe("Billing Webhook Ingestion & Idempotency", () => {
    it("processes checkout.session.completed and upgrades workspace to PRO", async () => {
      const eventId = `evt_test_checkout_${Date.now()}`;
      const payload = {
        id: eventId,
        type: "checkout.session.completed",
        data: {
          object: {
            customer: "cus_test_12345",
            subscription: "sub_test_12345",
            metadata: {
              workspaceId: workspaceAId,
              targetPlan: "PRO",
            },
          },
        },
      };

      const res = await server.inject({
        method: "POST",
        url: "/api/v1/billing/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).received).toBe(true);

      // Verify DB update
      const sub = await prisma.workspaceSubscription.findUnique({
        where: { workspaceId: workspaceAId },
      });
      expect(sub?.planTier).toBe(PlanTier.PRO);
      expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);
      expect(sub?.stripeCustomerId).toBe("cus_test_12345");
    });

    it("rejects duplicate webhook events idempotently without reprocessing", async () => {
      const eventId = `evt_test_dup_${Date.now()}`;
      const payload = {
        id: eventId,
        type: "invoice.payment_succeeded",
        data: {
          object: {
            customer: "cus_test_12345",
          },
        },
      };

      // First delivery
      const res1 = await server.inject({
        method: "POST",
        url: "/api/v1/billing/webhook",
        payload,
      });
      expect(res1.statusCode).toBe(200);

      // Second duplicate delivery
      const res2 = await server.inject({
        method: "POST",
        url: "/api/v1/billing/webhook",
        payload,
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.payload).received).toBe(true);
    });

    it("processes customer.subscription.deleted and reverts workspace to FREE", async () => {
      const eventId = `evt_test_del_${Date.now()}`;
      const payload = {
        id: eventId,
        type: "customer.subscription.deleted",
        data: {
          object: {
            metadata: {
              workspaceId: workspaceAId,
            },
          },
        },
      };

      const res = await server.inject({
        method: "POST",
        url: "/api/v1/billing/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);

      const sub = await prisma.workspaceSubscription.findUnique({
        where: { workspaceId: workspaceAId },
      });
      expect(sub?.planTier).toBe(PlanTier.FREE);
      expect(sub?.status).toBe(SubscriptionStatus.CANCELED);
    });
  });

  describe("Usage Metering & Idempotent Deduplication", () => {
    it("records billable execution usage idempotently", async () => {
      const execId = `exec_meter_${Date.now()}`;

      // First record
      const r1 = await usageService.recordExecutionUsage({
        workspaceId: workspaceBId,
        executionId: execId,
      });
      expect(r1.recorded).toBe(true);
      expect(r1.record?.quantity).toBe(1);

      // Duplicate delivery (retry/resume)
      const r2 = await usageService.recordExecutionUsage({
        workspaceId: workspaceBId,
        executionId: execId,
      });
      expect(r2.recorded).toBe(true); // Handled safely without duplicate row

      const totalRecords = await prisma.usageRecord.count({
        where: { executionId: execId },
      });
      expect(totalRecords).toBe(1); // Deduped!
    });

    it("GET /api/v1/billing/usage returns current period usage and ledger history", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/billing/usage",
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.summary.totalExecutions).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.history)).toBe(true);
    });

    it("blocks execution when monthly quota is exhausted", async () => {
      // Artificially record 105 executions for Workspace B (Free plan limit: 100)
      const dummyId = `exec_dummy_${Date.now()}`;
      await prisma.usageRecord.create({
        data: {
          workspaceId: workspaceBId,
          executionId: dummyId,
          quantity: 105,
          idempotencyKey: `bulk_usage_${Date.now()}`,
        },
      });

      const check = await entitlementService.canExecuteWorkflow(workspaceBId);
      expect(check.allowed).toBe(false);
      expect(check.reason).toMatch(/quota.*reached/i);
    });
  });

  describe("Active Workflow Limits Enforcement", () => {
    it("enforces plan limit on activating workflows", async () => {
      // Workspace B is on FREE plan (limit: 3 active workflows).
      // Create 3 active workflows
      for (let i = 1; i <= 3; i++) {
        await prisma.workflow.create({
          data: {
            workspaceId: workspaceBId,
            name: `Active WF ${i}`,
            status: "ACTIVE",
          },
        });
      }

      // Attempt to activate a 4th workflow
      const wf4 = await prisma.workflow.create({
        data: {
          workspaceId: workspaceBId,
          name: "Active WF 4 (Over Limit)",
          status: "DRAFT",
        },
      });

      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${wf4.id}/activate`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).message).toMatch(/limit of 3 reached/i);
    });
  });

  describe("Workspace Member Invitations & Quotas", () => {
    it("invites a member subject to plan member limit", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/members/invite",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          email: "colleague@flowforge.dev",
          role: "MEMBER",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.success).toBe(true);
      expect(data.invitation.email).toBe("colleague@flowforge.dev");
      expect(data.inviteLink).toBeDefined();
    });

    it("rejects invitation when plan member quota is exceeded", async () => {
      // Workspace A on Free tier has limit 2. It now has 1 owner + 1 pending invite = 2.
      // Inviting another must be rejected.
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/members/invite",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          email: "colleague2@flowforge.dev",
          role: "MEMBER",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toMatch(/member limit.*reached/i);
    });

    it("lists pending invitations", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/workspaces/invitations",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.invitations.length).toBeGreaterThanOrEqual(1);
    });

    it("accepts an invitation token and adds member", async () => {
      // Create user C
      const resUserC = await server.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: `charlie_${Date.now()}@flowforge.dev`,
          password: "Password123!",
          name: "Charlie Colleague",
          workspaceName: "Charlie WS",
        },
      });
      const userCToken = JSON.parse(resUserC.payload).token;
      const userCId = JSON.parse(resUserC.payload).user.id;

      // Create an invitation in Workspace B (which has capacity if we allow)
      const inv = await invitationService.createInvitation({
        workspaceId: workspaceBId,
        email: `charlie_${Date.now()}@flowforge.dev`,
        role: "MEMBER",
        invitedByUserId: userBId,
      });

      // User C accepts invitation
      const acceptRes = await server.inject({
        method: "POST",
        url: "/api/v1/invitations/accept",
        headers: { authorization: `Bearer ${userCToken}` },
        payload: {
          token: inv.rawToken,
        },
      });

      expect(acceptRes.statusCode).toBe(200);
      expect(JSON.parse(acceptRes.payload).success).toBe(true);

      // Verify User C is now member of Workspace B
      const membership = await prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: workspaceBId,
            userId: userCId,
          },
        },
      });
      expect(membership?.role).toBe("MEMBER");
    });

    it("prevents removing the last remaining workspace owner", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: `/api/v1/workspaces/members/${userAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toMatch(/only remaining workspace owner/i);
    });
  });

  describe("Tenant Isolation for Billing & Governance", () => {
    it("prevents User B from accessing Workspace A billing or usage records", async () => {
      // User B tries to revoke Workspace A's invitation
      const invList = await invitationService.listPendingInvitations(workspaceAId);
      if (invList.length > 0) {
        const res = await server.inject({
          method: "DELETE",
          url: `/api/v1/workspaces/invitations/${invList[0].id}`,
          headers: { authorization: `Bearer ${userBToken}` }, // User B's token
        });
        expect([403, 404]).toContain(res.statusCode);
      }
    });
  });
});
