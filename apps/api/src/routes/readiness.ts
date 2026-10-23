import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { readinessService } from "../services/readiness.js";

export async function readinessRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/health/readiness-check",
    {
      schema: {
        tags: ["Health & Operations"],
        summary: "Comprehensive automated launch-readiness check verifying DB, Redis, Queues, and Security configuration",
      },
    },
    async (_request, reply) => {
      const result = await readinessService.checkLaunchReadiness();
      const statusCode = result.ready ? 200 : 503;
      return reply.status(statusCode).send(result);
    }
  );
}
