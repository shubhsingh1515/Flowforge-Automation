import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  IngestEventSchema,
  BatchIngestEventsSchema,
  CreateEventSchemaDefinitionSchema,
  CreateEventSchemaVersionSchema,
  CreateEventSubscriptionSchema,
  UpdateEventSubscriptionSchema,
  CreateEventReplayJobSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { eventSchemaRegistryService } from "../services/eventSchemaRegistryService.js";
import { eventSubscriptionService } from "../services/eventSubscriptionService.js";
import { eventDeliveryService } from "../services/eventDeliveryService.js";
import { eventIngestionService } from "../services/eventIngestionService.js";
import { eventReplayService } from "../services/eventReplayService.js";
import { eventObservabilityService } from "../services/eventObservabilityService.js";

export async function eventRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. EVENT INGESTION & QUERIES
  // ==========================================

  // Ingest single event
  app.post(
    "/events/ingest",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Ingest a single business event into the platform fabric",
        body: IngestEventSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await eventIngestionService.ingestSingleEvent(workspaceId, request.body);
      const statusCode = result.status === "REJECTED" ? 422 : result.status === "DUPLICATE" ? 200 : 201;
      return reply.status(statusCode).send({ data: result });
    }
  );

  // Ingest batch events
  app.post(
    "/events/ingest/batch",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Ingest a bounded batch of business events (max 100)",
        body: BatchIngestEventsSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await eventIngestionService.ingestBatch(workspaceId, request.body.events);
      return reply.status(200).send({ data: result });
    }
  );

  // List events
  app.get(
    "/events",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "List ingested business events with filtering and pagination",
        querystring: z.object({
          eventType: z.string().optional(),
          correlationId: z.string().optional(),
          source: z.string().optional(),
          limit: z.coerce.number().int().positive().optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await eventIngestionService.listEvents(workspaceId, request.query);
      return reply.send({ data: result });
    }
  );

  // Get specific event
  app.get(
    "/events/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get platform event details and delivery dispatches by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const event = await eventIngestionService.getEvent(workspaceId, request.params.id);
      return reply.send({ data: event });
    }
  );

  // ==========================================
  // 2. SCHEMA REGISTRY & GOVERNANCE
  // ==========================================

  // Register new schema definition
  app.post(
    "/events/schemas",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Register a new event schema definition with initial version",
        body: CreateEventSchemaDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const definition = await eventSchemaRegistryService.createSchemaDefinition(
        workspaceId,
        userId,
        request.body
      );
      return reply.status(201).send({ data: definition });
    }
  );

  // List schema definitions
  app.get(
    "/events/schemas",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "List event schema catalog in workspace",
        querystring: z.object({
          businessDomain: z.string().optional(),
          status: z.string().optional(),
          search: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const definitions = await eventSchemaRegistryService.listSchemaDefinitions(
        workspaceId,
        request.query
      );
      return reply.send({ data: definitions });
    }
  );

  // Get schema definition by eventType
  app.get(
    "/events/schemas/:eventType",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get event schema definition and active version by eventType",
        params: z.object({ eventType: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const definition = await eventSchemaRegistryService.getSchemaDefinition(
        workspaceId,
        request.params.eventType
      );
      if (!definition) {
        return reply.status(404).send({ error: "NotFound", message: "Schema definition not found." });
      }
      return reply.send({ data: definition });
    }
  );

  // Create new schema version
  app.post(
    "/events/schemas/:eventType/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Draft a new schema version for an event type with compatibility validation",
        params: z.object({ eventType: z.string() }),
        body: CreateEventSchemaVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await eventSchemaRegistryService.createSchemaVersion(
        workspaceId,
        request.params.eventType,
        userId,
        request.body
      );
      return reply.status(201).send({ data: result });
    }
  );

  // Publish schema version
  app.post(
    "/events/schemas/:eventType/versions/:version/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Publish an immutable schema version and make it active",
        params: z.object({
          eventType: z.string(),
          version: z.coerce.number().int().positive(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await eventSchemaRegistryService.publishSchemaVersion(
        workspaceId,
        request.params.eventType,
        request.params.version,
        userId
      );
      return reply.send({ data: result });
    }
  );

  // ==========================================
  // 3. EVENT SUBSCRIPTIONS
  // ==========================================

  // Create subscription
  app.post(
    "/events/subscriptions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Create an event subscription with declarative filter routing",
        body: CreateEventSubscriptionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const subscription = await eventSubscriptionService.createSubscription(
        workspaceId,
        userId,
        request.body
      );
      return reply.status(201).send({ data: subscription });
    }
  );

  // List subscriptions
  app.get(
    "/events/subscriptions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "List event subscriptions in workspace",
        querystring: z.object({
          status: z.string().optional(),
          destinationType: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const subscriptions = await eventSubscriptionService.listSubscriptions(
        workspaceId,
        request.query
      );
      return reply.send({ data: subscriptions });
    }
  );

  // Get subscription by ID
  app.get(
    "/events/subscriptions/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get subscription details and delivery statistics",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const subscription = await eventSubscriptionService.getSubscription(
        workspaceId,
        request.params.id
      );
      return reply.send({ data: subscription });
    }
  );

  // Update subscription
  app.patch(
    "/events/subscriptions/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Update subscription rules, filters, or destination configuration",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateEventSubscriptionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await eventSubscriptionService.updateSubscription(
        workspaceId,
        request.params.id,
        userId,
        request.body
      );
      return reply.send({ data: updated });
    }
  );

  // Pause subscription
  app.post(
    "/events/subscriptions/:id/pause",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Pause subscription delivery processing",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await eventSubscriptionService.pauseSubscription(
        workspaceId,
        request.params.id,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // Resume subscription
  app.post(
    "/events/subscriptions/:id/resume",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Resume paused subscription delivery processing",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const updated = await eventSubscriptionService.resumeSubscription(
        workspaceId,
        request.params.id,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // ==========================================
  // 4. DELIVERIES & DEAD-LETTER
  // ==========================================

  // List deliveries
  app.get(
    "/events/deliveries",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "List event delivery records with status and error filtering",
        querystring: z.object({
          status: z.string().optional(),
          subscriptionId: z.string().uuid().optional(),
          limit: z.coerce.number().int().positive().optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await eventDeliveryService.listDeliveries(workspaceId, request.query);
      return reply.send({ data: result });
    }
  );

  // Get delivery details
  app.get(
    "/events/deliveries/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get delivery details and attempt history",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const delivery = await eventDeliveryService.getDelivery(workspaceId, request.params.id);
      return reply.send({ data: delivery });
    }
  );

  // Replay a specific delivery
  app.post(
    "/events/deliveries/:id/replay",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Manually replay a dead-letter or failed event delivery",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await eventDeliveryService.replayDelivery(workspaceId, request.params.id);
      return reply.send({ data: result });
    }
  );

  // ==========================================
  // 5. REPLAY JOBS & BACKFILL
  // ==========================================

  // Create replay job
  app.post(
    "/events/replay-jobs",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Create a bounded dead-letter replay or backfill job",
        body: CreateEventReplayJobSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const job = await eventReplayService.createAndRunReplayJob(
        workspaceId,
        userId,
        request.body
      );
      return reply.status(201).send({ data: job });
    }
  );

  // Get replay job
  app.get(
    "/events/replay-jobs/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get replay job status and progress",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const job = await eventReplayService.getReplayJob(workspaceId, request.params.id);
      return reply.send({ data: job });
    }
  );

  // List replay jobs
  app.get(
    "/events/replay-jobs",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "List replay and backfill jobs in workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const jobs = await eventReplayService.listReplayJobs(workspaceId);
      return reply.send({ data: jobs });
    }
  );

  // ==========================================
  // 6. PIPELINE OBSERVABILITY & METRICS
  // ==========================================

  // Get event metrics
  app.get(
    "/events/metrics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Event Fabric"],
        summary: "Get event pipeline metrics, throughput, latency, and dead-letter count",
        querystring: z.object({
          timeRangeHours: z.coerce.number().int().positive().default(24),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const metrics = await eventObservabilityService.getMetrics(
        workspaceId,
        request.query.timeRangeHours
      );
      return reply.send({ data: metrics });
    }
  );
}
