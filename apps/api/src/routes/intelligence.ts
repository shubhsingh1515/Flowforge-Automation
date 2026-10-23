import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateIntelligenceWorkspaceSchema,
  GenerateForecastSchema,
  StartInvestigationSchema,
  CreateDecisionProposalSchema,
  ApproveDecisionProposalSchema,
  RejectDecisionProposalSchema,
  EvaluateOutcomeSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { intelligenceContextService } from "../services/intelligenceContextService.js";
import { insightEngineService } from "../services/insightEngineService.js";
import { predictiveOutcomeService } from "../services/predictiveOutcomeService.js";
import { investigationService } from "../services/investigationService.js";
import { decisionAutomationService } from "../services/decisionAutomationService.js";
import { outcomeEvaluationService } from "../services/outcomeEvaluationService.js";
import { prisma } from "@flowforge/database";

export async function intelligenceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. INTELLIGENCE OVERVIEW & WORKSPACES
  // ==========================================

  // Overview Context
  app.get(
    "/intelligence/overview",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Assemble live intelligence context and operational metrics",
        querystring: z.object({
          timeRangeHours: z.coerce.number().int().min(1).max(720).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const context = await intelligenceContextService.assembleContext(workspaceId, {
        timeRangeHours: request.query.timeRangeHours,
      });
      return reply.send({ data: context });
    }
  );

  // Create Intelligence Workspace
  app.post(
    "/intelligence/workspaces",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Create a persistent business intelligence analysis workspace",
        body: CreateIntelligenceWorkspaceSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const ws = await prisma.intelligenceWorkspace.create({
        data: {
          workspaceId,
          name: request.body.name,
          description: request.body.description,
          businessQuestion: request.body.businessQuestion,
          targetResources: request.body.targetResources,
          timeRangeHours: request.body.timeRangeHours,
          createdById: userId,
        },
      });
      return reply.status(201).send({ data: ws });
    }
  );

  // List Intelligence Workspaces
  app.get(
    "/intelligence/workspaces",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List analysis workspaces",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const workspaces = await prisma.intelligenceWorkspace.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { insights: true, investigations: true, forecasts: true, proposals: true } },
        },
      });
      return reply.send({ data: workspaces });
    }
  );

  // ==========================================
  // 2. INSIGHTS ENGINE
  // ==========================================

  // Trigger Analysis & Generate Insights
  app.post(
    "/intelligence/insights/analyze",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Trigger live evidence-grounded insight generation across FlowForge services",
        body: z
          .object({
            intelligenceWorkspaceId: z.string().uuid().optional(),
            timeRangeHours: z.number().int().min(1).max(720).optional(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const results = await insightEngineService.analyzeWorkspace(workspaceId, request.body);
      return reply.send({ data: results });
    }
  );

  // List Insights
  app.get(
    "/intelligence/insights",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List generated business insights",
        querystring: z.object({
          category: z.string().optional(),
          severity: z.string().optional(),
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const insights = await insightEngineService.listInsights(workspaceId, request.query);
      return reply.send({ data: insights });
    }
  );

  // Get Insight
  app.get(
    "/intelligence/insights/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Get an insight by ID with evidence references",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const insight = await insightEngineService.getInsight(workspaceId, request.params.id);
      return reply.send({ data: insight });
    }
  );

  // Acknowledge Insight
  app.post(
    "/intelligence/insights/:id/acknowledge",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Acknowledge an insight",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const ack = await insightEngineService.acknowledgeInsight(workspaceId, request.params.id, userId);
      return reply.send({ data: ack });
    }
  );

  // Dismiss Insight
  app.post(
    "/intelligence/insights/:id/dismiss",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Dismiss an insight",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const dis = await insightEngineService.dismissInsight(workspaceId, request.params.id);
      return reply.send({ data: dis });
    }
  );

  // Resolve Insight
  app.post(
    "/intelligence/insights/:id/resolve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Resolve an insight",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const res = await insightEngineService.resolveInsight(workspaceId, request.params.id);
      return reply.send({ data: res });
    }
  );

  // Update Insight Status (Generic)
  app.patch(
    "/intelligence/insights/:id/status",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Update status of an insight",
        params: z.object({ id: z.string() }),
        body: z.object({ status: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      if (request.body.status === "ACKNOWLEDGED") {
        const ack = await insightEngineService.acknowledgeInsight(workspaceId, request.params.id, userId);
        return reply.send({ data: ack });
      } else if (request.body.status === "DISMISSED") {
        const dis = await insightEngineService.dismissInsight(workspaceId, request.params.id);
        return reply.send({ data: dis });
      } else if (request.body.status === "RESOLVED") {
        const res = await insightEngineService.resolveInsight(workspaceId, request.params.id);
        return reply.send({ data: res });
      } else {
        const updated = await prisma.businessInsight.update({
          where: { id: request.params.id },
          data: { status: request.body.status },
        });
        return reply.send({ data: updated });
      }
    }
  );

  // ==========================================
  // 3. PREDICTIVE FORECASTING
  // ==========================================

  // Generate Forecast
  app.post(
    "/intelligence/forecasts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Generate a predictive outcome forecast based on historical data",
        body: GenerateForecastSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const forecast = await predictiveOutcomeService.generateForecast(workspaceId, request.body);
      return reply.status(201).send({ data: forecast });
    }
  );

  app.post(
    "/intelligence/forecasts/run",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Run a predictive outcome forecast based on historical data",
        body: GenerateForecastSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const forecast = await predictiveOutcomeService.generateForecast(workspaceId, request.body);
      return reply.status(200).send({ data: forecast });
    }
  );

  // List Forecasts
  app.get(
    "/intelligence/forecasts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List generated forecasts",
        querystring: z.object({
          targetMetric: z.any().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const forecasts = await predictiveOutcomeService.listForecasts(workspaceId, request.query.targetMetric);
      return reply.send({ data: forecasts });
    }
  );

  // ==========================================
  // 4. ROOT-CAUSE INVESTIGATIONS
  // ==========================================

  // Start Investigation
  app.post(
    "/intelligence/investigations",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Perform cross-system correlation to investigate an operational issue",
        body: StartInvestigationSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const inv = await investigationService.startInvestigation(workspaceId, request.body);
      return reply.status(201).send({ data: inv });
    }
  );

  // List Investigations
  app.get(
    "/intelligence/investigations",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List root cause investigations",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const list = await investigationService.listInvestigations(workspaceId);
      return reply.send({ data: list });
    }
  );

  // Get Investigation
  app.get(
    "/intelligence/investigations/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Get an investigation by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const inv = await investigationService.getInvestigation(workspaceId, request.params.id);
      return reply.send({ data: inv });
    }
  );

  // ==========================================
  // 5. DECISION PROPOSALS & ACTIONS
  // ==========================================

  // Create Decision Proposal
  app.post(
    "/intelligence/proposals",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Create a reviewable decision proposal for policy-controlled action",
        body: CreateDecisionProposalSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const prop = await decisionAutomationService.createProposal(workspaceId, request.body, userId);
      return reply.status(201).send({ data: prop });
    }
  );

  // List Proposals
  app.get(
    "/intelligence/proposals",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List decision proposals",
        querystring: z.object({
          status: z.string().optional(),
          actionType: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const props = await decisionAutomationService.listProposals(workspaceId, request.query);
      return reply.send({ data: props });
    }
  );

  // Get Proposal
  app.get(
    "/intelligence/proposals/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Get a decision proposal by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const prop = await decisionAutomationService.getProposal(workspaceId, request.params.id);
      return reply.send({ data: prop });
    }
  );

  // Approve Proposal
  app.post(
    "/intelligence/proposals/:id/approve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Approve a decision proposal (and optionally trigger execution)",
        params: z.object({ id: z.string() }),
        body: ApproveDecisionProposalSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const approved = await decisionAutomationService.approveProposal(
        workspaceId,
        request.params.id,
        request.body,
        { id: userId, role: workspaceRole }
      );
      return reply.send({ data: approved });
    }
  );

  // Reject Proposal
  app.post(
    "/intelligence/proposals/:id/reject",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Reject a decision proposal with reason",
        params: z.object({ id: z.string() }),
        body: RejectDecisionProposalSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const rejected = await decisionAutomationService.rejectProposal(
        workspaceId,
        request.params.id,
        request.body,
        { id: userId, role: workspaceRole }
      );
      return reply.send({ data: rejected });
    }
  );

  // Execute Proposal
  app.post(
    "/intelligence/proposals/:id/execute",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Execute an approved decision proposal",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const executed = await decisionAutomationService.executeProposal(workspaceId, request.params.id);
      return reply.send({ data: executed });
    }
  );

  // ==========================================
  // 6. OUTCOME EVALUATIONS
  // ==========================================

  // Evaluate Outcome
  app.post(
    "/intelligence/outcomes/evaluate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Evaluate post-action business outcome against baseline",
        body: EvaluateOutcomeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evalRes = await outcomeEvaluationService.evaluateOutcome(workspaceId, request.body);
      return reply.status(201).send({ data: evalRes });
    }
  );

  app.post(
    "/intelligence/outcomes/evaluate/:proposalId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "Evaluate post-action business outcome by proposal ID",
        params: z.object({ proposalId: z.string() }),
        body: z.object({
          targetMetric: z.string().optional(),
          evaluationWindowMinutes: z.number().optional(),
        }).optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evalRes = await outcomeEvaluationService.evaluateOutcome(workspaceId, {
        proposalId: request.params.proposalId,
        targetMetric: request.body?.targetMetric || "SUCCESS_RATE",
        evaluationWindowMinutes: request.body?.evaluationWindowMinutes || 60,
      });
      return reply.status(200).send({ data: evalRes });
    }
  );

  // List Outcome Evaluations
  app.get(
    "/intelligence/outcomes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Intelligence"],
        summary: "List decision outcome evaluations",
        querystring: z.object({
          proposalId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evals = await outcomeEvaluationService.listEvaluations(workspaceId, request.query.proposalId);
      return reply.send({ data: evals });
    }
  );
}
