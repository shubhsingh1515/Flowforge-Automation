import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../plugins/auth.js";
import { customerContractService } from "../services/customerContractService.js";
import { customerRenewalService } from "../services/customerRenewalService.js";
import { renewalRiskService } from "../services/renewalRiskService.js";
import { customerExpansionService } from "../services/customerExpansionService.js";
import { customerRevenuePolicyService } from "../services/customerRevenuePolicyService.js";
import {
  CreateCustomerContractSchema,
  UpdateCustomerContractSchema,
  CreateRenewalOpportunitySchema,
  UpdateRenewalOpportunityStageSchema,
  RecordRenewalOutcomeSchema,
  CreateExpansionOpportunitySchema,
  QualifyExpansionOpportunitySchema,
  UpdateExpansionStageSchema,
  ConfigureRevenuePolicySchema,
} from "@flowforge/shared";

export async function revenueRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. CUSTOMER CONTRACTS
  // ==========================================

  // Create Contract
  app.post(
    "/customer-contracts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Contracts"],
        summary: "Create a customer contract with start, term end, and renewal parameters",
        body: CreateCustomerContractSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const contract = await customerContractService.createContract(workspaceId, request.body, userId);
      return reply.status(201).send({ data: contract });
    }
  );

  // List Contracts
  app.get(
    "/customer-contracts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Contracts"],
        summary: "List contracts for a workspace with optional filters",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const contracts = await customerContractService.listContracts(workspaceId, {
        customerAccountId: request.query.customerAccountId,
        status: request.query.status as any,
      });
      return reply.send({ data: contracts });
    }
  );

  // Get Contract by ID
  app.get(
    "/customer-contracts/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Contracts"],
        summary: "Retrieve a customer contract by ID or contract number",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const contract = await customerContractService.getContract(workspaceId, request.params.id);
      return reply.send({ data: contract });
    }
  );

  // Update Contract
  app.patch(
    "/customer-contracts/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Contracts"],
        summary: "Update an existing customer contract with auditable change tracking",
        params: z.object({ id: z.string() }),
        body: UpdateCustomerContractSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const updated = await customerContractService.updateContract(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // Get Contract Change History
  app.get(
    "/customer-contracts/:id/changes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Contracts"],
        summary: "Retrieve immutable change history log for a contract",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const changes = await customerContractService.getContractChanges(workspaceId, request.params.id);
      return reply.send({ data: changes });
    }
  );

  // ==========================================
  // 2. RENEWAL OPPORTUNITIES & WORKFLOW
  // ==========================================

  // Create Renewal Opportunity
  app.post(
    "/customer-renewals",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Create a renewal opportunity for a customer contract",
        body: CreateRenewalOpportunitySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const opportunity = await customerRenewalService.createOpportunity(workspaceId, request.body, userId);
      return reply.status(201).send({ data: opportunity });
    }
  );

  // List Renewal Opportunities
  app.get(
    "/customer-renewals",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "List renewal opportunities with optional filtering by contract, account, or stage",
        querystring: z.object({
          contractId: z.string().optional(),
          customerAccountId: z.string().optional(),
          stage: z.string().optional(),
          riskClassification: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const opportunities = await customerRenewalService.listOpportunities(workspaceId, {
        contractId: request.query.contractId,
        customerAccountId: request.query.customerAccountId,
        stage: request.query.stage,
        riskClassification: request.query.riskClassification,
      });
      return reply.send({ data: opportunities });
    }
  );

  // Get Renewal Opportunity by ID
  app.get(
    "/customer-renewals/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Retrieve a renewal opportunity by ID with contract and account details",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const opportunity = await customerRenewalService.getOpportunity(workspaceId, request.params.id);
      return reply.send({ data: opportunity });
    }
  );

  // Update Renewal Stage
  app.patch(
    "/customer-renewals/:id/stage",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Advance renewal stage with governed lifecycle transition validation",
        params: z.object({ id: z.string() }),
        body: UpdateRenewalOpportunityStageSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const updated = await customerRenewalService.updateStage(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // Record Renewal Outcome
  app.post(
    "/customer-renewals/:id/outcome",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Finalize renewal outcome (RENEWED or LOST) and instantiate successor contract if renewed",
        params: z.object({ id: z.string() }),
        body: RecordRenewalOutcomeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const result = await customerRenewalService.recordOutcome(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: result });
    }
  );

  // Get Renewal Timeline
  app.get(
    "/customer-renewals/:id/timeline",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Retrieve complete chronological timeline of events for a renewal opportunity",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const timeline = await customerRenewalService.getTimeline(workspaceId, request.params.id);
      return reply.send({ data: timeline });
    }
  );

  // ==========================================
  // 3. RENEWAL RISK EVALUATIONS
  // ==========================================

  // Evaluate Renewal Risk
  app.post(
    "/customer-renewals/:id/evaluate-risk",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Run deterministic renewal risk evaluation combining health, usage, tickets, and milestones",
        params: z.object({ id: z.string() }),
        body: z
          .object({
            dryRun: z.boolean().optional(),
            triggerReason: z.string().optional(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const evaluation = await renewalRiskService.evaluateRenewalRisk(
        workspaceId,
        request.params.id,
        "1.0",
        userId
      );
      return reply.send({ data: evaluation });
    }
  );

  // Get Risk History
  app.get(
    "/customer-renewals/:id/risk-history",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Renewals"],
        summary: "Retrieve versioned history of renewal risk evaluations for an opportunity",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const history = await renewalRiskService.getRiskHistory(workspaceId, request.params.id);
      return reply.send({ data: history });
    }
  );

  // ==========================================
  // 4. EXPANSION OPPORTUNITIES
  // ==========================================

  // Create Expansion Opportunity
  app.post(
    "/customer-expansion",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "Register a detected expansion opportunity with supporting evidence signals",
        body: CreateExpansionOpportunitySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const opportunity = await customerExpansionService.createOpportunity(workspaceId, request.body, userId);
      return reply.status(201).send({ data: opportunity });
    }
  );

  // List Expansion Opportunities
  app.get(
    "/customer-expansion",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "List expansion opportunities for workspace with optional filters",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          stage: z.string().optional(),
          opportunityType: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const opportunities = await customerExpansionService.listOpportunities(workspaceId, {
        customerAccountId: request.query.customerAccountId,
        stage: request.query.stage,
        opportunityType: request.query.opportunityType,
      });
      return reply.send({ data: opportunities });
    }
  );

  // Get Expansion Opportunity by ID
  app.get(
    "/customer-expansion/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "Retrieve expansion opportunity with account details and progression history",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const opportunity = await customerExpansionService.getOpportunity(workspaceId, request.params.id);
      return reply.send({ data: opportunity });
    }
  );

  // Qualify Expansion Opportunity
  app.post(
    "/customer-expansion/:id/qualify",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "Human qualification checkpoint to advance detected opportunity to QUALIFIED or DISMISSED",
        params: z.object({ id: z.string() }),
        body: QualifyExpansionOpportunitySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const qualified = await customerExpansionService.qualifyOpportunity(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: qualified });
    }
  );

  // Update Expansion Stage
  app.patch(
    "/customer-expansion/:id/stage",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "Advance expansion opportunity through governed commercial stages",
        params: z.object({ id: z.string() }),
        body: UpdateExpansionStageSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const updated = await customerExpansionService.updateStage(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // Get Expansion Stage History
  app.get(
    "/customer-expansion/:id/history",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Expansion"],
        summary: "Retrieve immutable stage progression history for an expansion opportunity",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const history = await customerExpansionService.getStageHistory(workspaceId, request.params.id);
      return reply.send({ data: history });
    }
  );

  // ==========================================
  // 5. REVENUE POLICY & EXECUTIVE OVERVIEW
  // ==========================================

  // Get Revenue Policy
  app.get(
    "/customer-revenue/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Revenue Policy"],
        summary: "Retrieve workspace revenue policy for renewal milestones, thresholds, and task rules",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await customerRevenuePolicyService.getPolicy(workspaceId);
      return reply.send({ data: policy });
    }
  );

  // Configure Revenue Policy
  app.put(
    "/customer-revenue/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Revenue Policy"],
        summary: "Configure or update workspace revenue policy parameters",
        body: ConfigureRevenuePolicySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const policy = await customerRevenuePolicyService.configurePolicy(workspaceId, request.body, userId);
      return reply.send({ data: policy });
    }
  );

  // Generate Scheduled Milestone Tasks
  app.post(
    "/customer-revenue/generate-tasks",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Revenue Policy"],
        summary: "Evaluate contracts and generate deterministic, deduplicated renewal milestone tasks",
        body: z
          .object({
            contractId: z.string().optional(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const result = await customerRevenuePolicyService.generateScheduledRenewalTasks(
        workspaceId,
        request.body?.contractId,
        userId
      );
      return reply.send({ data: result });
    }
  );

  // Get Revenue Overview & Metrics
  app.get(
    "/revenue/overview",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Revenue Overview"],
        summary: "Comprehensive, currency-aware revenue overview metrics for executive dashboards",
        querystring: z.object({
          currency: z.string().optional().default("USD"),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const currency = request.query.currency || "USD";
      const overview = await customerRevenuePolicyService.getRevenueOverview(workspaceId, currency);
      return reply.send({ data: overview });
    }
  );
}
