import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../plugins/auth.js";
import { prisma } from "@flowforge/database";
import { customerRegistryService } from "../services/customerRegistryService.js";
import { customerJourneyService } from "../services/customerJourneyService.js";
import { customerAdoptionService } from "../services/customerAdoptionService.js";
import { customerHealthService } from "../services/customerHealthService.js";
import { customerRiskService } from "../services/customerRiskService.js";
import { customerPlaybookService } from "../services/customerPlaybookService.js";
import { customerCommunicationsService } from "../services/customerCommunicationsService.js";
import {
  CreateCustomerAccountSchema,
  UpdateCustomerAccountSchema,
  CreateCustomerContactSchema,
  LinkExternalIdentitySchema,
  CreateCustomerJourneyDefinitionSchema,
  CreateCustomerJourneyVersionSchema,
  StartCustomerJourneyInstanceSchema,
  ProgressJourneyMilestoneSchema,
  CreateAdoptionMetricSchema,
  ConfigureHealthModelSchema,
  CreateCustomerRiskAssessmentSchema,
  CreateCustomerSuccessTaskSchema,
  UpdateCustomerSuccessTaskSchema,
  CreateCustomerPlaybookDefinitionSchema,
  CreateCustomerPlaybookVersionSchema,
  TriggerCustomerPlaybookSchema,
  CreateCommunicationTemplateSchema,
  RequestCommunicationApprovalSchema,
} from "@flowforge/shared";

export async function customerRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. CUSTOMER REGISTRY & 360 PROFILE
  // ==========================================

  // Create Customer Account
  app.post(
    "/customers",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Create a tenant-isolated customer account",
        body: CreateCustomerAccountSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const account = await customerRegistryService.createAccount(workspaceId, request.body);
      return reply.status(201).send({ data: account });
    }
  );

  // List Customer Accounts
  app.get(
    "/customers",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "List customer accounts with lifecycle and health filters",
        querystring: z.object({
          lifecycleState: z.string().optional(),
          healthStatus: z.string().optional(),
          tier: z.string().optional(),
          ownerUserId: z.string().optional(),
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customerRegistryService.listAccounts(workspaceId, request.query);
      return reply.send({ data: result });
    }
  );

  // Get Customer Account
  app.get(
    "/customers/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Get customer account by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const account = await customerRegistryService.getAccount(workspaceId, request.params.id);
      return reply.send({ data: account });
    }
  );

  // Update Customer Account
  app.patch(
    "/customers/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Update customer account",
        params: z.object({ id: z.string() }),
        body: UpdateCustomerAccountSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await customerRegistryService.updateAccount(workspaceId, request.params.id, request.body);
      return reply.send({ data: updated });
    }
  );

  // Get Customer 360 Profile
  app.get(
    "/customers/:id/360",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Get consolidated Customer 360 profile with data provenance",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const profile = await customerRegistryService.getCustomer360Profile(workspaceId, request.params.id);
      return reply.send({ data: profile });
    }
  );

  // Add Contact
  app.post(
    "/customers/:id/contacts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Add authorized contact to customer account",
        params: z.object({ id: z.string() }),
        body: CreateCustomerContactSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const contact = await customerRegistryService.addContact(workspaceId, request.params.id, request.body);
      return reply.status(201).send({ data: contact });
    }
  );

  // Link External Identity
  app.post(
    "/customers/:id/identities",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Link external CRM, Billing, or Support identity",
        params: z.object({ id: z.string() }),
        body: LinkExternalIdentitySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const identity = await customerRegistryService.linkExternalIdentity(
        workspaceId,
        request.params.id,
        request.body
      );
      return reply.status(201).send({ data: identity });
    }
  );

  // Unlink External Identity
  app.delete(
    "/customers/identities/:identityId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customers"],
        summary: "Unlink external identity",
        params: z.object({ identityId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      await customerRegistryService.unlinkExternalIdentity(workspaceId, request.params.identityId);
      return reply.send({ success: true });
    }
  );

  // ==========================================
  // 2. CUSTOMER JOURNEYS
  // ==========================================

  // Create Journey Definition
  app.post(
    "/customer-journeys/definitions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Create a customer journey definition",
        body: CreateCustomerJourneyDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const def = await customerJourneyService.createDefinition(workspaceId, request.body);
      return reply.status(201).send({ data: def });
    }
  );

  // List Journey Definitions
  app.get(
    "/customer-journeys/definitions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "List customer journey definitions",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const list = await prisma.customerJourneyDefinition.findMany({
        where: { workspaceId },
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      });
      return reply.send({ data: list });
    }
  );

  // Create Journey Version
  app.post(
    "/customer-journeys/definitions/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Create a version for a journey definition",
        params: z.object({ id: z.string() }),
        body: CreateCustomerJourneyVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const version = await customerJourneyService.createVersion(workspaceId, request.params.id, request.body);
      return reply.status(201).send({ data: version });
    }
  );

  // Publish Journey Version
  app.post(
    "/customer-journeys/definitions/:id/versions/:versionNumber/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Publish an immutable journey version",
        params: z.object({ id: z.string(), versionNumber: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const published = await customerJourneyService.publishVersion(
        workspaceId,
        request.params.id,
        request.params.versionNumber
      );
      return reply.send({ data: published });
    }
  );

  // Start Journey Instance
  app.post(
    "/customer-journeys/instances",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Start a customer journey instance with idempotency check",
        body: StartCustomerJourneyInstanceSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const instance = await customerJourneyService.startJourneyInstance(workspaceId, request.body);
      return reply.status(201).send({ data: instance });
    }
  );

  // List Journey Instances
  app.get(
    "/customer-journeys/instances",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "List customer journey instances",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          status: z.string().optional(),
          journeyType: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const instances = await customerJourneyService.listJourneyInstances(workspaceId, request.query);
      return reply.send({ data: instances });
    }
  );

  // Get Journey Instance
  app.get(
    "/customer-journeys/instances/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Get journey instance by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const instance = await customerJourneyService.getJourneyInstance(workspaceId, request.params.id);
      return reply.send({ data: instance });
    }
  );

  // Progress Milestone
  app.post(
    "/customer-journeys/instances/:id/milestones",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Advance or update milestone in an active journey",
        params: z.object({ id: z.string() }),
        body: ProgressJourneyMilestoneSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await customerJourneyService.progressMilestone(workspaceId, request.params.id, request.body);
      return reply.send({ data: updated });
    }
  );

  // Journey Analytics
  app.get(
    "/customer-journeys/analytics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Journeys"],
        summary: "Get journey completion and SLA analytics",
        querystring: z.object({
          definitionId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const analytics = await customerJourneyService.getJourneyAnalytics(workspaceId, request.query.definitionId);
      return reply.send({ data: analytics });
    }
  );

  // ==========================================
  // 3. ADOPTION & HEALTH
  // ==========================================

  // Create Adoption Metric Definition
  app.post(
    "/customer-adoption/metrics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Adoption"],
        summary: "Define an adoption metric",
        body: CreateAdoptionMetricSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const metric = await customerAdoptionService.createMetricDefinition(workspaceId, request.body);
      return reply.status(201).send({ data: metric });
    }
  );

  // List Adoption Metrics
  app.get(
    "/customer-adoption/metrics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Adoption"],
        summary: "List defined adoption metrics",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const metrics = await customerAdoptionService.listMetricDefinitions(workspaceId);
      return reply.send({ data: metrics });
    }
  );

  // Calculate Account Adoption
  app.get(
    "/customer-adoption/:accountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Adoption"],
        summary: "Calculate adoption metrics for a customer account",
        params: z.object({ accountId: z.string() }),
        querystring: z.object({
          windowDays: z.coerce.number().int().min(1).max(365).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const adoption = await customerAdoptionService.calculateAccountAdoption(
        workspaceId,
        request.params.accountId,
        request.query.windowDays
      );
      return reply.send({ data: adoption });
    }
  );

  // Configure Health Model
  app.post(
    "/customer-health/model",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Health"],
        summary: "Configure deterministic customer health model",
        body: ConfigureHealthModelSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const model = await customerHealthService.configureModel(workspaceId, request.body);
      return reply.status(201).send({ data: model });
    }
  );

  // Get Active Health Model
  app.get(
    "/customer-health/model",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Health"],
        summary: "Get active customer health model",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const model = await customerHealthService.getActiveModel(workspaceId);
      return reply.send({ data: model });
    }
  );

  // Evaluate Customer Health
  app.post(
    "/customer-health/evaluate/:accountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Health"],
        summary: "Evaluate customer health based on real telemetry",
        params: z.object({ accountId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const evaluation = await customerHealthService.evaluateHealth(workspaceId, request.params.accountId);
      return reply.send({ data: evaluation });
    }
  );

  // Get Health History
  app.get(
    "/customer-health/history/:accountId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Health"],
        summary: "Get health evaluation history for an account",
        params: z.object({ accountId: z.string() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const history = await customerHealthService.getHealthHistory(
        workspaceId,
        request.params.accountId,
        request.query.limit
      );
      return reply.send({ data: history });
    }
  );

  // ==========================================
  // 4. CUSTOMER RISKS
  // ==========================================

  // Record Risk Assessment
  app.post(
    "/customer-risks",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Risks"],
        summary: "Record evidence-backed customer risk assessment",
        body: CreateCustomerRiskAssessmentSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const risk = await customerRiskService.recordRisk(workspaceId, request.body);
      return reply.status(201).send({ data: risk });
    }
  );

  // List Risk Assessments
  app.get(
    "/customer-risks",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Risks"],
        summary: "List customer risk assessments",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          riskCategory: z.string().optional(),
          severity: z.string().optional(),
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const risks = await customerRiskService.listRisks(workspaceId, request.query);
      return reply.send({ data: risks });
    }
  );

  // Resolve Risk Assessment
  app.post(
    "/customer-risks/:id/resolve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Risks"],
        summary: "Resolve or dismiss a customer risk assessment",
        params: z.object({ id: z.string() }),
        body: z.object({
          status: z.enum(["RESOLVED", "DISMISSED"]).default("RESOLVED"),
          notes: z.string().max(500).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const resolved = await customerRiskService.resolveRisk(
        workspaceId,
        request.params.id,
        request.body.status,
        request.body.notes
      );
      return reply.send({ data: resolved });
    }
  );

  // ==========================================
  // 5. CUSTOMER SUCCESS TASKS
  // ==========================================

  // Create Task
  app.post(
    "/customer-tasks",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Success Tasks"],
        summary: "Create a customer success task",
        body: CreateCustomerSuccessTaskSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const task = await customerPlaybookService.createTask(workspaceId, request.body);
      return reply.status(201).send({ data: task });
    }
  );

  // List Tasks
  app.get(
    "/customer-tasks",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Success Tasks"],
        summary: "List customer success tasks",
        querystring: z.object({
          customerAccountId: z.string().optional(),
          status: z.string().optional(),
          taskType: z.string().optional(),
          priority: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const tasks = await customerPlaybookService.listTasks(workspaceId, request.query);
      return reply.send({ data: tasks });
    }
  );

  // Update Task
  app.patch(
    "/customer-tasks/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Success Tasks"],
        summary: "Update task status, assignment, or resolution notes",
        params: z.object({ id: z.string() }),
        body: UpdateCustomerSuccessTaskSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await customerPlaybookService.updateTask(workspaceId, request.params.id, request.body);
      return reply.send({ data: updated });
    }
  );

  // ==========================================
  // 6. CUSTOMER PLAYBOOKS
  // ==========================================

  // Create Playbook Definition
  app.post(
    "/customer-playbooks/definitions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "Create a customer success playbook definition",
        body: CreateCustomerPlaybookDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const def = await customerPlaybookService.createPlaybookDefinition(workspaceId, request.body);
      return reply.status(201).send({ data: def });
    }
  );

  // List Playbook Definitions
  app.get(
    "/customer-playbooks/definitions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "List customer success playbook definitions",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const defs = await prisma.customerPlaybookDefinition.findMany({
        where: { workspaceId },
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      });
      return reply.send({ data: defs });
    }
  );

  // Create Playbook Version
  app.post(
    "/customer-playbooks/definitions/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "Create a playbook version with steps and loop prevention",
        params: z.object({ id: z.string() }),
        body: CreateCustomerPlaybookVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const version = await customerPlaybookService.createPlaybookVersion(
        workspaceId,
        request.params.id,
        request.body
      );
      return reply.status(201).send({ data: version });
    }
  );

  // Publish Playbook Version
  app.post(
    "/customer-playbooks/definitions/:id/versions/:versionNumber/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "Publish an immutable playbook version",
        params: z.object({ id: z.string(), versionNumber: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const published = await customerPlaybookService.publishPlaybookVersion(
        workspaceId,
        request.params.id,
        request.params.versionNumber
      );
      return reply.send({ data: published });
    }
  );

  // Trigger Playbook
  app.post(
    "/customer-playbooks/definitions/:id/trigger",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "Trigger a playbook run with loop prevention check",
        params: z.object({ id: z.string() }),
        body: TriggerCustomerPlaybookSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const run = await customerPlaybookService.triggerPlaybook(workspaceId, request.params.id, request.body);
      return reply.status(201).send({ data: run });
    }
  );

  // List Playbook Runs
  app.get(
    "/customer-playbooks/runs",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Playbooks"],
        summary: "List customer playbook runs",
        querystring: z.object({
          playbookDefinitionId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const runs = await customerPlaybookService.listPlaybookRuns(workspaceId, request.query.playbookDefinitionId);
      return reply.send({ data: runs });
    }
  );

  // ==========================================
  // 7. COMMUNICATIONS GOVERNANCE
  // ==========================================

  // Create Communication Template
  app.post(
    "/customer-communications/templates",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Communications"],
        summary: "Create an approved customer communication template",
        body: CreateCommunicationTemplateSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const template = await customerCommunicationsService.createTemplate(workspaceId, request.body);
      return reply.status(201).send({ data: template });
    }
  );

  // List Communication Templates
  app.get(
    "/customer-communications/templates",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Communications"],
        summary: "List communication templates",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const templates = await customerCommunicationsService.listTemplates(workspaceId);
      return reply.send({ data: templates });
    }
  );

  // Request Communication Approval
  app.post(
    "/customer-communications/approvals",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Communications"],
        summary: "Draft communication and request authorization with consent check",
        body: RequestCommunicationApprovalSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const approval = await customerCommunicationsService.requestApproval(workspaceId, request.body);
      return reply.status(201).send({ data: approval });
    }
  );

  // Approve Communication (Role-Gated)
  app.post(
    "/customer-communications/approvals/:id/approve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Communications"],
        summary: "Authorize and send customer-facing communication (ADMIN/OWNER only)",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, workspaceRole } = request.authUser!;
      const userId = request.authUser!.userId || request.authUser!.id;
      const approved = await customerCommunicationsService.approveCommunication(
        workspaceId,
        request.params.id,
        userId,
        workspaceRole
      );
      return reply.send({ data: approved });
    }
  );

  // Reject Communication
  app.post(
    "/customer-communications/approvals/:id/reject",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Communications"],
        summary: "Reject a drafted communication",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const rejected = await customerCommunicationsService.rejectCommunication(workspaceId, request.params.id);
      return reply.send({ data: rejected });
    }
  );
}
