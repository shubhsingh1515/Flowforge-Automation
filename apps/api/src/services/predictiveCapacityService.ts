import { prisma, ExecutionStatus } from "@flowforge/database";
import {
  CapacitySignalType,
  OperationalCapacityWarningDTO,
} from "@flowforge/shared";
import { getQueueHealth } from "../worker/queue.js";
import { outboxService } from "./outboxService.js";
import { config } from "../config.js";

export class PredictiveCapacityService {
  /**
   * Evaluates telemetry signals against baseline thresholds to forecast capacity pressure.
   */
  public async evaluatePredictiveSignals(
    workspaceId?: string,
    regionKey: string = "us-east-1"
  ): Promise<OperationalCapacityWarningDTO[]> {
    const generatedWarnings: any[] = [];

    // 1. Queue Health & Age Signals
    let queueData: any = { metrics: { waiting: 0, active: 0, oldestJobAgeSeconds: 0 } };
    try {
      queueData = await getQueueHealth();
    } catch {
      // Redis might be mock or offline
    }

    const waitingJobs = queueData.metrics?.waiting || 0;
    const activeJobs = queueData.metrics?.active || 0;
    const oldestAgeSec = queueData.metrics?.oldestJobAgeSeconds || 0;

    // Calculate throughput over last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [recentCompletions, recentExecutions] = await Promise.all([
      prisma.workflowExecution.count({
        where: {
          finishedAt: { gte: fiveMinAgo },
          status: { in: [ExecutionStatus.SUCCESS, ExecutionStatus.FAILED] },
          ...(workspaceId ? { workflow: { workspaceId } } : {}),
        },
      }),
      prisma.workflowExecution.count({
        where: {
          createdAt: { gte: fiveMinAgo },
          ...(workspaceId ? { workflow: { workspaceId } } : {}),
        },
      }),
    ]);

    const completionRatePerSec = recentCompletions / 300;
    let projectedDrainTimeSec = 0;
    if (waitingJobs > 0) {
      projectedDrainTimeSec = completionRatePerSec > 0.05
        ? Math.round(waitingJobs / completionRatePerSec)
        : waitingJobs * 5;
    }

    // Baseline definitions
    const BASELINE_QUEUE_AGE_SEC = 5;
    const THRESHOLD_QUEUE_AGE_SEC = 30;

    const BASELINE_DRAIN_TIME_SEC = 10;
    const THRESHOLD_DRAIN_TIME_SEC = 90;

    // Signal: QUEUE_AGE_SPIKE
    if (oldestAgeSec >= THRESHOLD_QUEUE_AGE_SEC) {
      const warning = await this.upsertWarning({
        workspaceId,
        regionKey,
        signalType: "QUEUE_AGE_SPIKE",
        severity: oldestAgeSec > 60 ? "CRITICAL" : "WARNING",
        currentValue: oldestAgeSec,
        baselineValue: BASELINE_QUEUE_AGE_SEC,
        thresholdValue: THRESHOLD_QUEUE_AGE_SEC,
        confidence: recentExecutions > 10 ? "HIGH" : "MEDIUM",
        recommendation: "Scale worker concurrency or inspect slow third-party step handlers.",
      });
      generatedWarnings.push(warning);
    } else {
      await this.resolveWarning(workspaceId, regionKey, "QUEUE_AGE_SPIKE");
    }

    // Signal: DRAIN_TIME_DETERIORATION
    if (projectedDrainTimeSec >= THRESHOLD_DRAIN_TIME_SEC) {
      const warning = await this.upsertWarning({
        workspaceId,
        regionKey,
        signalType: "DRAIN_TIME_DETERIORATION",
        severity: projectedDrainTimeSec > 180 ? "CRITICAL" : "WARNING",
        currentValue: projectedDrainTimeSec,
        baselineValue: BASELINE_DRAIN_TIME_SEC,
        thresholdValue: THRESHOLD_DRAIN_TIME_SEC,
        confidence: recentCompletions > 5 ? "HIGH" : "MEDIUM",
        recommendation: "Job enqueue velocity is exceeding completion capacity. Increase worker nodes.",
      });
      generatedWarnings.push(warning);
    } else {
      await this.resolveWarning(workspaceId, regionKey, "DRAIN_TIME_DETERIORATION");
    }

    // 2. Outbox Accumulation Signal
    const outboxOverview = await outboxService.getOutboxOverview(workspaceId);
    const outboxBacklog = outboxOverview.pendingCount + outboxOverview.deadLetterCount;
    const BASELINE_OUTBOX = 0;
    const THRESHOLD_OUTBOX = 20;

    if (outboxBacklog >= THRESHOLD_OUTBOX) {
      const warning = await this.upsertWarning({
        workspaceId,
        regionKey,
        signalType: "OUTBOX_ACCUMULATION",
        severity: outboxOverview.deadLetterCount > 5 ? "CRITICAL" : "WARNING",
        currentValue: outboxBacklog,
        baselineValue: BASELINE_OUTBOX,
        thresholdValue: THRESHOLD_OUTBOX,
        confidence: "HIGH",
        recommendation: "Dispatch outbox sweep daemon and replay dead-lettered events.",
      });
      generatedWarnings.push(warning);
    } else {
      await this.resolveWarning(workspaceId, regionKey, "OUTBOX_ACCUMULATION");
    }

    // 3. Worker Lease Saturation Signal
    const workerCapacity = config.workerConcurrency || 5;
    const saturationPct = Math.round((activeJobs / (workerCapacity || 1)) * 100);
    const BASELINE_SATURATION = 20;
    const THRESHOLD_SATURATION = 85;

    if (saturationPct >= THRESHOLD_SATURATION) {
      const warning = await this.upsertWarning({
        workspaceId,
        regionKey,
        signalType: "WORKER_LEASE_SATURATION",
        severity: saturationPct >= 100 ? "CRITICAL" : "WARNING",
        currentValue: saturationPct,
        baselineValue: BASELINE_SATURATION,
        thresholdValue: THRESHOLD_SATURATION,
        confidence: "HIGH",
        recommendation: "Worker replicas are near saturation. Scale worker pool horizontally.",
      });
      generatedWarnings.push(warning);
    } else {
      await this.resolveWarning(workspaceId, regionKey, "WORKER_LEASE_SATURATION");
    }

    return generatedWarnings;
  }

  /**
   * Upserts or updates an active capacity warning to prevent alert fatigue.
   */
  private async upsertWarning(params: {
    workspaceId?: string;
    regionKey: string;
    signalType: CapacitySignalType;
    severity: "WARNING" | "CRITICAL";
    currentValue: number;
    baselineValue: number;
    thresholdValue: number;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
    recommendation: string;
  }) {
    const existing = await prisma.operationalCapacityWarning.findFirst({
      where: {
        workspaceId: params.workspaceId || null,
        regionKey: params.regionKey,
        signalType: params.signalType,
        isResolved: false,
      },
    });

    if (existing) {
      return await prisma.operationalCapacityWarning.update({
        where: { id: existing.id },
        data: {
          currentValue: params.currentValue,
          severity: params.severity,
          confidence: params.confidence,
          recommendation: params.recommendation,
        },
      });
    }

    return await prisma.operationalCapacityWarning.create({
      data: {
        workspaceId: params.workspaceId || null,
        regionKey: params.regionKey,
        signalType: params.signalType,
        severity: params.severity,
        currentValue: params.currentValue,
        baselineValue: params.baselineValue,
        thresholdValue: params.thresholdValue,
        confidence: params.confidence,
        recommendation: params.recommendation,
        isResolved: false,
      },
    });
  }

  /**
   * Resolves an active capacity warning when telemetry falls back below threshold.
   */
  private async resolveWarning(
    workspaceId: string | undefined,
    regionKey: string,
    signalType: CapacitySignalType
  ) {
    await prisma.operationalCapacityWarning.updateMany({
      where: {
        workspaceId: workspaceId || null,
        regionKey,
        signalType,
        isResolved: false,
      },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Lists capacity warnings for a workspace or platform region.
   */
  public async getWarnings(workspaceId?: string, isResolved?: boolean) {
    return await prisma.operationalCapacityWarning.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(isResolved !== undefined ? { isResolved } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const predictiveCapacityService = new PredictiveCapacityService();
