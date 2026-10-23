import { FastifyInstance } from "fastify";
import { AnalyticsQuerySchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { analyticsService } from "../services/analytics.js";

export async function analyticsRoutes(server: FastifyInstance) {
  // GET /api/v1/analytics/overview
  server.get("/analytics/overview", {
    schema: {
      tags: ["Product Analytics"],
      summary: "Get workflow execution analytics, volume over time, and duration percentiles",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const query = AnalyticsQuerySchema.parse(request.query || {});
      const overview = await analyticsService.getWorkspaceAnalytics(authUser.workspaceId, query);
      return { overview, ...overview };
    },
  });
}
