import { prisma, ExecutionStatus } from "@flowforge/database";
import { OperationalAlertDto, OperationalOverviewDto, QueueHealthMetricsDto } from "@flowforge/shared";
import { redisConnection, getQueueHealth } from "../worker/queue.js";

export class OperationsService {
  /**
   * Builds a live, comprehensive operational overview of platform health, queue backlogs, and metrics.
   */
  public async getOperationalOverview(): Promise<OperationalOverviewDto> {
    const startTime = Date.now();

    // 1. Database Health Check & Latency
    let dbStatus: "healthy" | "unhealthy" = "healthy";
    let dbLatencyMs = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
    } catch (_e) {
      dbStatus = "unhealthy";
    }

    // 2. Redis Health Check & Latency
    let redisStatus: "healthy" | "unhealthy" = "healthy";
    let redisLatencyMs = 0;
    try {
      const rStart = Date.now();
      await redisConnection.ping();
      redisLatencyMs = Date.now() - rStart;
    } catch (_e) {
      redisStatus = "unhealthy";
    }

    // 3. Queue Health Metrics
    const queueData = await getQueueHealth();
    const queueMetrics: QueueHealthMetricsDto = queueData.details || {
      queueName: "workflow-execution",
      status: queueData.status,
      waitingCount: queueData.metrics.waiting,
      activeCount: queueData.metrics.active,
      completedCount: queueData.metrics.completed,
      failedCount: queueData.metrics.failed,
      delayedCount: queueData.metrics.delayed,
      oldestJobAgeSeconds: queueData.metrics.oldestJobAgeSeconds,
      workerCount: queueData.metrics.active > 0 ? 1 : 0,
      isPaused: false,
    };

    // 4. Execution Metrics in Last 1 Hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [lastHourTotal, lastHourSuccess, lastHourFailed, avgDurationAgg] = await Promise.all([
      prisma.workflowExecution.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.workflowExecution.count({ where: { createdAt: { gte: oneHourAgo }, status: ExecutionStatus.SUCCESS } }),
      prisma.workflowExecution.count({ where: { createdAt: { gte: oneHourAgo }, status: ExecutionStatus.FAILED } }),
      prisma.workflowExecution.aggregate({
        where: { createdAt: { gte: oneHourAgo }, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
    ]);

    const failureRatePercent =
      lastHourTotal > 0 ? Math.round((lastHourFailed / lastHourTotal) * 100) : 0;
    const averageDurationMs = Math.round(avgDurationAgg._avg.durationMs || 0);

    // 5. Evaluate Operational Alerts
    const alerts: OperationalAlertDto[] = [];

    // Rule A: Queue Backlog Alert
    if (queueMetrics.waitingCount > 50) {
      alerts.push({
        id: "alert_queue_backlog",
        metric: "queue.waitingCount",
        currentValue: queueMetrics.waitingCount,
        threshold: 50,
        severity: queueMetrics.waitingCount > 200 ? "CRITICAL" : "WARNING",
        message: `High queue backlog: ${queueMetrics.waitingCount} executions waiting in queue.`,
        triggeredAt: new Date().toISOString(),
      });
    }

    // Rule B: Oldest Job Latency Alert
    if (queueMetrics.oldestJobAgeSeconds > 120) {
      alerts.push({
        id: "alert_oldest_job_age",
        metric: "queue.oldestJobAgeSeconds",
        currentValue: queueMetrics.oldestJobAgeSeconds,
        threshold: 120,
        severity: queueMetrics.oldestJobAgeSeconds > 300 ? "CRITICAL" : "WARNING",
        message: `Queue latency delay: oldest waiting execution has been queued for ${queueMetrics.oldestJobAgeSeconds}s.`,
        triggeredAt: new Date().toISOString(),
      });
    }

    // Rule C: High Failure Rate Alert
    if (lastHourTotal >= 5 && failureRatePercent >= 20) {
      alerts.push({
        id: "alert_high_failure_rate",
        metric: "executions.failureRatePercent",
        currentValue: failureRatePercent,
        threshold: 20,
        severity: failureRatePercent >= 50 ? "CRITICAL" : "WARNING",
        message: `Elevated execution failure rate: ${failureRatePercent}% of runs failed in the last hour.`,
        triggeredAt: new Date().toISOString(),
      });
    }

    // Rule D: Infrastructure Degradation
    if (dbStatus === "unhealthy" || redisStatus === "unhealthy") {
      alerts.push({
        id: "alert_infra_degraded",
        metric: "system.infrastructure",
        currentValue: 1,
        threshold: 0,
        severity: "CRITICAL",
        message: `Critical dependency unhealthy: Database=${dbStatus}, Redis=${redisStatus}`,
        triggeredAt: new Date().toISOString(),
      });
    }

    let systemStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";
    if (alerts.some((a) => a.severity === "CRITICAL")) {
      systemStatus = "CRITICAL";
    } else if (alerts.length > 0) {
      systemStatus = "DEGRADED";
    }

    return {
      systemStatus,
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      database: {
        status: dbStatus,
        poolConnected: dbStatus === "healthy",
        latencyMs: dbLatencyMs,
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs,
      },
      queue: queueMetrics,
      executions: {
        lastHourTotal,
        lastHourSuccess,
        lastHourFailed,
        failureRatePercent,
        averageDurationMs,
      },
      activeAlerts: alerts,
    };
  }
}

export const operationsService = new OperationsService();
