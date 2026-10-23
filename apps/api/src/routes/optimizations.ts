import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateOptimizationCandidateSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { workflowOptimizationService } from "../services/workflowOptimizationService.js";

export async function optimizationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Compare baseline vs candidate & create optimization candidate
  app.post(
    "/workflows/:id/optimizations/candidates",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Optimizations"],
        summary: "Compare candidate graph against baseline and generate structural diff & recommendations",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          title: z.string().min(1).max(150),
          summary: z.string().max(1000),
          candidateNodes: z.array(z.any()),
          candidateEdges: z.array(z.any()),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const input = CreateOptimizationCandidateSchema.parse({
        workflowId: id,
        ...request.body,
      });

      const candidate = await workflowOptimizationService.compareAndCreateCandidate(
        workspaceId,
        userId,
        input
      );
      return reply.status(201).send({ data: candidate });
    }
  );

  // 2. List optimization candidates for workflow
  app.get(
    "/workflows/:id/optimizations/candidates",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Optimizations"],
        summary: "List optimization candidates for workflow",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const candidates = await workflowOptimizationService.listCandidates(workspaceId, id);
      return { data: candidates };
    }
  );

  // 3. Get single optimization candidate
  app.get(
    "/optimizations/candidates/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Optimizations"],
        summary: "Get optimization candidate details, structural diff, and metrics",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const candidate = await workflowOptimizationService.getCandidate(workspaceId, id);
      if (!candidate) {
        return reply.status(404).send({ error: "Not Found", message: "Optimization candidate not found" });
      }
      return { data: candidate };
    }
  );

  // 4. Promote candidate to workflow draft version
  app.post(
    "/optimizations/candidates/:id/promote",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Optimizations"],
        summary: "Promote verified optimization candidate to workflow draft version",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const result = await workflowOptimizationService.promoteCandidateToDraft(
        workspaceId,
        userId,
        id
      );
      return reply.send({ data: result });
    }
  );
}
