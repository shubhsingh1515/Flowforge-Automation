import { prisma } from "@flowforge/database";
import {
  AnalyticsQueryInput,
  WorkflowAnalyticsOverview,
  VolumeDataPoint,
  TopErrorCategory,
  MostExecutedWorkflow,
  RepeatedFailureWorkflow,
  IntegrationFailureMetric,
} from "@flowforge/shared";
import { entitlementService } from "./entitlements.js";

export class AnalyticsService {
  async getWorkspaceAnalytics(
    workspaceId: string,
    query: AnalyticsQueryInput
  ): Promise<WorkflowAnalyticsOverview> {
    const now = new Date();
    let startTime: Date;
    let endTime: Date = now;
    let bucketInterval: "hour" | "day" = "day";

    // 1. Determine time range boundaries
    switch (query.timeRange) {
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        bucketInterval = "hour";
        break;
      case "30d":
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        bucketInterval = "day";
        break;
      case "90d":
        startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        bucketInterval = "day";
        break;
      case "custom":
        startTime = query.startDate ? new Date(query.startDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (query.endDate) endTime = new Date(query.endDate);
        bucketInterval = (endTime.getTime() - startTime.getTime()) <= 48 * 60 * 60 * 1000 ? "hour" : "day";
        break;
      case "7d":
      default:
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        bucketInterval = "day";
        break;
    }

    const durationMsWindow = endTime.getTime() - startTime.getTime();
    const prevWindowStart = new Date(startTime.getTime() - durationMsWindow);
    const prevWindowEnd = startTime;

    // 2. Base filter scoped to tenant workspace
    const baseWhere: any = {
      workflow: { workspaceId },
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
    };

    if (query.workflowId) {
      baseWhere.workflowId = query.workflowId;
    }

    if (query.status && query.status !== "ALL") {
      baseWhere.status = query.status;
    }

    if (query.errorCategory) {
      baseWhere.errorCategory = query.errorCategory;
    }

    // 3. Current period aggregation counts
    const [totalExecutions, successfulExecutions, failedExecutions, cancelledExecutions, runningExecutions] =
      await Promise.all([
        prisma.workflowExecution.count({ where: baseWhere }),
        prisma.workflowExecution.count({ where: { ...baseWhere, status: "SUCCESS" } }),
        prisma.workflowExecution.count({ where: { ...baseWhere, status: "FAILED" } }),
        prisma.workflowExecution.count({ where: { ...baseWhere, status: "CANCELLED" } }),
        prisma.workflowExecution.count({ where: { ...baseWhere, status: "RUNNING" } }),
      ]);

    const completedTotal = successfulExecutions + failedExecutions + cancelledExecutions;
    const successRatePercent = completedTotal > 0 ? Math.round((successfulExecutions / completedTotal) * 100) : 100;
    const failureRatePercent = completedTotal > 0 ? Math.round((failedExecutions / completedTotal) * 100) : 0;

    // 4. Previous period trend comparison
    const prevWhere: any = {
      workflow: { workspaceId },
      createdAt: { gte: prevWindowStart, lt: prevWindowEnd },
    };
    if (query.workflowId) prevWhere.workflowId = query.workflowId;

    const [prevTotal, prevSuccessful, prevFailed] = await Promise.all([
      prisma.workflowExecution.count({ where: prevWhere }),
      prisma.workflowExecution.count({ where: { ...prevWhere, status: "SUCCESS" } }),
      prisma.workflowExecution.count({ where: { ...prevWhere, status: "FAILED" } }),
    ]);

    const prevCompleted = prevSuccessful + prevFailed;
    const prevSuccessRate = prevCompleted > 0 ? (prevSuccessful / prevCompleted) * 100 : 100;

    const executionsChangePercent =
      prevTotal > 0 ? Math.round(((totalExecutions - prevTotal) / prevTotal) * 100) : totalExecutions > 0 ? 100 : 0;
    const successRateChangePercent = Math.round(successRatePercent - prevSuccessRate);

    // 5. Duration Percentiles (p50, p90, p99)
    const durations = await prisma.workflowExecution.findMany({
      where: {
        ...baseWhere,
        status: "SUCCESS",
        durationMs: { not: null },
      },
      select: { durationMs: true },
      orderBy: { durationMs: "asc" },
      take: 2000, // Bounded
    });

    let p50 = 0;
    let p90 = 0;
    let p99 = 0;
    if (durations.length > 0) {
      const getPercentile = (p: number) => {
        const index = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length));
        return durations[index].durationMs || 0;
      };
      p50 = getPercentile(50);
      p90 = getPercentile(90);
      p99 = getPercentile(99);
    }

    // 6. Volume Over Time Bucketing
    const executionsForVolume = await prisma.workflowExecution.findMany({
      where: baseWhere,
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    const volumeMap = new Map<string, { total: number; success: number; failed: number }>();

    for (const ex of executionsForVolume) {
      const d = ex.createdAt;
      let bucketKey: string;
      if (bucketInterval === "hour") {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const hour = String(d.getUTCHours()).padStart(2, "0");
        bucketKey = `${year}-${month}-${day} ${hour}:00`;
      } else {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        bucketKey = `${year}-${month}-${day}`;
      }

      const existing = volumeMap.get(bucketKey) || { total: 0, success: 0, failed: 0 };
      existing.total += 1;
      if (ex.status === "SUCCESS") existing.success += 1;
      if (ex.status === "FAILED") existing.failed += 1;
      volumeMap.set(bucketKey, existing);
    }

    const volumeOverTime: VolumeDataPoint[] = Array.from(volumeMap.entries()).map(([bucket, data]) => ({
      bucket,
      timestamp: new Date(bucket).toISOString(),
      total: data.total,
      success: data.success,
      failed: data.failed,
    }));

    // 7. Top Error Categories
    const failedExecutionsRecords = await prisma.workflowExecution.findMany({
      where: {
        ...baseWhere,
        status: "FAILED",
        errorCategory: { not: null },
      },
      select: { errorCategory: true },
      take: 1000,
    });

    const errorCounts = new Map<string, number>();
    for (const rec of failedExecutionsRecords) {
      const cat = rec.errorCategory || "UNKNOWN";
      errorCounts.set(cat, (errorCounts.get(cat) || 0) + 1);
    }

    const topErrorCategories: TopErrorCategory[] = Array.from(errorCounts.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: failedExecutions > 0 ? Math.round((count / failedExecutions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 8. Most Executed Workflows
    const executionsByWorkflow = await prisma.workflowExecution.findMany({
      where: baseWhere,
      select: {
        workflowId: true,
        status: true,
        workflow: { select: { name: true } },
      },
      take: 2000,
    });

    const wfAggMap = new Map<string, { name: string; total: number; success: number }>();
    for (const ex of executionsByWorkflow) {
      const existing = wfAggMap.get(ex.workflowId) || {
        name: ex.workflow?.name || "Untitled Workflow",
        total: 0,
        success: 0,
      };
      existing.total += 1;
      if (ex.status === "SUCCESS") existing.success += 1;
      wfAggMap.set(ex.workflowId, existing);
    }

    const mostExecutedWorkflows: MostExecutedWorkflow[] = Array.from(wfAggMap.entries())
      .map(([wfId, data]) => ({
        workflowId: wfId,
        workflowName: data.name,
        count: data.total,
        successRate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 9. Workflows with Repeated Failures
    const repeatedFailureMap = new Map<string, { name: string; failureCount: number; lastCategory: string; lastFailedAt: Date }>();
    for (const ex of executionsByWorkflow) {
      if (ex.status === "FAILED") {
        const existing = repeatedFailureMap.get(ex.workflowId) || {
          name: ex.workflow?.name || "Untitled Workflow",
          failureCount: 0,
          lastCategory: "ERROR",
          lastFailedAt: new Date(0),
        };
        existing.failureCount += 1;
        repeatedFailureMap.set(ex.workflowId, existing);
      }
    }

    const repeatedFailureWorkflows: RepeatedFailureWorkflow[] = Array.from(repeatedFailureMap.entries())
      .filter(([_, data]) => data.failureCount >= 2)
      .map(([wfId, data]) => ({
        workflowId: wfId,
        workflowName: data.name,
        failureCount: data.failureCount,
        lastErrorCategory: data.lastCategory,
        lastFailedAt: data.lastFailedAt.toISOString(),
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 5);

    // 10. Integration-related Failures (by nodeType)
    const failedSteps = await prisma.workflowStepExecution.findMany({
      where: {
        execution: {
          workflow: { workspaceId },
          createdAt: { gte: startTime, lte: endTime },
        },
        status: "FAILED",
      },
      select: { nodeType: true },
      take: 1000,
    });

    const integrationCounts = new Map<string, number>();
    for (const step of failedSteps) {
      const type = step.nodeType || "unknown";
      integrationCounts.set(type, (integrationCounts.get(type) || 0) + 1);
    }

    const integrationFailures: IntegrationFailureMetric[] = Array.from(integrationCounts.entries())
      .map(([nodeType, errorCount]) => ({ nodeType, errorCount }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 5);

    // 11. Current cycle usage & plan allowance
    const entitlements = await entitlementService.getWorkspaceEntitlements(workspaceId);
    const allowance = entitlements.plan.maxExecutionsPerMonth;
    const currentMonthUsed = entitlements.quotas.executions.current;
    const percentUsed = allowance > 0 ? Math.round((currentMonthUsed / allowance) * 100) : 0;

    return {
      timeRange: query.timeRange,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      cancelledExecutions,
      runningExecutions,
      successRatePercent,
      failureRatePercent,
      durationPercentiles: { p50, p90, p99 },
      volumeOverTime,
      topErrorCategories,
      mostExecutedWorkflows,
      repeatedFailureWorkflows,
      integrationFailures,
      currentCycleUsage: {
        consumed: currentMonthUsed,
        allowance,
        percentUsed,
      },
      trendVsPreviousPeriod: {
        executionsChangePercent,
        successRateChangePercent,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
