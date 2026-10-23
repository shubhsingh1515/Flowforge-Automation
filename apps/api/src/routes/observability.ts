import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { unifiedHealthService } from "../services/unifiedHealthService.js";
import { predictiveCapacityService } from "../services/predictiveCapacityService.js";
import { sloEngine } from "../services/sloEngine.js";
import { z } from "zod";

export async function observabilityRoutes(server: FastifyInstance) {
  // 1. Unified Health Matrix
  server.get("/observability/unified-health", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Health"],
      summary: "Get unified real-time health scorecard across all subsystems",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const summary = await unifiedHealthService.getUnifiedHealthSummary(workspaceId);
      return { data: summary };
    },
  });

  server.get("/workspaces/:workspaceId/observability/unified-health", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Health"],
      summary: "Get unified real-time health scorecard for specific workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const summary = await unifiedHealthService.getUnifiedHealthSummary(workspaceId);
      return { data: summary };
    },
  });

  // 2. Predictive Capacity Warnings
  server.get("/observability/warnings", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Predictive Capacity"],
      summary: "Get active and historical predictive capacity warnings",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as { isResolved?: string };
      const isResolved =
        query.isResolved !== undefined ? query.isResolved === "true" : undefined;
      const warnings = await predictiveCapacityService.getWarnings(workspaceId, isResolved);
      return { data: warnings };
    },
  });

  server.get("/workspaces/:workspaceId/observability/warnings", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Predictive Capacity"],
      summary: "Get active and historical predictive capacity warnings for workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as { isResolved?: string };
      const isResolved =
        query.isResolved !== undefined ? query.isResolved === "true" : undefined;
      const warnings = await predictiveCapacityService.getWarnings(workspaceId, isResolved);
      return { data: warnings };
    },
  });

  // 3. Evaluate predictive capacity signals
  server.post("/observability/warnings/evaluate", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Predictive Capacity"],
      summary: "Evaluate telemetry trends and generate predictive warnings",
      body: z
        .object({
          regionKey: z.string().default("us-east-1"),
        })
        .optional(),
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const body = (request.body as { regionKey?: string }) || {};
      const warnings = await predictiveCapacityService.evaluatePredictiveSignals(
        workspaceId,
        body.regionKey || "us-east-1"
      );
      return { data: warnings };
    },
  });

  server.post("/workspaces/:workspaceId/observability/warnings/evaluate", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Predictive Capacity"],
      summary: "Evaluate telemetry trends and generate predictive warnings for workspace",
      body: z
        .object({
          regionKey: z.string().default("us-east-1"),
        })
        .optional(),
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const body = (request.body as { regionKey?: string }) || {};
      const warnings = await predictiveCapacityService.evaluatePredictiveSignals(
        workspaceId,
        body.regionKey || "us-east-1"
      );
      return { data: warnings };
    },
  });

  // 4. SLO Evaluation & Error Budget Status
  server.get("/observability/slos", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - SLOs"],
      summary: "Evaluate and retrieve reliability objectives and error budgets",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const results = await sloEngine.evaluateWorkspaceSlos(workspaceId);
      return { data: results };
    },
  });

  server.get("/workspaces/:workspaceId/observability/slos", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - SLOs"],
      summary: "Evaluate and retrieve reliability objectives for workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const results = await sloEngine.evaluateWorkspaceSlos(workspaceId);
      return { data: results };
    },
  });

  server.post("/observability/slos/evaluate", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - SLOs"],
      summary: "Force evaluation of reliability objectives with incident triggering",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const results = await sloEngine.evaluateWorkspaceSlos(workspaceId);
      return { data: results };
    },
  });

  server.post("/workspaces/:workspaceId/observability/slos/evaluate", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - SLOs"],
      summary: "Force evaluation of reliability objectives for workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const results = await sloEngine.evaluateWorkspaceSlos(workspaceId);
      return { data: results };
    },
  });
}
