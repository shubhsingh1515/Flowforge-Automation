import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateChaosExperimentSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { chaosEngineeringService } from "../services/chaosEngineeringService.js";

export async function chaosRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Create a controlled chaos experiment (validates non-production target)
  app.post(
    "/chaos/experiments",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "Create controlled chaos experiment for non-production environment",
        body: CreateChaosExperimentSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const experiment = await chaosEngineeringService.createExperiment(workspaceId, userId, request.body);
      return reply.status(201).send({ data: experiment });
    }
  );

  // 2. List chaos experiments for workspace
  app.get(
    "/chaos/experiments",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "List chaos experiments in workspace",
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const experiments = await chaosEngineeringService.listExperiments(workspaceId);
      return { data: experiments };
    }
  );

  // 3. Get single chaos experiment
  app.get(
    "/chaos/experiments/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "Get chaos experiment details",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const experiment = await chaosEngineeringService.getExperiment(workspaceId, id);
      if (!experiment) {
        return reply.status(404).send({ error: "Not Found", message: "Chaos experiment not found" });
      }
      return { data: experiment };
    }
  );

  // 4. Approve chaos experiment
  app.post(
    "/chaos/experiments/:id/approve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "Approve a non-production chaos experiment",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const approved = await chaosEngineeringService.approveExperiment(workspaceId, userId, id);
      return reply.send({ data: approved });
    }
  );

  // 5. Start chaos experiment execution
  app.post(
    "/chaos/experiments/:id/start",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "Execute approved chaos experiment and trigger recovery evaluation",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const executed = await chaosEngineeringService.startExperiment(workspaceId, userId, id);
      return reply.send({ data: executed });
    }
  );

  // 6. Stop chaos experiment (emergency abort & cleanup)
  app.post(
    "/chaos/experiments/:id/stop",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Chaos"],
        summary: "Abort active chaos experiment and ensure immediate resource cleanup",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const aborted = await chaosEngineeringService.stopExperiment(workspaceId, userId, id);
      return reply.send({ data: aborted });
    }
  );
}
