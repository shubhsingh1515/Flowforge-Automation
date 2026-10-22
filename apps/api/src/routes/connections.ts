import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { ConnectAccountSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { z } from "zod";

export async function connectionRoutes(server: FastifyInstance) {
  // 1. List connections
  server.get("/connections", {
    schema: {
      tags: ["Connections"],
      summary: "List connected accounts for current workspace",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;

      const connections = await prisma.connectedAccount.findMany({
        where: { workspaceId },
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
        lastVerifiedAt: c.lastVerifiedAt,
        createdAt: c.createdAt,
      }));

      return { data: safeConnections };
    },
  });

  // 2. Connect account
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

      const connection = await prisma.connectedAccount.create({
        data: {
          workspaceId,
          integrationKey: data.integrationKey,
          name: data.name,
          // Store encrypted/safe credentials (mocked encryption for Phase 1)
          credentials: data.credentials,
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

  // 3. Disconnect connection
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
