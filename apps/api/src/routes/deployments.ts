import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import {
  PromoteReleaseSchema,
  DecideDeploymentSchema,
  RollbackDeploymentSchema,
} from "@flowforge/shared";
import { deploymentService } from "../services/deployments.js";
import { z } from "zod";

export async function deploymentRoutes(server: FastifyInstance) {
  // 1. List deployments
  server.get("/deployments", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as { environmentId?: string; workflowId?: string };
      const deployments = await deploymentService.listDeployments(
        workspaceId,
        query.environmentId,
        query.workflowId
      );
      return { data: deployments };
    },
  });

  // 2. Pre-flight validation
  server.post("/deployments/validate", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const body = request.body as { releaseArtifactId: string; environmentId: string };
      if (!body.releaseArtifactId || !body.environmentId) {
        throw new Error("releaseArtifactId and environmentId are required.");
      }
      const validation = await deploymentService.validateReleaseForEnvironment(
        workspaceId,
        body.releaseArtifactId,
        body.environmentId
      );
      return { data: validation };
    },
  });

  // 3. Promote release
  server.post("/deployments/promote", {
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const auth = request.authUser!;
      const userId = auth.id || "system";
      const userRole = auth.workspaceRole || "MEMBER";
      const input = PromoteReleaseSchema.parse(request.body);
      const deployment = await deploymentService.promoteRelease(
        auth.workspaceId,
        userId,
        userRole,
        input
      );
      reply.status(201);
      return { data: deployment };
    },
  });

  // 4. Get deployment by ID
  server.get("/deployments/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const deployment = await deploymentService.getDeployment(workspaceId, id);
      return { data: deployment };
    },
  });

  // 5. Decide deployment approval
  server.post("/deployments/:id/decision", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const auth = request.authUser!;
      const userId = auth.id || "system";
      const userRole = auth.workspaceRole || "MEMBER";
      const { id } = request.params as { id: string };
      const input = DecideDeploymentSchema.parse(request.body);
      const decided = await deploymentService.decideDeploymentApproval(
        auth.workspaceId,
        id,
        userId,
        userRole,
        input.decision,
        input.comment
      );
      return { data: decided };
    },
  });

  // 6. Rollback deployment
  server.post("/deployments/rollback", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const auth = request.authUser!;
      const userId = auth.id || "system";
      const userRole = auth.workspaceRole || "MEMBER";
      const input = RollbackDeploymentSchema.parse(request.body);
      const rollback = await deploymentService.rollbackDeployment(
        auth.workspaceId,
        userId,
        userRole,
        input
      );
      return { data: rollback };
    },
  });
}
