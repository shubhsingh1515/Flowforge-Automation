import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  RequestDataExportSchema,
  RequestWorkspaceDeletionSchema,
  UpdateRetentionPolicySchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { dataRetentionService } from "../services/dataRetention.js";

export async function dataRetentionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Get active retention policy
  app.get(
    "/data-retention/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Rights & Retention"],
        summary: "Get current data retention periods for executions, webhooks, and audit logs",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await dataRetentionService.getRetentionPolicy(workspaceId);
      return reply.send(policy);
    }
  );

  // Update retention policy
  app.patch(
    "/data-retention/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Rights & Retention"],
        summary: "Update data retention periods (Admin / Owner only)",
        body: UpdateRetentionPolicySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const updated = await dataRetentionService.updateRetentionPolicy(
        workspaceId,
        userId,
        workspaceRole,
        request.body
      );
      return reply.send(updated);
    }
  );

  // Trigger manual or scheduled cleanup of expired tenant records
  app.post(
    "/data-retention/cleanup",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Rights & Retention"],
        summary: "Trigger a bounded cleanup of records exceeding retention periods",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataRetentionService.cleanupExpiredData(workspaceId);
      return reply.send(result);
    }
  );

  // Request a complete, sanitized workspace data export
  app.post(
    "/data-retention/exports",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Rights & Retention"],
        summary: "Request a complete, sanitized workspace data export (GDPR / CCPA)",
        body: RequestDataExportSchema.optional().default({}),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await dataRetentionService.requestDataExport(
        workspaceId,
        userId,
        request.body || {}
      );
      return reply.status(201).send(result);
    }
  );

  // Request deliberate workspace deletion
  app.post(
    "/data-retention/delete-workspace",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Rights & Retention"],
        summary: "Submit a deliberate workspace deletion request with confirmation phrase (Owner only)",
        body: RequestWorkspaceDeletionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const result = await dataRetentionService.requestWorkspaceDeletion(
        workspaceId,
        userId,
        workspaceRole,
        request.body
      );
      return reply.send(result);
    }
  );
}
