import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  RegisterCmekSchema,
  RotateCmekSchema,
  RevokeCmekSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { cmekService } from "../security/cmekService.js";

export async function cmekRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Get current CMEK status and encryption coverage
  app.get(
    "/cmek",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["CMEK"],
        summary: "Get customer-managed encryption key configuration, status, and coverage",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const status = await cmekService.getCmekStatus(workspaceId);
      return reply.send(status);
    }
  );

  // 2. Register or update KMS key reference
  app.post(
    "/cmek/register",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["CMEK"],
        summary: "Register customer KMS key reference (Owner / Admin only)",
        body: RegisterCmekSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace Owners or Admins can register customer encryption keys.",
          statusCode: 403,
        });
      }

      try {
        const config = await cmekService.registerKey(workspaceId, request.body, userId);
        return reply.status(201).send({ success: true, config });
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bad Request",
          message: err.message || "Failed to register KMS key.",
          statusCode: 400,
        });
      }
    }
  );

  // 3. Trigger manual key rotation
  app.post(
    "/cmek/rotate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["CMEK"],
        summary: "Rotate customer encryption key and increment rotation epoch",
        body: RotateCmekSchema.optional().default({}),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace Owners or Admins can rotate encryption keys.",
          statusCode: 403,
        });
      }

      try {
        const result = await cmekService.rotateKey(workspaceId, userId, request.body?.reason);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bad Request",
          message: err.message || "Failed to rotate KMS key.",
          statusCode: 400,
        });
      }
    }
  );

  // 4. Revoke customer encryption key
  app.post(
    "/cmek/revoke",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["CMEK"],
        summary: "Revoke customer encryption key with immediate kill-switch",
        body: RevokeCmekSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace Owners or Admins can revoke encryption keys.",
          statusCode: 403,
        });
      }

      try {
        const result = await cmekService.revokeKey(workspaceId, userId, request.body.reason);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bad Request",
          message: err.message || "Failed to revoke KMS key.",
          statusCode: 400,
        });
      }
    }
  );
}
