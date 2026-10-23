import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { diagnosticsService } from "../services/diagnostics.js";

export async function diagnosticsRoutes(server: FastifyInstance) {
  // 1. Get structured execution diagnostics
  server.get<{ Params: { id: string } }>("/executions/:id/diagnostics", {
    schema: {
      tags: ["Workflow Execution"],
      summary: "Get sanitized execution timeline, failure root-cause analysis, and step metrics",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      try {
        const diagnostics = await diagnosticsService.getExecutionDiagnostics(authUser.workspaceId, request.params.id);
        return { diagnostics };
      } catch (err: any) {
        return reply.status(404).send({
          error: "Not Found",
          message: err.message || "Execution diagnostics not found.",
        });
      }
    },
  });

  // 2. Download execution diagnostics bundle
  server.get<{ Params: { id: string } }>("/executions/:id/download-diagnostics", {
    schema: {
      tags: ["Workflow Execution"],
      summary: "Download sanitized execution diagnostics JSON bundle",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      try {
        const diagnostics = await diagnosticsService.getExecutionDiagnostics(authUser.workspaceId, request.params.id);

        reply.header("Content-Type", "application/json");
        reply.header(
          "Content-Disposition",
          `attachment; filename="execution-${request.params.id}-diagnostics.json"`
        );

        return {
          bundleVersion: "1.0",
          exportedAt: new Date().toISOString(),
          environment: process.env.NODE_ENV || "development",
          ...diagnostics,
        };
      } catch (err: any) {
        return reply.status(404).send({
          error: "Not Found",
          message: err.message || "Failed generating diagnostics download.",
        });
      }
    },
  });
}
