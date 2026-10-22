import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { z } from "zod";
import { getQueueHealth } from "../worker/queue.js";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health/live", {
    schema: {
      tags: ["System"],
      summary: "Liveness probe",
      description: "Returns 200 OK if the API server process is alive.",
      response: {
        200: z.object({
          status: z.string(),
          timestamp: z.string(),
          uptime: z.number(),
        }),
      },
    },
    handler: async () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },
  });

  server.get("/health/ready", {
    schema: {
      tags: ["System"],
      summary: "Readiness probe",
      description: "Checks connectivity to PostgreSQL database and system dependencies.",
      response: {
        200: z.object({
          status: z.string(),
          database: z.string(),
          timestamp: z.string(),
        }),
        503: z.object({
          status: z.string(),
          database: z.string(),
          error: z.string(),
        }),
      },
    },
    handler: async (_req, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: "ready",
          database: "connected",
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        return reply.status(503).send({
          status: "not_ready",
          database: "disconnected",
          error: err?.message || "Database connection failed",
        });
      }
    },
  });

  server.get("/health/worker", {
    schema: {
      tags: ["System"],
      summary: "Execution Worker and Queue health check",
      description: "Returns Redis and BullMQ queue status and metrics.",
      response: {
        200: z.object({
          status: z.string(),
          redisStatus: z.string(),
          metrics: z.object({
            waiting: z.number(),
            active: z.number(),
            completed: z.number(),
            failed: z.number(),
          }),
        }),
      },
    },
    handler: async () => {
      const health = await getQueueHealth();
      return health;
    },
  });
}
