import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  AddOrganizationMemberSchema,
  CreateTeamSchema,
  UpdateTeamSchema,
  AddTeamMemberSchema,
  GrantResourcePermissionSchema,
  UpdateWorkflowStewardshipSchema,
  CreateWorkflowReviewSchema,
  DecideWorkflowReviewSchema,
  AddReviewCommentSchema,
  CreateReliabilityObjectiveSchema,
  CreateComplianceExportSchema,
} from "@flowforge/shared";
import { authenticateRequest, requireScope } from "../plugins/auth.js";
import { organizationService } from "../services/organizationService.js";
import { teamService } from "../services/teamService.js";
import { permissionService } from "../services/permissionService.js";
import { reviewService } from "../services/reviewService.js";
import { governanceService } from "../services/governance.js";
import { reliabilityService } from "../services/reliabilityService.js";
import { complianceService } from "../services/complianceService.js";

export async function collaborationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. ORGANIZATIONS
  // ==========================================

  app.post(
    "/organizations",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Create a new top-level enterprise organization",
        body: CreateOrganizationSchema,
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const org = await organizationService.createOrganization(userId, request.body);
      return reply.status(201).send({ data: org });
    }
  );

  app.get(
    "/organizations",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "List organizations the authenticated user belongs to",
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const orgs = await organizationService.listUserOrganizations(userId);
      return reply.send({ data: orgs });
    }
  );

  app.get(
    "/organizations/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Get organization details and linked workspaces",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const org = await organizationService.getOrganization(request.params.id, userId);
      return reply.send({ data: org });
    }
  );

  app.patch(
    "/organizations/:id",
    {
      preHandler: [authenticateRequest, requireScope("org:admin")],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Update organization metadata",
        params: z.object({ id: z.string() }),
        body: UpdateOrganizationSchema,
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const updated = await organizationService.updateOrganization(request.params.id, userId, request.body);
      return reply.send({ data: updated });
    }
  );

  app.get(
    "/organizations/:id/members",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "List members of an organization",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const members = await organizationService.listMembers(request.params.id, userId);
      return reply.send({ data: members });
    }
  );

  app.post(
    "/organizations/:id/members",
    {
      preHandler: [authenticateRequest, requireScope("org:admin")],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Add an authenticated member to the organization",
        params: z.object({ id: z.string() }),
        body: AddOrganizationMemberSchema,
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const member = await organizationService.addMember(request.params.id, userId, request.body);
      return reply.status(201).send({ data: member });
    }
  );

  app.delete(
    "/organizations/:id/members/:userId",
    {
      preHandler: [authenticateRequest, requireScope("org:admin")],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Remove a member from the organization (with last-owner protection)",
        params: z.object({ id: z.string(), userId: z.string() }),
      },
    },
    async (request, reply) => {
      const { id: actorUserId } = request.authUser!;
      const res = await organizationService.removeMember(request.params.id, actorUserId, request.params.userId);
      return reply.send(res);
    }
  );

  app.post(
    "/organizations/:id/workspaces",
    {
      preHandler: [authenticateRequest, requireScope("org:admin")],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Link a workspace under the organization",
        params: z.object({ id: z.string() }),
        body: z.object({ workspaceId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { id: actorUserId } = request.authUser!;
      const res = await organizationService.assignWorkspace(request.params.id, actorUserId, request.body.workspaceId);
      return reply.send({ data: res });
    }
  );

  // ==========================================
  // 2. TEAMS
  // ==========================================

  app.post(
    "/teams",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Create a new team in the active workspace",
        body: CreateTeamSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const team = await teamService.createTeam(workspaceId, userId, request.body);
      return reply.status(201).send({ data: team });
    }
  );

  app.get(
    "/teams",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "List teams in the active workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const teams = await teamService.listTeams(workspaceId);
      return reply.send({ data: teams });
    }
  );

  app.get(
    "/teams/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Get team details and members",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const team = await teamService.getTeam(workspaceId, request.params.id);
      return reply.send({ data: team });
    }
  );

  app.patch(
    "/teams/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Update team settings or archive team",
        params: z.object({ id: z.string() }),
        body: UpdateTeamSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await teamService.updateTeam(workspaceId, request.params.id, userId, request.body);
      return reply.send({ data: updated });
    }
  );

  app.post(
    "/teams/:id/members",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Add a member to a team",
        params: z.object({ id: z.string() }),
        body: AddTeamMemberSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const member = await teamService.addMember(workspaceId, request.params.id, userId, request.body);
      return reply.status(201).send({ data: member });
    }
  );

  app.delete(
    "/teams/:id/members/:userId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Remove a member from a team",
        params: z.object({ id: z.string(), userId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: actorUserId } = request.authUser!;
      const res = await teamService.removeMember(workspaceId, request.params.id, actorUserId, request.params.userId);
      return reply.send(res);
    }
  );

  // ==========================================
  // 3. RESOURCE PERMISSIONS
  // ==========================================

  app.post(
    "/permissions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Grant explicit resource-level permission to a user or team",
        body: GrantResourcePermissionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const perm = await permissionService.grantPermission(workspaceId, userId, request.body);
      return reply.status(201).send({ data: perm });
    }
  );

  app.delete(
    "/permissions/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "Revoke a resource permission grant",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const res = await permissionService.revokePermission(workspaceId, userId, request.params.id);
      return reply.send(res);
    }
  );

  app.get(
    "/permissions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Collaboration"],
        summary: "List permissions configured on a resource",
        querystring: z.object({
          resourceType: z.string(),
          resourceId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { resourceType, resourceId } = request.query as { resourceType: string; resourceId: string };
      const grants = await permissionService.listPermissions(workspaceId, resourceType, resourceId);
      return reply.send({ data: grants });
    }
  );

  // ==========================================
  // 4. WORKFLOW STEWARDSHIP & OWNERSHIP INTELLIGENCE
  // ==========================================

  app.patch(
    "/workflows/:id/stewardship",
    {
      preHandler: [authenticateRequest, requireScope("workflows:write")],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Update workflow owner, team steward, criticality, and lifecycle status",
        params: z.object({ id: z.string() }),
        body: UpdateWorkflowStewardshipSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await governanceService.updateWorkflowStewardship(
        workspaceId,
        request.params.id,
        userId,
        request.body
      );
      return reply.send({ data: updated });
    }
  );

  app.get(
    "/governance/ownership-intelligence",
    {
      preHandler: [authenticateRequest, requireScope("governance:read")],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Retrieve ownership intelligence report identifying unmanaged or orphan automations",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const report = await governanceService.getOwnershipIntelligence(workspaceId);
      return reply.send({ data: report });
    }
  );

  // ==========================================
  // 5. COLLABORATIVE WORKFLOW REVIEWS
  // ==========================================

  app.post(
    "/reviews",
    {
      preHandler: [authenticateRequest, requireScope("reviews:write")],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Submit workflow version for collaborative change review",
        body: CreateWorkflowReviewSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const review = await reviewService.createReview(workspaceId, userId, request.body);
      return reply.status(201).send({ data: review });
    }
  );

  app.get(
    "/reviews",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "List reviews in the workspace",
        querystring: z.object({
          status: z.string().optional(),
          workflowId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as { status?: string; workflowId?: string };
      const reviews = await reviewService.listReviews(workspaceId, query);
      return reply.send({ data: reviews });
    }
  );

  app.get(
    "/reviews/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Get single review details with discussion comments",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const review = await reviewService.getReview(workspaceId, request.params.id);
      return reply.send({ data: review });
    }
  );

  app.post(
    "/reviews/:id/decision",
    {
      preHandler: [authenticateRequest, requireScope("reviews:write")],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Record decision on a review (APPROVED, CHANGES_REQUESTED, REJECTED)",
        params: z.object({ id: z.string() }),
        body: DecideWorkflowReviewSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const decided = await reviewService.decideReview(workspaceId, userId, request.params.id, request.body);
      return reply.send({ data: decided });
    }
  );

  app.post(
    "/reviews/:id/comments",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Add a discussion comment to a review",
        params: z.object({ id: z.string() }),
        body: AddReviewCommentSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const comment = await reviewService.addComment(workspaceId, userId, request.params.id, request.body);
      return reply.status(201).send({ data: comment });
    }
  );

  // ==========================================
  // 6. POLICY EVALUATION
  // ==========================================

  app.post(
    "/governance/evaluate",
    {
      preHandler: [authenticateRequest, requireScope("governance:read")],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Evaluate active governance policies against a workflow action",
        body: z.object({
          workflowId: z.string().uuid(),
          action: z.enum(["ACTIVATE", "PROMOTE", "ARCHIVE"]),
          targetEnvironmentId: z.string().optional(),
          releaseArtifactId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await governanceService.evaluatePolicy(workspaceId, request.body);
      return reply.send({ data: result });
    }
  );

  // ==========================================
  // 7. RELIABILITY OBJECTIVES (SLOS) & ERROR BUDGETS
  // ==========================================

  app.post(
    "/reliability/objectives",
    {
      preHandler: [authenticateRequest, requireScope("slo:manage")],
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Create a reliability objective (SLO)",
        body: CreateReliabilityObjectiveSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const objective = await reliabilityService.createObjective(workspaceId, request.body);
      return reply.status(201).send({ data: objective });
    }
  );

  app.get(
    "/reliability/objectives",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Operational Intelligence"],
        summary: "List all active reliability objectives with live evaluation reports",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const objectives = await reliabilityService.listObjectives(workspaceId);
      return reply.send({ data: objectives });
    }
  );

  app.get(
    "/reliability/objectives/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Get evaluated reliability report for a specific SLO",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const report = await reliabilityService.evaluateObjective(workspaceId, request.params.id);
      return reply.send({ data: report });
    }
  );

  app.delete(
    "/reliability/objectives/:id",
    {
      preHandler: [authenticateRequest, requireScope("slo:manage")],
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Delete a reliability objective",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const res = await reliabilityService.deleteObjective(workspaceId, request.params.id);
      return reply.send(res);
    }
  );

  // ==========================================
  // 8. COMPLIANCE EXPORTS & AUDIT
  // ==========================================

  app.get(
    "/compliance/audit-logs",
    {
      preHandler: [authenticateRequest, requireScope("governance:read")],
      schema: {
        tags: ["Compliance & Audit"],
        summary: "Multi-dimensional audit search",
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          actorId: z.string().optional(),
          targetType: z.string().optional(),
          action: z.string().optional(),
          keyword: z.string().optional(),
          page: z.coerce.number().optional().default(1),
          limit: z.coerce.number().optional().default(25),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as any;
      const results = await complianceService.searchAuditLogs(workspaceId, query);
      return reply.send(results);
    }
  );

  app.post(
    "/compliance/exports",
    {
      preHandler: [authenticateRequest, requireScope("governance:write")],
      schema: {
        tags: ["Compliance & Audit"],
        summary: "Create a bounded, sanitized compliance evidence export job",
        body: CreateComplianceExportSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const job = await complianceService.createComplianceExport(workspaceId, userId, request.body);
      return reply.status(201).send({ data: job });
    }
  );

  app.get(
    "/compliance/exports",
    {
      preHandler: [authenticateRequest, requireScope("governance:read")],
      schema: {
        tags: ["Compliance & Audit"],
        summary: "List compliance evidence export jobs for the workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const jobs = await complianceService.listComplianceExports(workspaceId);
      return reply.send({ data: jobs });
    }
  );

  app.get(
    "/compliance/exports/:token/download",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Compliance & Audit"],
        summary: "Download a completed compliance evidence package using a valid download token",
        params: z.object({ token: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evidence = await complianceService.getExportByToken(workspaceId, request.params.token);
      return reply.send(evidence);
    }
  );
}
