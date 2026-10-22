import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { ConnectAccountSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { encryptCredentials } from "../security/encryption.js";
import { tokenManager } from "../integrations/token-manager.js";
import { entitlementService } from "../services/entitlements.js";
import { z } from "zod";

export async function connectionRoutes(server: FastifyInstance) {
  // 1. List connections
  server.get("/connections", {
    schema: {
      tags: ["Connections"],
      summary: "List connected accounts for current workspace",
      querystring: z.object({
        integrationKey: z.string().optional(),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { integrationKey } = request.query as { integrationKey?: string };

      const where: any = { workspaceId };
      if (integrationKey) {
        where.integrationKey = integrationKey;
      }

      const connections = await prisma.connectedAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      // Redact sensitive credentials before returning
      const safeConnections = connections.map((c) => ({
        id: c.id,
        workspaceId: c.workspaceId,
        integrationKey: c.integrationKey,
        name: c.name,
        status: c.status,
        scopes: c.scopes,
        metadata: c.metadata,
        expiresAt: c.expiresAt,
        lastVerifiedAt: c.lastVerifiedAt,
        createdAt: c.createdAt,
      }));

      return { data: safeConnections };
    },
  });

  // 2. Connect account (Manual API Key / Secret)
  server.post("/connections", {
    schema: {
      tags: ["Connections"],
      summary: "Create a new connection with API credentials or token",
      body: ConnectAccountSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const data = ConnectAccountSchema.parse(request.body);

      // Verify integration exists
      const integration = await prisma.integrationDefinition.findUnique({
        where: { key: data.integrationKey },
      });

      if (!integration) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Integration definition not found.",
        });
      }

      // Enforce plan connected accounts quota
      const quota = await entitlementService.canConnectAccount(workspaceId);
      if (!quota.allowed) {
        return reply.status(403).send({
          error: "Forbidden",
          message: quota.reason,
          code: "PLAN_LIMIT_REACHED",
          statusCode: 403,
        });
      }

      // Encrypt credentials at rest
      const encrypted = encryptCredentials(data.credentials);

      const connection = await prisma.connectedAccount.create({
        data: {
          workspaceId,
          integrationKey: data.integrationKey,
          name: data.name,
          credentials: encrypted as any,
          status: "ACTIVE",
          lastVerifiedAt: new Date(),
        },
      });

      return reply.status(201).send({
        connection: {
          id: connection.id,
          workspaceId: connection.workspaceId,
          integrationKey: connection.integrationKey,
          name: connection.name,
          status: connection.status,
          lastVerifiedAt: connection.lastVerifiedAt,
          createdAt: connection.createdAt,
        },
      });
    },
  });

  // 3. Reconnect / Refresh connection
  server.post("/connections/:id/refresh", {
    schema: {
      tags: ["Connections"],
      summary: "Force refresh an authorized connection token",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      try {
        const credentials = await tokenManager.getValidCredentials(workspaceId, id);
        return {
          success: true,
          message: "Token refreshed and verified successfully.",
          verifiedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        return reply.status(400).send({
          error: "Refresh Failed",
          message: err.message,
        });
      }
    },
  });

  // 4. Disconnect connection
  server.delete("/connections/:id", {
    schema: {
      tags: ["Connections"],
      summary: "Disconnect and remove a connected account",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const existing = await prisma.connectedAccount.findFirst({
        where: { id, workspaceId },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Connection not found or already deleted.",
        });
      }

      await prisma.connectedAccount.delete({
        where: { id: existing.id },
      });

      return { success: true, message: "Connection removed successfully." };
    },
  });
}
