import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { z } from "zod";
import { getQueueHealth } from "../worker/queue.js";
import { registry } from "../metrics.js";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", {
    config: { rateLimit: false },
    schema: {
      tags: ["System"],
      summary: "Aggregated health check",
      description: "Returns aggregated health status of API, database, Redis/BullMQ worker, leases, and outbox.",
    },
    handler: async (_req, reply) => {
      let dbStatus = "connected";
      let isDbHealthy = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err: any) {
        dbStatus = "disconnected";
        isDbHealthy = false;
      }

      const queueHealth = await getQueueHealth();
      const isHealthy = isDbHealthy && queueHealth.status !== "unhealthy";

      const [activeLeases, pendingOutbox] = await Promise.all([
        prisma.workflowExecution
          .count({
            where: { status: "RUNNING", leaseExpiresAt: { gte: new Date() } },
          })
          .catch(() => 0),
        prisma.transactionalOutboxEvent
          .count({
            where: { status: "PENDING" },
          })
          .catch(() => 0),
      ]);

      const response = {
        status: isHealthy ? "healthy" : "unhealthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        components: {
          database: { status: dbStatus },
          worker: queueHealth,
          reliability: {
            activeLeases,
            pendingOutbox,
            fencingEnabled: true,
          },
          scale: {
            deploymentTier: "Tier A (Horizontally Scalable Single-Region) / Tier B (Region-Aware Readiness)",
            deploymentRegion: process.env.FLOWFORGE_REGION || "us-east-1",
            isAuthoritativeRegion: (process.env.FLOWFORGE_REGION || "us-east-1") === "us-east-1",
          },
        },
      };

      if (!isHealthy) {
        return reply.status(503).send(response);
      }
      return response;
    },
  });

  server.get("/health/live", {
    config: { rateLimit: false },
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
    config: { rateLimit: false },
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
    config: { rateLimit: false },
    schema: {
      tags: ["System"],
      summary: "Execution Worker and Queue health check",
      description: "Returns Redis and BullMQ queue status and metrics.",
    },
    handler: async () => {
      const health = await getQueueHealth();
      return health;
    },
  });

  server.get("/metrics", {
    config: { rateLimit: false },
    schema: {
      tags: ["System"],
      summary: "Prometheus Metrics Endpoint",
      description: "Exposes application and runtime metrics in Prometheus text exposition format.",
    },
    handler: async (_req, reply) => {
      reply.header("Content-Type", registry.contentType);
      return reply.send(await registry.metrics());
    },
  });
}
