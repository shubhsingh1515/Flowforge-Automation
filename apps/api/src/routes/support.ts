import { FastifyInstance } from "fastify";
import { CustomerFeedbackSchema, SupportBundleRequestSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { supportService } from "../services/support.js";

export async function supportRoutes(server: FastifyInstance) {
  // 1. POST /api/v1/support/bundle
  server.post("/support/bundle", {
    schema: {
      tags: ["Support & Diagnostics"],
      summary: "Generate a sanitized workspace support diagnostics bundle",
      body: SupportBundleRequestSchema.optional(),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const input = SupportBundleRequestSchema.parse(request.body || {});
      const bundle = await supportService.generateSupportBundle(authUser.workspaceId, authUser.id, input);
      return { bundle, ...bundle };
    },
  });

  // 2. GET /api/v1/support/bundle/:id/download
  server.get<{ Params: { id: string } }>("/support/bundle/:id/download", {
    schema: {
      tags: ["Support & Diagnostics"],
      summary: "Download a sanitized support bundle by bundle ID",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      try {
        const payload = await supportService.getSupportBundle(authUser.workspaceId, request.params.id);
        reply.header("Content-Disposition", `attachment; filename="flowforge-support-bundle-${request.params.id}.json"`);
        return payload;
      } catch (err: any) {
        return reply.status(404).send({
          error: "Not Found",
          message: err.message || "Support bundle not found or expired",
        });
      }
    },
  });

  // 3. POST /api/v1/support/feedback
  server.post("/support/feedback", {
    schema: {
      tags: ["Support & Diagnostics"],
      summary: "Submit customer feedback, bug report, or feature request",
      body: CustomerFeedbackSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const input = CustomerFeedbackSchema.parse(request.body);
      try {
        const result = await supportService.submitFeedback(authUser.workspaceId, authUser.id, input);
        return result;
      } catch (err: any) {
        return reply.status(429).send({
          error: "Too Many Requests",
          message: err.message,
        });
      }
    },
  });

  // 4. GET /api/v1/status/public (Unauthenticated public status endpoint)
  server.get("/status/public", {
    schema: {
      tags: ["Public Status"],
      summary: "Get public customer-facing service availability status",
    },
    handler: async () => {
      return supportService.getPublicStatus();
    },
  });
}
