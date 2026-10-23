import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { UpdateGovernancePolicySchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { governanceService } from "../services/governance.js";

export async function governanceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Get active governance policy
  app.get(
    "/governance/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Retrieve the active governance policy for the workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const policy = await governanceService.getEffectivePolicy(workspaceId);
      return reply.send(policy);
    }
  );

  // Update workspace governance policy
  app.patch(
    "/governance/policy",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Update workspace governance policies (Admin / Owner only)",
        body: UpdateGovernancePolicySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const updated = await governanceService.updatePolicy(
        workspaceId,
        userId,
        workspaceRole,
        request.body
      );
      return reply.send(updated);
    }
  );

  // Query workspace audit logs
  app.get(
    "/governance/audit-logs",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Enterprise Governance"],
        summary: "Query paginated audit logs for the workspace",
        querystring: z.object({
          page: z.coerce.number().optional().default(1),
          limit: z.coerce.number().optional().default(20),
          action: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await governanceService.queryAuditLogs(workspaceId, request.query);
      return reply.send(result);
    }
  );
}
