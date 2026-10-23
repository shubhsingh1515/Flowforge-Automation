import { FastifyInstance } from "fastify";
import { NotificationQuerySchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { notificationService } from "../services/notifications.js";

export async function notificationRoutes(server: FastifyInstance) {
  // 1. GET /api/v1/notifications
  server.get("/notifications", {
    schema: {
      tags: ["Notifications"],
      summary: "List workspace and user notifications with unread count",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const query = NotificationQuerySchema.parse(request.query || {});
      const result = await notificationService.listNotifications(authUser.workspaceId, authUser.id, query);
      return result;
    },
  });

  // 2. PATCH /api/v1/notifications/:id/read
  server.patch<{ Params: { id: string } }>("/notifications/:id/read", {
    schema: {
      tags: ["Notifications"],
      summary: "Mark a single notification as read",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const success = await notificationService.markAsRead(authUser.workspaceId, request.params.id);
      if (!success) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Notification not found or already marked read.",
        });
      }
      return { success: true };
    },
  });

  // 3. POST /api/v1/notifications/mark-all-read
  server.post("/notifications/mark-all-read", {
    schema: {
      tags: ["Notifications"],
      summary: "Mark all notifications as read for current user and workspace",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const count = await notificationService.markAllAsRead(authUser.workspaceId, authUser.id);
      return { success: true, count };
    },
  });
}
