import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { onboardingService } from "../services/onboarding.js";
import { z } from "zod";

export async function onboardingRoutes(server: FastifyInstance) {
  // 1. Get workspace onboarding progress
  server.get("/workspaces/onboarding", {
    schema: {
      tags: ["Onboarding"],
      summary: "Get current onboarding checklist progress and milestone state",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const progress = await onboardingService.getProgress(workspaceId);
      return progress;
    },
  });

  // 2. Update onboarding progress (e.g. dismiss guide)
  server.patch("/workspaces/onboarding", {
    schema: {
      tags: ["Onboarding"],
      summary: "Update onboarding preferences and step completions",
      body: z.object({
        dismissed: z.boolean().optional(),
        hasUsedTemplate: z.boolean().optional(),
        hasTestedWorkflow: z.boolean().optional(),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const body = request.body as any;
      const progress = await onboardingService.updateProgress(workspaceId, body);
      return progress;
    },
  });
}
