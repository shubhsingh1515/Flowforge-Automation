import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  UpdateResidencyPolicySchema,
  WorkspaceResidencyPolicySchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { residencyService } from "../services/residencyService.js";

export async function residencyRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Get current workspace residency policy
  app.get(
    "/residency",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Residency"],
        summary: "Get authoritative data residency policy for the active workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await residencyService.getOrCreatePolicy(workspaceId);
      return reply.send({ policy, ...policy });
    }
  );

  // 2. Update workspace residency policy (Owner/Admin)
  app.patch(
    "/residency",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Residency"],
        summary: "Update data residency policy, home region, and permitted processing zones",
        body: UpdateResidencyPolicySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace Owners or Admins can modify data residency policies.",
          statusCode: 403,
        });
      }

      const updated = await residencyService.updatePolicy(workspaceId, userId, request.body);
      return reply.send({ success: true, policy: updated, ...updated });
    }
  );

  // 3. Trigger verifiable residency runtime check
  app.post(
    "/residency/verify",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Residency"],
        summary: "Verify observable data and worker placement against configured policy",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await residencyService.verifyResidency(workspaceId);
      return reply.send(result);
    }
  );
}
