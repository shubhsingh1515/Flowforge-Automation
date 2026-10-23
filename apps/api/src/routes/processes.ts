import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateProcessDefinitionSchema,
  UpdateProcessDefinitionSchema,
  IngestProcessEventSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { processDefinitionService } from "../services/processDefinitionService.js";
import { processInstanceService } from "../services/processInstanceService.js";
import { processMiningService } from "../services/processMiningService.js";
import { processSlaService } from "../services/processSlaService.js";

export async function processRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Create a new Business Process Definition
  app.post(
    "/processes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Create a cross-workflow business process definition",
        body: CreateProcessDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const definition = await processDefinitionService.createProcessDefinition(
        workspaceId,
        userId,
        request.body
      );
      return reply.status(201).send({ data: definition });
    }
  );

  // 2. List Business Process Definitions
  app.get(
    "/processes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "List all business process definitions in workspace",
        querystring: z.object({
          businessDomain: z.string().optional(),
          criticality: z.string().optional(),
          lifecycleStatus: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const definitions = await processDefinitionService.listProcessDefinitions(
        workspaceId,
        request.query
      );
      return reply.send({ data: definitions });
    }
  );

  // 3. Get Process Definition by ID or slug
  app.get(
    "/processes/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Get business process definition by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const definition = await processDefinitionService.getProcessDefinition(
        workspaceId,
        request.params.id
      );
      return reply.send({ data: definition });
    }
  );

  // 4. Update Process Definition
  app.patch(
    "/processes/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Update process definition metadata and governance fields",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateProcessDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await processDefinitionService.updateProcessDefinition(
        workspaceId,
        request.params.id,
        userId,
        request.body
      );
      return reply.send({ data: updated });
    }
  );

  // 5. Create new immutable version for process definition
  app.post(
    "/processes/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Publish a new immutable version of a process definition",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          milestones: z.array(z.any()).min(1),
          correlationRules: z.array(z.any()).default([]),
          outcomeMappings: z.array(z.any()).default([]),
          targetSlaDurationMs: z.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await processDefinitionService.createProcessVersion(
        workspaceId,
        request.params.id,
        userId,
        request.body
      );
      return reply.status(201).send({ data: result });
    }
  );

  // 6. Diff versions of a process definition
  app.get(
    "/processes/:id/versions/diff",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Compute structural diff between two process definition versions",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          v1: z.coerce.number().int().positive(),
          v2: z.coerce.number().int().positive(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const diff = await processDefinitionService.diffVersions(
        workspaceId,
        request.params.id,
        request.query.v1,
        request.query.v2
      );
      return reply.send({ data: diff });
    }
  );

  // 7. Ingest correlated milestone/outcome event
  app.post(
    "/processes/events/ingest",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Ingest milestone or outcome event into correlated process instance",
        body: IngestProcessEventSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await processInstanceService.ingestEvent(workspaceId, request.body);
      return reply.send({ data: result });
    }
  );

  // 8. List process instances
  app.get(
    "/processes/:id/instances",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "List instances of a business process",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          status: z.string().optional(),
          limit: z.coerce.number().int().positive().optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await processInstanceService.listInstances(
        workspaceId,
        request.params.id,
        request.query
      );
      return reply.send({ data: result });
    }
  );

  // 9. Get specific instance details & timeline
  app.get(
    "/processes/instances/:instanceId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Get process instance timeline, events, and outcome details",
        params: z.object({ instanceId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const instance = await processInstanceService.getInstance(
        workspaceId,
        request.params.instanceId
      );
      return reply.send({ data: instance });
    }
  );

  // 10. Cancel an active process instance
  app.post(
    "/processes/instances/:instanceId/cancel",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Manually cancel an in-progress or waiting process instance",
        params: z.object({ instanceId: z.string().uuid() }),
        body: z.object({
          reason: z.string().max(250).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await processInstanceService.cancelInstance(
        workspaceId,
        request.params.instanceId,
        userId,
        request.body.reason
      );
      return reply.send({ data: updated });
    }
  );

  // 11. Process Mining & Discovery
  app.get(
    "/processes/:id/mining",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Mine execution logs for observed paths, transition frequencies, bottlenecks, and recommendations",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          timeRangeDays: z.coerce.number().int().positive().default(30),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await processMiningService.mineProcess(
        workspaceId,
        request.params.id,
        request.query.timeRangeDays
      );
      return reply.send({ data: result });
    }
  );

  // 12. Process Metrics & SLA Summary
  app.get(
    "/processes/:id/metrics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Get aggregated process duration, throughput, and deadline metrics",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          timeRangeDays: z.coerce.number().int().positive().default(30),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const metrics = await processMiningService.getProcessMetrics(
        workspaceId,
        request.params.id,
        request.query.timeRangeDays
      );
      return reply.send({ data: metrics });
    }
  );

  // 13. Create or update Process SLA Policy
  app.post(
    "/processes/:id/sla-policies",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Configure SLA policy for a business process",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(120),
          targetDurationMs: z.number().int().positive(),
          warningThresholdMs: z.number().int().positive(),
          maxApprovalWaitMs: z.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await processSlaService.createOrUpdatePolicy(workspaceId, {
        processDefinitionId: request.params.id,
        ...request.body,
      });
      return reply.status(201).send({ data: policy });
    }
  );

  // 14. Get Process SLA Policy
  app.get(
    "/processes/:id/sla-policies",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Business Processes"],
        summary: "Get configured SLA policy for a business process",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await processSlaService.getPolicy(workspaceId, request.params.id);
      return reply.send({ data: policy });
    }
  );
}
