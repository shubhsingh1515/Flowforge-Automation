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
      const { workspaceId, workspaceRole } = request.authUser!;

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
          members: workspace.memberships.map((m) => ({
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
      const { workspaceId, workspaceRole } = request.authUser!;

      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace owners or admins can modify workspace settings.",
        });
      }

      const { name } = UpdateWorkspaceSchema.parse(request.body);

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name },
      });

      return { workspace: { id: updated.id, name: updated.name } };
    },
  });

  // 3. Update user profile
  server.patch("/workspaces/profile", {
    schema: {
      tags: ["Workspace & Settings"],
      summary: "Update user profile information",
      body: UpdateProfileSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { id } = request.authUser!;
      const data = UpdateProfileSchema.parse(request.body);

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, updatedAt: true },
      });

      return { user: updated };
    },
  });
}
