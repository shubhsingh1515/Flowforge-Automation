import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { CreateReleaseArtifactSchema } from "@flowforge/shared";
import { releaseService } from "../services/releases.js";
import { z } from "zod";

export async function releaseRoutes(server: FastifyInstance) {
  // 1. List release artifacts for workflow
  server.get("/workflows/:id/releases", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const releases = await releaseService.listReleaseArtifacts(workspaceId, id);
      return { data: releases };
    },
  });

  // 2. Create release artifact
  server.post("/workflows/:id/releases", {
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};

      const input = CreateReleaseArtifactSchema.parse({
        workflowId: id,
        workflowVersionId: body.workflowVersionId,
        summary: body.summary,
      });

      const artifact = await releaseService.createReleaseArtifact(workspaceId, (userId || "system"), input);
      reply.status(201);
      return { data: artifact };
    },
  });

  // 3. Get release artifact by ID
  server.get("/releases/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const artifact = await releaseService.getReleaseArtifact(workspaceId, id);
      return { data: artifact };
    },
  });
}
