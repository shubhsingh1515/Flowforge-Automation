import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  TransactionalOutboxEventDto,
  OutboxOverviewDto,
  ReplayOutboxInput,
} from "@flowforge/shared";
import { outboundWebhookService } from "./outboundWebhooks.js";

export class OutboxService {
  /**
   * Enqueues an event into the transactional outbox.
   * Can accept a Prisma transaction client ($tx) so that business entity writes
   * and event emission are guaranteed to commit atomically.
   */
  async enqueueEvent(
    data: {
      workspaceId: string;
      eventType: string;
      payload: any;
      idempotencyKey?: string;
    },
    client: any = prisma
  ): Promise<any> {
    const idempotencyKey =
      data.idempotencyKey ||
      `outbox_${data.workspaceId}_${data.eventType}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    try {
      return await client.transactionalOutboxEvent.create({
        data: {
          workspaceId: data.workspaceId,
          eventType: data.eventType,
          payload: data.payload || {},
          idempotencyKey,
          status: "PENDING",
          attempts: 0,
          maxAttempts: 5,
        },
      });
    } catch (err: any) {
      // If unique constraint on idempotencyKey tripped, fetch and return existing event
      if (err.code === "P2002") {
        return await client.transactionalOutboxEvent.findUnique({
          where: { idempotencyKey },
        });
      }
      throw err;
    }
  }

  /**
   * Sweeps and processes pending or due-for-retry outbox events.
   * Dispatches events to subscribers (including outbound webhooks) with exponential backoff & jitter.
   */
  async processPendingEvents(limit = 50): Promise<{
    processed: number;
    delivered: number;
    failed: number;
    deadLettered: number;
  }> {
    const now = new Date();

    // Fetch eligible events (PENDING or FAILED where nextRetryAt <= now)
    const events = await prisma.transactionalOutboxEvent.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      take: limit,
      orderBy: { createdAt: "asc" },
    });

    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of events) {
      // Mark as PROCESSING
      await prisma.transactionalOutboxEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSING" },
      });

      try {
        // Dispatch to outbound webhooks if applicable
        if (event.eventType.startsWith("execution.") || event.eventType.startsWith("workflow.")) {
          await outboundWebhookService.emitEvent(
            event.workspaceId,
            event.eventType as any,
            event.payload
          );
        }

        // Successfully delivered
        await prisma.transactionalOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            lastError: null,
          },
        });
        delivered++;
      } catch (err: any) {
        failed++;
        const nextAttempt = event.attempts + 1;
        const errorMsg = err.message || "Unknown dispatch failure";

        if (nextAttempt >= event.maxAttempts) {
          // Terminal failure: transition to DEAD_LETTER
          await prisma.transactionalOutboxEvent.update({
            where: { id: event.id },
            data: {
              status: "DEAD_LETTER",
              attempts: nextAttempt,
              lastError: errorMsg,
            },
          });
          deadLettered++;
        } else {
          // Exponential backoff with jitter: 2^attempt * 1000ms + (0-500ms)
          const backoffMs = Math.pow(2, nextAttempt) * 1000 + Math.floor(Math.random() * 500);
          const nextRetryAt = new Date(Date.now() + backoffMs);

          await prisma.transactionalOutboxEvent.update({
            where: { id: event.id },
            data: {
              status: "FAILED",
              attempts: nextAttempt,
              nextRetryAt,
              lastError: errorMsg,
            },
          });
        }
      }
    }

    return {
      processed: events.length,
      delivered,
      failed,
      deadLettered,
    };
  }

  /**
   * Replays dead-lettered outbox events.
   */
  async replayDeadLetterEvents(
    workspaceId?: string,
    input: Partial<ReplayOutboxInput> = {}
  ): Promise<{ replayedCount: number }> {
    const where: any = {
      status: "DEAD_LETTER",
    };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }
    if (input.eventIds && input.eventIds.length > 0) {
      where.id = { in: input.eventIds };
    }

    const eligible = await prisma.transactionalOutboxEvent.findMany({
      where,
      take: input.limit || 50,
      select: { id: true },
    });

    if (eligible.length === 0) {
      return { replayedCount: 0 };
    }

    const result = await prisma.transactionalOutboxEvent.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: {
        status: "PENDING",
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
      },
    });

    return { replayedCount: result.count };
  }

  /**
   * Returns overview metrics and recent events for the transactional outbox.
   */
  async getOutboxOverview(workspaceId?: string): Promise<OutboxOverviewDto> {
    const baseWhere: any = workspaceId ? { workspaceId } : {};

    const [pendingCount, processingCount, deliveredCount, deadLetterCount, oldestPending, recent] =
      await Promise.all([
        prisma.transactionalOutboxEvent.count({ where: { ...baseWhere, status: "PENDING" } }),
        prisma.transactionalOutboxEvent.count({ where: { ...baseWhere, status: "PROCESSING" } }),
        prisma.transactionalOutboxEvent.count({ where: { ...baseWhere, status: "DELIVERED" } }),
        prisma.transactionalOutboxEvent.count({ where: { ...baseWhere, status: "DEAD_LETTER" } }),
        prisma.transactionalOutboxEvent.findFirst({
          where: { ...baseWhere, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.transactionalOutboxEvent.findMany({
          where: baseWhere,
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    const oldestPendingAgeSeconds = oldestPending
      ? Math.max(0, Math.round((Date.now() - oldestPending.createdAt.getTime()) / 1000))
      : 0;

    return {
      pendingCount,
      processingCount,
      deliveredCount,
      deadLetterCount,
      oldestPendingAgeSeconds,
      recentEvents: recent.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        eventType: r.eventType,
        payload: (r.payload as any) || {},
        idempotencyKey: r.idempotencyKey,
        status: r.status as any,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        nextRetryAt: r.nextRetryAt ? r.nextRetryAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        lastError: r.lastError,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}

export const outboxService = new OutboxService();
