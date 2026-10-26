import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../plugins/auth.js";
import { strategicAccountService } from "../services/strategicAccountService.js";
import { stakeholderService } from "../services/stakeholderService.js";
import { accountPlanService } from "../services/accountPlanService.js";
import { customerObjectiveService } from "../services/customerObjectiveService.js";
import { strategicInitiativeService } from "../services/strategicInitiativeService.js";
import { executiveReviewService } from "../services/executiveReviewService.js";
import { customerPortfolioService } from "../services/customerPortfolioService.js";
import {
  ConfigureStrategicProfileSchema,
  AssignStakeholderRoleSchema,
  UpdateStakeholderRoleSchema,
  CreateAccountPlanSchema,
  UpdateAccountPlanSchema,
  ApproveAccountPlanSchema,
  CreateSuccessObjectiveSchema,
  UpdateSuccessObjectiveSchema,
  RecordObjectiveEvidenceSchema,
  RecordObjectiveBlockerSchema,
  ResolveObjectiveBlockerSchema,
  CreateStrategicInitiativeSchema,
  UpdateStrategicInitiativeSchema,
  ScheduleExecutiveReviewSchema,
  UpdateExecutiveReviewSchema,
  RecordReviewCommitmentSchema,
  CompleteExecutiveReviewSchema,
} from "@flowforge/shared";

export async function accountPlanningRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. STRATEGIC ACCOUNT PROFILES
  // ==========================================

  // List Strategic Profiles
  app.get(
    "/customer-strategic-profiles",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Account Profiles"],
        summary: "List strategic profiles in workspace",
        querystring: z.object({
          tier: z.any().optional(),
          segment: z.any().optional(),
          search: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const profiles = await strategicAccountService.listProfiles(workspaceId, request.query as any);
      return reply.send({ data: profiles });
    }
  );

  // Get Profile
  app.get(
    "/customer-strategic-profiles/:customerAccountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Account Profiles"],
        summary: "Get strategic profile for a customer account",
        params: z.object({ customerAccountId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const profile = await strategicAccountService.getProfile(workspaceId, request.params.customerAccountId);
      return reply.send({ data: profile });
    }
  );

  // Configure Profile
  app.post(
    "/customer-strategic-profiles/:customerAccountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Account Profiles"],
        summary: "Configure or update strategic account profile",
        params: z.object({ customerAccountId: z.string() }),
        body: ConfigureStrategicProfileSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const profile = await strategicAccountService.configureProfile(
        workspaceId,
        request.params.customerAccountId,
        request.body,
        userId
      );
      return reply.send({ data: profile });
    }
  );

  // Calculate Stakeholder Coverage
  app.get(
    "/customer-strategic-profiles/:customerAccountId/coverage",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Account Profiles"],
        summary: "Get deterministic stakeholder coverage and single-thread risk evaluation",
        params: z.object({ customerAccountId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const coverage = await strategicAccountService.calculateCoverage(workspaceId, request.params.customerAccountId);
      return reply.send({ data: coverage });
    }
  );

  // ==========================================
  // 2. STAKEHOLDERS & RELATIONSHIPS
  // ==========================================

  // List Stakeholders
  app.get(
    "/customer-stakeholders",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Stakeholder Mapping"],
        summary: "List stakeholders for an account",
        querystring: z.object({
          customerAccountId: z.string(),
          includeInactive: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { customerAccountId, includeInactive } = request.query;
      const stakeholders = await stakeholderService.listStakeholders(workspaceId, customerAccountId, {
        includeInactive: includeInactive === "true",
      });
      return reply.send({ data: stakeholders });
    }
  );

  // Assign Stakeholder Role
  app.post(
    "/customer-stakeholders/:customerAccountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Stakeholder Mapping"],
        summary: "Assign stakeholder role to an authorized contact",
        params: z.object({ customerAccountId: z.string() }),
        body: AssignStakeholderRoleSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const relationship = await stakeholderService.assignRole(
        workspaceId,
        request.params.customerAccountId,
        request.body,
        userId
      );
      return reply.status(201).send({ data: relationship });
    }
  );

  // Update Stakeholder Role
  app.patch(
    "/customer-stakeholders/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Stakeholder Mapping"],
        summary: "Update stakeholder role, status, or notes",
        params: z.object({ id: z.string() }),
        body: UpdateStakeholderRoleSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const relationship = await stakeholderService.updateRole(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: relationship });
    }
  );

  // Deactivate Stakeholder Role
  app.delete(
    "/customer-stakeholders/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Stakeholder Mapping"],
        summary: "Deactivate stakeholder role relationship",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const deactivated = await stakeholderService.removeRole(workspaceId, request.params.id, userId);
      return reply.send({ data: deactivated });
    }
  );

  // Get Stakeholder Role History
  app.get(
    "/customer-stakeholders/:id/history",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Stakeholder Mapping"],
        summary: "Get audit history of role changes for a stakeholder relationship",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const history = await stakeholderService.getHistory(workspaceId, request.params.id);
      return reply.send({ data: history });
    }
  );

  // ==========================================
  // 3. STRATEGIC ACCOUNT PLANS
  // ==========================================

  // List Account Plans
  app.get(
    "/customer-account-plans",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "List account plans with optional filters",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          status: z.any().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const plans = await accountPlanService.listPlans(workspaceId, request.query as any);
      return reply.send({ data: plans });
    }
  );

  // Create Account Plan
  app.post(
    "/customer-account-plans",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Create a strategic account plan",
        body: CreateAccountPlanSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const plan = await accountPlanService.createPlan(workspaceId, request.body, userId);
      return reply.status(201).send({ data: plan });
    }
  );

  // Get Account Plan
  app.get(
    "/customer-account-plans/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Get account plan details including objectives and initiatives",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const plan = await accountPlanService.getPlan(workspaceId, request.params.id);
      return reply.send({ data: plan });
    }
  );

  // Update Account Plan
  app.patch(
    "/customer-account-plans/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Update account plan details",
        params: z.object({ id: z.string() }),
        body: UpdateAccountPlanSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const plan = await accountPlanService.updatePlan(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: plan });
    }
  );

  // Update Plan Status (State Transition)
  app.post(
    "/customer-account-plans/:id/status",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Transition account plan status",
        params: z.object({ id: z.string() }),
        body: z.object({ status: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const plan = await accountPlanService.updatePlanStatus(workspaceId, request.params.id, request.body.status as any, userId);
      return reply.send({ data: plan });
    }
  );

  // Approve Account Plan (Consequential Action)
  app.post(
    "/customer-account-plans/:id/approve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Approve account plan, increment version, and create immutable snapshot",
        params: z.object({ id: z.string() }),
        body: ApproveAccountPlanSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const result = await accountPlanService.approvePlan(
        workspaceId,
        request.params.id,
        request.body.changeSummary || undefined,
        userId
      );
      return reply.send({ data: result });
    }
  );

  // Archive Account Plan
  app.post(
    "/customer-account-plans/:id/archive",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Account Plans"],
        summary: "Archive an account plan",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const plan = await accountPlanService.archivePlan(workspaceId, request.params.id, userId);
      return reply.send({ data: plan });
    }
  );

  // ==========================================
  // 4. CUSTOMER SUCCESS OBJECTIVES
  // ==========================================

  // List Objectives
  app.get(
    "/customer-objectives",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "List customer business objectives",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          accountPlanId: z.string().optional(),
          status: z.any().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const objectives = await customerObjectiveService.listObjectives(workspaceId, request.query as any);
      return reply.send({ data: objectives });
    }
  );

  // Create Objective
  app.post(
    "/customer-objectives",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Create a quantifiable customer business objective",
        body: CreateSuccessObjectiveSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const objective = await customerObjectiveService.createObjective(workspaceId, request.body, userId);
      return reply.status(201).send({ data: objective });
    }
  );

  // Get Objective
  app.get(
    "/customer-objectives/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Get objective details with evidence and blockers",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const objective = await customerObjectiveService.getObjective(workspaceId, request.params.id);
      return reply.send({ data: objective });
    }
  );

  // Update Objective
  app.patch(
    "/customer-objectives/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Update objective fields or status",
        params: z.object({ id: z.string() }),
        body: UpdateSuccessObjectiveSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const objective = await customerObjectiveService.updateObjective(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: objective });
    }
  );

  // Record Evidence
  app.post(
    "/customer-objectives/:id/evidence",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Record verified evidence towards an objective",
        params: z.object({ id: z.string() }),
        body: RecordObjectiveEvidenceSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const evidence = await customerObjectiveService.recordEvidence(workspaceId, request.params.id, request.body, userId);
      return reply.status(201).send({ data: evidence });
    }
  );

  // Record Blocker
  app.post(
    "/customer-objectives/:id/blockers",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Record an operational blocker impeding an objective",
        params: z.object({ id: z.string() }),
        body: RecordObjectiveBlockerSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const blocker = await customerObjectiveService.recordBlocker(workspaceId, request.params.id, request.body, userId);
      return reply.status(201).send({ data: blocker });
    }
  );

  // Resolve Blocker
  app.post(
    "/customer-objectives/blockers/:id/resolve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Objectives"],
        summary: "Resolve an operational blocker",
        params: z.object({ id: z.string() }),
        body: ResolveObjectiveBlockerSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const resolved = await customerObjectiveService.resolveBlocker(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: resolved });
    }
  );

  // ==========================================
  // 5. STRATEGIC INITIATIVES & MILESTONES
  // ==========================================

  // List Initiatives
  app.get(
    "/customer-strategic-initiatives",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "List strategic initiatives",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          accountPlanId: z.string().optional(),
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const initiatives = await strategicInitiativeService.listInitiatives(workspaceId, request.query as any);
      return reply.send({ data: initiatives });
    }
  );

  // Create Initiative
  app.post(
    "/customer-strategic-initiatives",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "Create a strategic initiative",
        body: CreateStrategicInitiativeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const initiative = await strategicInitiativeService.createInitiative(workspaceId, request.body, userId);
      return reply.status(201).send({ data: initiative });
    }
  );

  // Get Initiative
  app.get(
    "/customer-strategic-initiatives/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "Get strategic initiative with milestones",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const initiative = await strategicInitiativeService.getInitiative(workspaceId, request.params.id);
      return reply.send({ data: initiative });
    }
  );

  // Update Initiative
  app.patch(
    "/customer-strategic-initiatives/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "Update strategic initiative",
        params: z.object({ id: z.string() }),
        body: UpdateStrategicInitiativeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const initiative = await strategicInitiativeService.updateInitiative(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: initiative });
    }
  );

  // Add Milestone
  app.post(
    "/customer-strategic-initiatives/:id/milestones",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "Add milestone to strategic initiative",
        params: z.object({ id: z.string() }),
        body: z.object({
          title: z.string().min(1),
          targetDate: z.string().datetime(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const milestone = await strategicInitiativeService.addMilestone(workspaceId, request.params.id, request.body, userId);
      return reply.status(201).send({ data: milestone });
    }
  );

  // Update Milestone
  app.patch(
    "/customer-strategic-initiatives/milestones/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Strategic Initiatives"],
        summary: "Update strategic milestone status or target date",
        params: z.object({ id: z.string() }),
        body: z.object({
          title: z.string().optional(),
          targetDate: z.string().datetime().optional(),
          status: z.enum(["PENDING", "COMPLETED", "OVERDUE"]).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const milestone = await strategicInitiativeService.updateMilestone(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: milestone });
    }
  );

  // ==========================================
  // 6. EXECUTIVE BUSINESS REVIEWS (EBR / QBR)
  // ==========================================

  // Prep Snapshot Generator
  app.get(
    "/customer-executive-reviews/prep/:customerAccountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Generate deterministic preparation snapshot for executive review",
        params: z.object({ customerAccountId: z.string() }),
        querystring: z.object({ reviewPeriod: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const snapshot = await executiveReviewService.generatePrepSnapshot(
        workspaceId,
        request.params.customerAccountId,
        request.query.reviewPeriod || "Q1 2027"
      );
      return reply.send({ data: snapshot });
    }
  );

  // List Reviews
  app.get(
    "/customer-executive-reviews",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "List executive reviews with filters",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          status: z.any().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const reviews = await executiveReviewService.listReviews(workspaceId, request.query as any);
      return reply.send({ data: reviews });
    }
  );

  // Schedule Review
  app.post(
    "/customer-executive-reviews",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Schedule an executive review with preparation snapshot",
        body: ScheduleExecutiveReviewSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const review = await executiveReviewService.scheduleReview(workspaceId, request.body, userId);
      return reply.status(201).send({ data: review });
    }
  );

  // Get Review
  app.get(
    "/customer-executive-reviews/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Get executive review details, participants, and commitments",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const review = await executiveReviewService.getReview(workspaceId, request.params.id);
      return reply.send({ data: review });
    }
  );

  // Update Review
  app.patch(
    "/customer-executive-reviews/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Update executive review details or status",
        params: z.object({ id: z.string() }),
        body: UpdateExecutiveReviewSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const review = await executiveReviewService.updateReview(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: review });
    }
  );

  // Complete Review
  app.post(
    "/customer-executive-reviews/:id/complete",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Complete executive review with agreed summary",
        params: z.object({ id: z.string() }),
        body: CompleteExecutiveReviewSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const review = await executiveReviewService.completeReview(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: review });
    }
  );

  // Record Review Commitment
  app.post(
    "/customer-executive-reviews/:id/commitments",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Record action item commitment and link CustomerSuccessTask",
        params: z.object({ id: z.string() }),
        body: RecordReviewCommitmentSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const commitment = await executiveReviewService.recordCommitment(workspaceId, request.params.id, request.body, userId);
      return reply.status(201).send({ data: commitment });
    }
  );

  // Update Review Commitment Status
  app.patch(
    "/customer-executive-reviews/commitments/:id/status",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Executive Reviews"],
        summary: "Update commitment status",
        params: z.object({ id: z.string() }),
        body: z.object({
          status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const commitment = await executiveReviewService.updateCommitmentStatus(workspaceId, request.params.id, request.body.status, userId);
      return reply.send({ data: commitment });
    }
  );

  // ==========================================
  // 7. PORTFOLIO PRIORITIZATION & ANALYTICS
  // ==========================================

  // Portfolio Overview Metrics
  app.get(
    "/customer-portfolio/overview",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Portfolio Prioritization"],
        summary: "Get portfolio-wide executive metrics",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const metrics = await customerPortfolioService.getPortfolioOverview(workspaceId);
      return reply.send({ data: metrics });
    }
  );

  // Prioritized Queue
  app.get(
    "/customer-portfolio/queue",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Portfolio Prioritization"],
        summary: "Get deterministic prioritized account queue",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const queue = await customerPortfolioService.getPrioritizedQueue(workspaceId);
      return reply.send({ data: queue });
    }
  );

  // Recalculate Priority for Account
  app.post(
    "/customer-portfolio/recalculate/:customerAccountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Portfolio Prioritization"],
        summary: "Trigger deterministic priority score recalculation for an account",
        params: z.object({ customerAccountId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evaluation = await strategicAccountService.calculatePortfolioPriority(workspaceId, request.params.customerAccountId);
      return reply.send({ data: evaluation });
    }
  );
}
