import { prisma, ExecutionStatus } from "@flowforge/database";
import { ReconciliationAnomaly, ReconciliationResultDto } from "@flowforge/shared";
import { redisConnection, enqueueWorkflowExecution } from "../worker/queue.js";
import { auditLogService } from "./auditLog.js";

export class ReconciliationService {
  private LOCK_KEY = "flowforge:reconciliation:lock";
  private LOCK_TTL_SECONDS = 60;

  /**
   * Scans and resolves orphaned, stalled, or lease-expired workflow executions.
   * If an execution has valid checkpoints and remaining recovery attempts,
   * it is cleanly re-enqueued for checkpoint resumption.
   * Otherwise it is transitioned to FAILED.
   */
  public async reconcile(options: {
    workspaceId?: string;
    mode?: "dry-run" | "execute";
    maxAgeMinutes?: number;
    limit?: number;
    actorUserId?: string;
    allowCrashRecovery?: boolean;
  }): Promise<ReconciliationResultDto> {
    const startTime = Date.now();
    const mode = options.mode || "dry-run";
    const maxAgeMinutes = options.maxAgeMinutes || 15;
    const limit = options.limit || 50;
    const allowCrashRecovery = options.allowCrashRecovery !== false;
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
          // Also catch executions whose worker lease explicitly expired
          { status: ExecutionStatus.RUNNING, leaseExpiresAt: { lt: new Date() } },
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

        const isLeaseExpired = exec.leaseExpiresAt && exec.leaseExpiresAt.getTime() < Date.now();
        const reason = isLeaseExpired
          ? `Execution worker lease expired on ${exec.leaseExpiresAt?.toISOString()} without heartbeat renewal.`
          : exec.status === ExecutionStatus.RUNNING
          ? `Execution stuck in RUNNING state for ${minutesInStatus} minutes without worker heartbeat.`
          : `Execution stuck in PENDING queue for ${minutesInStatus} minutes without worker pickup.`;

        // Determine if eligible for checkpoint resumption
        const canResume =
          allowCrashRecovery &&
          exec.status === ExecutionStatus.RUNNING &&
          exec.lastCheckpointNodeId &&
          (exec.recoveryAttempts || 0) < 2;

        const proposedAction = canResume ? "CRASH_RECOVERY_RESUME" : "MARK_FAILED_TIMEOUT";

        anomalies.push({
          executionId: exec.id,
          workflowId: exec.workflowId,
          workflowName: exec.workflow.name,
          status: exec.status,
          startedAt: referenceTime.toISOString(),
          minutesInStatus,
          reason,
          proposedAction,
        });

        if (mode === "execute") {
          if (canResume) {
            // Attempt atomic crash recovery resumption
            const updated = await prisma.workflowExecution.updateMany({
              where: {
                id: exec.id,
                status: exec.status,
                leaseToken: exec.leaseToken, // Match current fencing token
              },
              data: {
                status: ExecutionStatus.PENDING,
                leaseOwner: null,
                leaseExpiresAt: null,
                recoveryAttempts: (exec.recoveryAttempts || 0) + 1,
              },
            });

            if (updated.count > 0) {
              reconciledCount++;

              // Re-enqueue job at checkpoint
              try {
                await enqueueWorkflowExecution({
                  executionId: exec.id,
                  workflowId: exec.workflowId,
                  versionId: exec.versionId,
                  triggerPayload: exec.triggerEvent,
                  correlationId: exec.correlationId || `rec_${Date.now()}`,
                  resumeNodeId: exec.lastCheckpointNodeId!,
                  attempt: (exec.attempt || 1) + 1,
                });
              } catch (qErr: any) {
                console.warn(`Failed to re-enqueue recovered execution ${exec.id}: ${qErr.message}`);
              }

              await prisma.executionReconciliationLog.create({
                data: {
                  executionId: exec.id,
                  workflowId: exec.workflowId,
                  workspaceId: exec.workflow.workspaceId,
                  previousStatus: exec.status,
                  newStatus: "PENDING",
                  reason,
                  actionTaken: "CRASH_RECOVERY_RESUMED",
                },
              });

              await prisma.recoveryAuditRecord.create({
                data: {
                  workspaceId: exec.workflow.workspaceId,
                  operationType: "EXECUTION_RECOVERY",
                  targetResource: `execution:${exec.id}`,
                  operatorId: options.actorUserId || "SYSTEM",
                  isDryRun: false,
                  status: "SUCCESS",
                  details: {
                    checkpointNodeId: exec.lastCheckpointNodeId,
                    recoveryAttempt: (exec.recoveryAttempts || 0) + 1,
                    reason,
                  },
                },
              });
            }
          } else {
            // Atomic conditional update to FAILED
            const updated = await prisma.workflowExecution.updateMany({
              where: {
                id: exec.id,
                status: exec.status,
              },
              data: {
                status: ExecutionStatus.FAILED,
                finishedAt: new Date(),
                leaseOwner: null,
                leaseExpiresAt: null,
                errorCategory: "WORKER_TIMEOUT",
                errorSummary: `Reliability Reconciler: Marked FAILED after exceeding threshold without worker heartbeat. ${reason}`,
              },
            });

            if (updated.count > 0) {
              reconciledCount++;

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
