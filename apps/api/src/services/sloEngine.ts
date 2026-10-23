import { prisma } from "@flowforge/database";
import { incidentService } from "./incidentService.js";

export interface SloEvaluationResult {
  objectiveId: string;
  name: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  status: "MET" | "AT_RISK" | "BREACHED" | "INSUFFICIENT_DATA";
  errorBudgetRemaining: number;
  sampleCount: number;
  incidentCreated?: boolean;
}

export class SloEngine {
  /**
   * Evaluates all reliability objectives for a given workspace.
   */
  public async evaluateWorkspaceSlos(workspaceId: string): Promise<SloEvaluationResult[]> {
    const objectives = await prisma.reliabilityObjective.findMany({
      where: { workspaceId },
      include: { workflow: { select: { id: true, name: true } } },
    });

    const results: SloEvaluationResult[] = [];

    for (const obj of objectives) {
      const result = await this.evaluateObjective(obj);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluates a single reliability objective against actual database execution telemetry.
   */
  public async evaluateObjective(obj: any): Promise<SloEvaluationResult> {
    const windowStart = new Date(Date.now() - (obj.evaluationWindowDays || 14) * 86400000);

    const executions = await prisma.workflowExecution.findMany({
      where: {
        createdAt: { gte: windowStart },
        ...(obj.workflowId ? { workflowId: obj.workflowId } : { workflow: { workspaceId: obj.workspaceId } }),
        status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
      },
      select: {
        id: true,
        status: true,
        durationMs: true,
        createdAt: true,
        startedAt: true,
      },
    });

    const sampleCount = executions.length;

    // Minimum sample size constraint: at least 3 samples are required to determine health
    if (sampleCount < 3) {
      await prisma.reliabilityObjective.update({
        where: { id: obj.id },
        data: {
          status: "INSUFFICIENT_DATA",
          currentValue: null,
          errorBudgetRemaining: null,
          lastEvaluatedAt: new Date(),
        },
      });

      return {
        objectiveId: obj.id,
        name: obj.name,
        targetMetric: obj.targetMetric,
        targetValue: obj.targetValue,
        currentValue: 0,
        status: "INSUFFICIENT_DATA",
        errorBudgetRemaining: 0,
        sampleCount,
      };
    }

    let currentValue = 0;
    let status: "MET" | "AT_RISK" | "BREACHED" = "MET";
    let errorBudgetRemaining = 100;

    if (obj.targetMetric === "SUCCESS_RATE") {
      const successes = executions.filter((e) => e.status === "SUCCESS").length;
      currentValue = Math.round((successes / sampleCount) * 1000) / 10; // e.g. 98.5%

      // If target is 99.0%, error budget is (100 - target) = 1.0% failure allowed
      const allowedFailureRate = Math.max(0.1, 100 - obj.targetValue);
      const actualFailureRate = Math.max(0, 100 - currentValue);
      errorBudgetRemaining = Math.max(0, Math.round(((allowedFailureRate - actualFailureRate) / allowedFailureRate) * 100));

      if (currentValue < obj.targetValue) {
        status = "BREACHED";
      } else if (errorBudgetRemaining < 25) {
        status = "AT_RISK";
      } else {
        status = "MET";
      }
    } else if (obj.targetMetric === "P95_LATENCY") {
      const durations = executions
        .map((e) => e.durationMs || 0)
        .sort((a, b) => a - b);
      const p95Idx = Math.floor(durations.length * 0.95);
      currentValue = durations[p95Idx] || 0;

      // Lower is better. If currentValue exceeds targetValue, breached.
      if (currentValue > obj.targetValue) {
        status = "BREACHED";
        errorBudgetRemaining = 0;
      } else {
        const headroom = obj.targetValue - currentValue;
        errorBudgetRemaining = Math.min(100, Math.round((headroom / obj.targetValue) * 100));
        status = errorBudgetRemaining < 20 ? "AT_RISK" : "MET";
      }
    } else if (obj.targetMetric === "MAX_DURATION") {
      const maxDur = Math.max(...executions.map((e) => e.durationMs || 0));
      currentValue = maxDur;

      if (currentValue > obj.targetValue) {
        status = "BREACHED";
        errorBudgetRemaining = 0;
      } else {
        const headroom = obj.targetValue - currentValue;
        errorBudgetRemaining = Math.min(100, Math.round((headroom / obj.targetValue) * 100));
        status = errorBudgetRemaining < 20 ? "AT_RISK" : "MET";
      }
    } else if (obj.targetMetric === "QUEUE_WAITING_TIME") {
      // Calculate queue wait: startedAt - createdAt
      const waitTimes = executions.map((e) => {
        if (!e.startedAt || !e.createdAt) return 0;
        return Math.max(0, new Date(e.startedAt).getTime() - new Date(e.createdAt).getTime());
      });
      const avgWait = waitTimes.reduce((acc, v) => acc + v, 0) / (waitTimes.length || 1);
      currentValue = Math.round(avgWait);

      if (currentValue > obj.targetValue) {
        status = "BREACHED";
        errorBudgetRemaining = 0;
      } else {
        const headroom = obj.targetValue - currentValue;
        errorBudgetRemaining = Math.min(100, Math.round((headroom / obj.targetValue) * 100));
        status = errorBudgetRemaining < 20 ? "AT_RISK" : "MET";
      }
    }

    // Persist evaluation result
    await prisma.reliabilityObjective.update({
      where: { id: obj.id },
      data: {
        status,
        currentValue,
        errorBudgetRemaining,
        lastEvaluatedAt: new Date(),
      },
    });

    let incidentCreated = false;

    // Idempotent incident generation on breach or critical risk
    if (status === "BREACHED" || status === "AT_RISK") {
      const now = new Date();
      const inCooldown = obj.alertCooldownUntil && new Date(obj.alertCooldownUntil) > now;

      if (!inCooldown) {
        const severity = status === "BREACHED" ? "CRITICAL" : "HIGH";
        const correlationKey = `slo:${obj.workspaceId}:${obj.id}:${status}`;

        await incidentService.reportIncident({
          workspaceId: obj.workspaceId,
          title: `SLO ${status}: ${obj.name} (${currentValue} vs target ${obj.targetValue})`,
          severity,
          category: "SLO_BREACH",
          sourceService: "SLO_ENGINE",
          correlationKey,
          rootCauseSummary: `Reliability Objective '${obj.name}' consumed error budget (remaining: ${errorBudgetRemaining}%). Measured ${obj.targetMetric} = ${currentValue} over ${sampleCount} executions.`,
          candidateCauses: [
            {
              hypothesis: `Spike in failed executions or execution latency in workflow ${obj.workflow?.name || "workspace"}`,
              evidenceStrength: "HIGH",
              supportingEvidence: [`${sampleCount} executions evaluated`, `Current value: ${currentValue}`, `Budget remaining: ${errorBudgetRemaining}%`],
            },
          ],
          suggestedAction: "RETRY_RETRYABLE_EXECUTION",
          affectedWorkflows: obj.workflowId ? [obj.workflowId] : [],
        });

        // Set 30-minute cooldown
        await prisma.reliabilityObjective.update({
          where: { id: obj.id },
          data: {
            alertCooldownUntil: new Date(Date.now() + 30 * 60000),
          },
        });

        incidentCreated = true;
      }
    }

    return {
      objectiveId: obj.id,
      name: obj.name,
      targetMetric: obj.targetMetric,
      targetValue: obj.targetValue,
      currentValue,
      status,
      errorBudgetRemaining,
      sampleCount,
      incidentCreated,
    };
  }
}

export const sloEngine = new SloEngine();
