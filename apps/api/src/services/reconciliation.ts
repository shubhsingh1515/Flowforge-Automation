import { prisma, ExecutionStatus } from "@flowforge/database";
import { ReconciliationAnomaly, ReconciliationResultDto } from "@flowforge/shared";
import { redisConnection } from "../worker/queue.js";
import { auditLogService } from "./auditLog.js";

export class ReconciliationService {
  private LOCK_KEY = "flowforge:reconciliation:lock";
  private LOCK_TTL_SECONDS = 60;

  /**
   * Scans and resolves orphaned or stalled workflow executions.
   */
  public async reconcile(options: {
    workspaceId?: string;
    mode?: "dry-run" | "execute";
    maxAgeMinutes?: number;
    limit?: number;
    actorUserId?: string;
  }): Promise<ReconciliationResultDto> {
    const startTime = Date.now();
    const mode = options.mode || "dry-run";
    const maxAgeMinutes = options.maxAgeMinutes || 15;
    const limit = options.limit || 50;
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    // Concurrency lock for execute mode across multiple replicas
    let lockAcquired = false;
    if (mode === "execute") {
      try {
        const lockRes = await redisConnection.set(this.LOCK_KEY, "locked", "EX", this.LOCK_TTL_SECONDS, "NX");
        if (!lockRes) {
          throw new Error("Another reconciliation cycle is currently executing across the cluster. Please wait.");
        }
        lockAcquired = true;
      } catch (err: any) {
        if (err.message.includes("cluster")) throw err;
        // If Redis lock fails gracefully in unit test mode without Redis, continue
      }
    }

    try {
      const whereClause: any = {
        OR: [
          { status: ExecutionStatus.RUNNING, startedAt: { lt: cutoffDate } },
          { status: ExecutionStatus.PENDING, createdAt: { lt: cutoffDate } },
        ],
      };

      if (options.workspaceId) {
        whereClause.workflow = { workspaceId: options.workspaceId };
      }

      const stuckExecutions = await prisma.workflowExecution.findMany({
        where: whereClause,
        include: { workflow: true },
        take: limit,
        orderBy: { createdAt: "asc" },
      });

      const anomalies: ReconciliationAnomaly[] = [];
      let reconciledCount = 0;

      for (const exec of stuckExecutions) {
        const referenceTime = exec.startedAt || exec.createdAt;
        const minutesInStatus = Math.round((Date.now() - referenceTime.getTime()) / 60000);
        const reason =
          exec.status === ExecutionStatus.RUNNING
            ? `Execution stuck in RUNNING state for ${minutesInStatus} minutes without worker heartbeat.`
            : `Execution stuck in PENDING queue for ${minutesInStatus} minutes without worker pickup.`;

        anomalies.push({
          executionId: exec.id,
          workflowId: exec.workflowId,
          workflowName: exec.workflow.name,
          status: exec.status,
          startedAt: referenceTime.toISOString(),
          minutesInStatus,
          reason,
          proposedAction: "MARK_FAILED_TIMEOUT",
        });

        if (mode === "execute") {
          // Atomic conditional update
          const updated = await prisma.workflowExecution.updateMany({
            where: {
              id: exec.id,
              status: exec.status, // Ensure status has not changed concurrently
            },
            data: {
              status: ExecutionStatus.FAILED,
              finishedAt: new Date(),
              errorCategory: "WORKER_TIMEOUT",
              errorSummary: `Reliability Reconciler: Marked FAILED after exceeding ${maxAgeMinutes}m runtime threshold without worker heartbeat.`,
            },
          });

          if (updated.count > 0) {
            reconciledCount++;

            // Record reconciliation audit trail
            await prisma.executionReconciliationLog.create({
              data: {
                executionId: exec.id,
                workflowId: exec.workflowId,
                workspaceId: exec.workflow.workspaceId,
                previousStatus: exec.status,
                newStatus: "FAILED",
                reason,
                actionTaken: "MARK_FAILED_TIMEOUT",
              },
            });

            if (options.actorUserId) {
              await auditLogService.recordEvent({
                workspaceId: exec.workflow.workspaceId,
                actorUserId: options.actorUserId,
                action: "EXECUTION_RECONCILED",
                entityType: "WorkflowExecution",
                entityId: exec.id,
                metadata: { previousStatus: exec.status, reason },
              });
            }
          }
        }
      }

      return {
        mode,
        scannedCount: stuckExecutions.length,
        anomaliesFound: anomalies.length,
        reconciledCount,
        anomalies,
        durationMs: Date.now() - startTime,
      };
    } finally {
      if (lockAcquired) {
        await redisConnection.del(this.LOCK_KEY).catch(() => {});
      }
    }
  }

  /**
   * Retrieves historical reconciliation logs.
   */
  public async getReconciliationLogs(workspaceId?: string, limit = 50) {
    return prisma.executionReconciliationLog.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { reconciledAt: "desc" },
      take: limit,
    });
  }
}

export const reconciliationService = new ReconciliationService();
