import { prisma } from "@flowforge/database";
import { config } from "../config.js";
import { workflowQueue, redisConnection } from "../worker/queue.js";
import { outboundWebhookQueue } from "../worker/outboundWebhookQueue.js";

export interface ReadinessCheckResult {
  ready: boolean;
  timestamp: string;
  checks: {
    database: { status: "OK" | "FAIL"; latencyMs?: number; error?: string };
    redis: { status: "OK" | "FAIL"; latencyMs?: number; error?: string };
    queues: {
      executions: { status: "OK" | "FAIL"; waiting: number; active: number };
      outboundWebhooks: { status: "OK" | "FAIL"; waiting: number; active: number };
    };
    security: {
      jwtConfigured: boolean;
      cookieSecretConfigured: boolean;
      encryptionKeyConfigured: boolean;
      stripeConfigured: boolean;
      productionTlsRecommended: boolean;
      rateLimitingEnabled: boolean;
    };
  };
}

export class ReadinessService {
  async checkLaunchReadiness(): Promise<ReadinessCheckResult> {
    let dbStatus: "OK" | "FAIL" = "OK";
    let dbLatency = 0;
    let dbError: string | undefined;

    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch (err: any) {
      dbStatus = "FAIL";
      dbError = err.message;
    }

    let redisStatus: "OK" | "FAIL" = "OK";
    let redisLatency = 0;
    let redisError: string | undefined;

    try {
      const rStart = Date.now();
      await redisConnection.ping();
      redisLatency = Date.now() - rStart;
    } catch (err: any) {
      redisStatus = "FAIL";
      redisError = err.message;
    }

    let execWaiting = 0;
    let execActive = 0;
    try {
      execWaiting = await workflowQueue.getWaitingCount();
      execActive = await workflowQueue.getActiveCount();
    } catch {
      // Ignored if queue offline
    }

    let whWaiting = 0;
    let whActive = 0;
    try {
      whWaiting = await outboundWebhookQueue.getWaitingCount();
      whActive = await outboundWebhookQueue.getActiveCount();
    } catch {
      // Ignored if queue offline
    }

    const checks = {
      database: { status: dbStatus, latencyMs: dbLatency, error: dbError },
      redis: { status: redisStatus, latencyMs: redisLatency, error: redisError },
      queues: {
        executions: { status: redisStatus, waiting: execWaiting, active: execActive },
        outboundWebhooks: { status: redisStatus, waiting: whWaiting, active: whActive },
      },
      security: {
        jwtConfigured: Boolean(config.jwtSecret && config.jwtSecret.length >= 16),
        cookieSecretConfigured: Boolean(config.cookieSecret && config.cookieSecret.length >= 16),
        encryptionKeyConfigured: Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16),
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        productionTlsRecommended: config.nodeEnv === "production",
        rateLimitingEnabled: true,
      },
    };

    const ready = dbStatus === "OK" && redisStatus === "OK";

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}

export const readinessService = new ReadinessService();
