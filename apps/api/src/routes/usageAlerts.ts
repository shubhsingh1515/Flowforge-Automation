import { FastifyInstance } from "fastify";
import { UsageAlertConfigSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { usageAlertsService } from "../services/usageAlerts.js";

export async function usageAlertRoutes(server: FastifyInstance) {
  // 1. GET /api/v1/usage/forecast
  server.get("/usage/forecast", {
    schema: {
      tags: ["Usage & Quotas"],
      summary: "Get current billing period consumption forecast and daily run rate",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const forecast = await usageAlertsService.getUsageForecast(authUser.workspaceId);
      return { forecast, ...forecast };
    },
  });

  // 2. GET /api/v1/usage/alerts/config
  server.get("/usage/alerts/config", {
    schema: {
      tags: ["Usage & Quotas"],
      summary: "Get workspace usage threshold alert settings and triggered history",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const result = await usageAlertsService.getAlertConfig(authUser.workspaceId);
      return result;
    },
  });

  // 3. PUT /api/v1/usage/alerts/config
  server.put("/usage/alerts/config", {
    schema: {
      tags: ["Usage & Quotas"],
      summary: "Update workspace usage threshold alert preferences",
      body: UsageAlertConfigSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace OWNER or ADMIN roles can update usage alert settings.",
          statusCode: 403,
        });
      }

      const input = UsageAlertConfigSchema.parse(request.body);
      const config = await usageAlertsService.updateAlertConfig(authUser.workspaceId, input);
      return { config, message: "Usage threshold preferences updated successfully." };
    },
  });

  // 4. POST /api/v1/usage/alerts/evaluate
  server.post("/usage/alerts/evaluate", {
    schema: {
      tags: ["Usage & Quotas"],
      summary: "Evaluate current usage against thresholds and dispatch notifications",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const result = await usageAlertsService.evaluateUsageThresholds(authUser.workspaceId);
      return result;
    },
  });
}
