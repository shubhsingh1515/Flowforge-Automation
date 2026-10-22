import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { z } from "zod";

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
}
