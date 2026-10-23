import { prisma } from "@flowforge/database";
import { CreateEventReplayJobInput } from "@flowforge/shared";
import { eventDeliveryService } from "./eventDeliveryService.js";
import { auditLogService } from "./auditLog.js";

export class EventReplayService {
  /**
   * Creates and executes a controlled event replay or backfill job
   */
  async createAndRunReplayJob(
    workspaceId: string,
    userId: string,
    input: CreateEventReplayJobInput
  ) {
    const where: any = {
      workspaceId,
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
      ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
      ...(input.eventType ? { event: { eventType: input.eventType } } : {}),
      ...(input.fromDate || input.toDate
        ? {
            createdAt: {
              ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
              ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
            },
          }
        : {}),
    };

    const matchingDeliveries = await prisma.eventDelivery.findMany({
      where,
      select: { id: true, status: true },
      take: 200, // Safe bounded batch
    });

    const totalEvents = matchingDeliveries.length;

    const job = await prisma.eventReplayJob.create({
      data: {
        workspaceId,
        name: input.name,
        status: input.isDryRun ? "COMPLETED" : "RUNNING",
        filterCriteria: input as any,
        isDryRun: input.isDryRun,
        totalEvents,
        processedEvents: 0,
        succeededEvents: 0,
        failedEvents: 0,
        startedAt: new Date(),
        completedAt: input.isDryRun ? new Date() : null,
        createdById: userId,
      },
    });

    if (input.isDryRun) {
      return job;
    }

    // Execute replay asynchronously or sequentially
    let succeeded = 0;
    let failed = 0;

    for (const d of matchingDeliveries) {
      try {
        const result = await eventDeliveryService.replayDelivery(workspaceId, d.id);
        if (result.status === "DELIVERED") {
          succeeded++;
        } else {
          failed++;
        }
      } catch (_err) {
        failed++;
      }
    }

    const updatedJob = await prisma.eventReplayJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        processedEvents: totalEvents,
        succeededEvents: succeeded,
        failedEvents: failed,
        completedAt: new Date(),
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "EVENT_REPLAY_JOB_COMPLETED",
      targetType: "EVENT_REPLAY_JOB",
      targetId: job.id,
      metadata: { totalEvents, succeeded, failed, isDryRun: input.isDryRun },
    });

    return updatedJob;
  }

  /**
   * Retrieves a replay job by ID
   */
  async getReplayJob(workspaceId: string, jobId: string) {
    const job = await prisma.eventReplayJob.findFirst({
      where: { id: jobId, workspaceId },
    });

    if (!job) {
      throw new Error(`Replay job '${jobId}' not found.`);
    }

    return job;
  }

  /**
   * Lists replay jobs in a workspace
   */
  async listReplayJobs(workspaceId: string) {
    return await prisma.eventReplayJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}

export const eventReplayService = new EventReplayService();
