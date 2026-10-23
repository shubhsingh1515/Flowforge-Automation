import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { UpdateWorkspaceSchema, UpdateProfileSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";

export async function workspaceRoutes(server: FastifyInstance) {
  // 1. Get current workspace
  server.get("/workspaces/current", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Get current active workspace details",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, isApiKey } = request.authUser!;

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          memberships: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (!workspace) {
        return reply.status(404).send({ error: "Not Found", message: "Workspace not found." });
      }

      return {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          userRole: workspaceRole,
          membersCount: workspace.memberships.length,
          createdAt: workspace.createdAt,
          // Do not leak member emails/names to programmatic API keys
          members: isApiKey
            ? undefined
            : workspace.memberships.map((m) => ({
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
                role: m.role,
              })),
        },
      };
    },
  });

  // 2. Update workspace name
  server.patch("/workspaces/current", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Update current workspace name",
      body: UpdateWorkspaceSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, workspaceRole, isApiKey } = request.authUser!;

      if (isApiKey || (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN")) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can modify workspace settings.",
        });
      }

      const body = UpdateWorkspaceSchema.parse(request.body);

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name: body.name },
      });

      return {
        workspace: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          updatedAt: updated.updatedAt,
        },
      };
    },
  });

  // 3. Update current user profile
  server.patch("/users/me", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Update current authenticated user profile",
      body: UpdateProfileSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { id: userId, isApiKey } = request.authUser!;
      if (isApiKey) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "API keys cannot modify user profiles.",
        });
      }

      const body = UpdateProfileSchema.parse(request.body);

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          name: body.name,
          avatarUrl: (body as any).avatarUrl,
        },
      });

      return {
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          avatarUrl: updated.avatarUrl,
        },
      };
    },
  });
}
