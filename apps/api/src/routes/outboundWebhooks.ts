import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateOutboundWebhookSchema, UpdateOutboundWebhookSchema } from "@flowforge/shared";
import { authenticateRequest, requireScope } from "../plugins/auth.js";
import { outboundWebhookService } from "../services/outboundWebhooks.js";

export async function outboundWebhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List outbound webhooks
  app.get(
    "/outbound-webhooks",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "List registered outbound webhook endpoints",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const webhooks = await outboundWebhookService.listWebhooks(workspaceId);
      return reply.send(webhooks);
    }
  );

  // Register outbound webhook endpoint
  app.post(
    "/outbound-webhooks",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Register a new outbound webhook destination URL",
        body: CreateOutboundWebhookSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await outboundWebhookService.createWebhook(workspaceId, request.body);
      return reply.status(201).send(result);
    }
  );

  // Get webhook endpoint details
  app.get(
    "/outbound-webhooks/:id",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Get webhook endpoint details",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const webhook = await outboundWebhookService.getWebhook(request.params.id, workspaceId);
      return reply.send(webhook);
    }
  );

  // Update webhook endpoint
  app.patch(
    "/outbound-webhooks/:id",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Update webhook endpoint settings or events",
        params: z.object({ id: z.string() }),
        body: UpdateOutboundWebhookSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await outboundWebhookService.updateWebhook(request.params.id, workspaceId, request.body);
      return reply.send(updated);
    }
  );

  // Delete webhook endpoint
  app.delete(
    "/outbound-webhooks/:id",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Delete a webhook endpoint",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await outboundWebhookService.deleteWebhook(request.params.id, workspaceId);
      return reply.send(result);
    }
  );

  // Rotate signing secret
  app.post(
    "/outbound-webhooks/:id/rotate-secret",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Rotate HMAC signing secret for a webhook endpoint",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await outboundWebhookService.rotateSecret(request.params.id, workspaceId);
      return reply.send(result);
    }
  );

  // Get recent deliveries
  app.get(
    "/outbound-webhooks/:id/deliveries",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "List recent delivery attempts for a webhook endpoint",
        params: z.object({ id: z.string() }),
        querystring: z.object({
          limit: z.coerce.number().optional().default(20),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const deliveries = await outboundWebhookService.getDeliveries(
        request.params.id,
        workspaceId,
        request.query.limit
      );
      return reply.send(deliveries);
    }
  );

  // Retry delivery
  app.post(
    "/outbound-webhooks/deliveries/:deliveryId/retry",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Redeliver a failed outbound webhook attempt",
        params: z.object({ deliveryId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await outboundWebhookService.redeliver(request.params.deliveryId, workspaceId);
      return reply.send(result);
    }
  );

  // Test ping
  app.post(
    "/outbound-webhooks/:id/test",
    {
      preHandler: [requireScope("webhooks:manage")],
      schema: {
        tags: ["Outbound Webhooks"],
        summary: "Dispatch a test ping to verify endpoint connectivity and HMAC signature",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await outboundWebhookService.sendTestPing(request.params.id, workspaceId);
      return reply.send(result);
    }
  );
}
