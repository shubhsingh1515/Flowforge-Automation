import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateApiKeySchema } from "@flowforge/shared";
import { authenticateRequest, requireScope } from "../plugins/auth.js";
import { apiKeyService } from "../services/apiKeys.js";

export async function apiKeyRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List all API keys for workspace
  app.get(
    "/api-keys",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["API Keys"],
        summary: "List all API keys for the workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const keys = await apiKeyService.listKeys(workspaceId);
      return reply.send(keys as any);
    }
  );

  // Create a new API key
  app.post(
    "/api-keys",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["API Keys"],
        summary: "Create a new workspace API key",
        body: CreateApiKeySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, isApiKey } = request.authUser!;
      if (isApiKey) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "API keys cannot create other API keys. Use user session.",
          statusCode: 403,
        });
      }

      const result = await apiKeyService.createKey(workspaceId, userId, request.body);
      return reply.status(201).send(result);
    }
  );

  // Rotate an API key
  app.post(
    "/api-keys/:id/rotate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["API Keys"],
        summary: "Rotate an API key (revokes old, issues replacement)",
        params: z.object({
          id: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, isApiKey } = request.authUser!;
      if (isApiKey) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "API keys cannot rotate API keys. Use user session.",
          statusCode: 403,
        });
      }

      const result = await apiKeyService.rotateKey(request.params.id, workspaceId, userId);
      return reply.send(result);
    }
  );

  // Revoke an API key
  app.delete(
    "/api-keys/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["API Keys"],
        summary: "Revoke an API key immediately",
        params: z.object({
          id: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await apiKeyService.revokeKey(request.params.id, workspaceId, userId);
      return reply.send(result);
    }
  );
}
