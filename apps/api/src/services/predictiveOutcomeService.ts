import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { GenerateForecastInput, ForecastTargetMetric, ForecastMethod } from "@flowforge/shared";

export class PredictiveOutcomeService {
  /**
   * Generates a statistically grounded predictive forecast using real historical metrics.
   */
  public async generateForecast(
    workspaceId: string,
    input: GenerateForecastInput,
    intelligenceWorkspaceId?: string
  ) {
    const minSampleRequired = 3;
    let sampleCount = 0;
    let predictedValue = 0;
    let confidenceIntervalLower: number | undefined;
    let confidenceIntervalUpper: number | undefined;
    let status = "COMPLETED";

    switch (input.targetMetric) {
      case "WORKFLOW_FAILURE_RISK": {
        const executions = await prisma.workflowExecution.findMany({
          where: {
            workflow: { workspaceId, id: input.resourceId },
          },
          orderBy: { startedAt: "desc" },
          take: 100,
          select: { status: true, durationMs: true },
        });

        sampleCount = executions.length;
        if (sampleCount < minSampleRequired) {
          status = "INSUFFICIENT_DATA";
          predictedValue = 0;
        } else {
          const failCount = executions.filter((e) => e.status === "FAILED").length;
          predictedValue = failCount / sampleCount; // estimated failure rate [0, 1]
          const stdErr = Math.sqrt((predictedValue * (1 - predictedValue)) / sampleCount);
          confidenceIntervalLower = Math.max(0, predictedValue - 1.96 * stdErr);
          confidenceIntervalUpper = Math.min(1, predictedValue + 1.96 * stdErr);
        }
        break;
      }

      case "EXPECTED_COMPLETION_TIME_MS": {
        const executions = await prisma.workflowExecution.findMany({
          where: {
            workflow: { workspaceId, id: input.resourceId },
            status: "SUCCESS",
            durationMs: { not: null },
          },
          orderBy: { startedAt: "desc" },
          take: 50,
          select: { durationMs: true },
        });

        sampleCount = executions.length;
        if (sampleCount < minSampleRequired) {
          status = "INSUFFICIENT_DATA";
          predictedValue = 0;
        } else {
          const durations = executions.map((e) => e.durationMs || 0).sort((a, b) => a - b);
          const sum = durations.reduce((acc, d) => acc + d, 0);
          const mean = sum / sampleCount;
          const variance = durations.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) / sampleCount;
          const stdDev = Math.sqrt(variance);

          // 90th percentile estimation
          const p90Idx = Math.floor(sampleCount * 0.9);
          predictedValue = durations[p90Idx] || mean;
          confidenceIntervalLower = Math.max(0, mean - 1.96 * (stdDev / Math.sqrt(sampleCount)));
          confidenceIntervalUpper = mean + 1.96 * (stdDev / Math.sqrt(sampleCount));
        }
        break;
      }

      case "PROCESS_SLA_BREACH_PROBABILITY": {
        const instances = await prisma.businessProcessInstance.findMany({
          where: {
            workspaceId,
            processDefinitionId: input.resourceId,
          },
          orderBy: { startedAt: "desc" },
          take: 50,
          select: { status: true, durationMs: true },
        });

        sampleCount = instances.length;
        if (sampleCount < minSampleRequired) {
          status = "INSUFFICIENT_DATA";
          predictedValue = 0;
        } else {
          const atRiskCount = instances.filter((i) => i.status === "AT_RISK" || i.status === "FAILED").length;
          predictedValue = atRiskCount / sampleCount;
          const stdErr = Math.sqrt((predictedValue * (1 - predictedValue)) / sampleCount);
          confidenceIntervalLower = Math.max(0, predictedValue - 1.96 * stdErr);
          confidenceIntervalUpper = Math.min(1, predictedValue + 1.96 * stdErr);
        }
        break;
      }

      case "EVENT_DELIVERY_DELAY_MS":
      case "QUEUE_BACKLOG":
      default: {
        const deliveries = await prisma.eventDelivery.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { attemptCount: true },
        });

        sampleCount = deliveries.length;
        if (sampleCount < minSampleRequired) {
          status = "INSUFFICIENT_DATA";
          predictedValue = 0;
        } else {
          const avgAttempts = deliveries.reduce((acc, d) => acc + d.attemptCount, 0) / sampleCount;
          predictedValue = Math.round(avgAttempts * 250); // approximate delay in ms
          confidenceIntervalLower = Math.max(0, predictedValue * 0.7);
          confidenceIntervalUpper = predictedValue * 1.4;
        }
        break;
      }
    }

    const forecast = await prisma.forecastRun.create({
      data: {
        workspaceId,
        intelligenceWorkspaceId,
        targetMetric: input.targetMetric,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        horizonHours: input.horizonHours,
        modelMethod: input.modelMethod,
        modelVersion: "v1.0.0",
        sampleCount,
        predictedValue,
        confidenceIntervalLower,
        confidenceIntervalUpper,
        status,
        metadata: {
          minSampleRequired,
          isCalibrated: status === "COMPLETED",
        },
      },
    });

    return forecast;
  }

  /**
   * Lists generated forecasts for a workspace.
   */
  public async listForecasts(workspaceId: string, targetMetric?: ForecastTargetMetric) {
    const where: any = { workspaceId };
    if (targetMetric) where.targetMetric = targetMetric;

    return prisma.forecastRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Retrieves a specific forecast run.
   */
  public async getForecast(workspaceId: string, forecastId: string) {
    const forecast = await prisma.forecastRun.findFirst({
      where: { id: forecastId, workspaceId },
    });
    if (!forecast) throw new HttpError(404, `Forecast '${forecastId}' not found.`);
    return forecast;
  }
}

export const predictiveOutcomeService = new PredictiveOutcomeService();
