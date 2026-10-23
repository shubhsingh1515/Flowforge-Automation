import { prisma } from "@flowforge/database";
import { CreateReliabilityObjectiveInput, ReliabilityObjectiveReport } from "@flowforge/shared";
import { notificationService } from "./notifications.js";

export class ReliabilityService {
  /**
   * Defines a new reliability objective (SLO) for a workflow or workspace.
   */
  async createObjective(workspaceId: string, input: CreateReliabilityObjectiveInput) {
    if (input.workflowId) {
      const workflow = await prisma.workflow.findFirst({
        where: { id: input.workflowId, workspaceId },
      });
      if (!workflow) {
        const error: any = new Error("Workflow not found in this workspace.");
        error.statusCode = 404;
        throw error;
      }
    }

    const objective = await prisma.reliabilityObjective.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        name: input.name,
        targetMetric: input.targetMetric,
        targetValue: input.targetValue,
        evaluationWindowDays: input.evaluationWindowDays || 14,
        status: "INSUFFICIENT_DATA",
      },
      include: {
        workflow: { select: { id: true, name: true, criticality: true } },
      },
    });

    // Run initial evaluation
    return await this.evaluateObjective(workspaceId, objective.id);
  }

  /**
   * Lists reliability objectives in a workspace with latest evaluations.
   */
  async listObjectives(workspaceId: string) {
    const objectives = await prisma.reliabilityObjective.findMany({
      where: { workspaceId },
      include: {
        workflow: { select: { id: true, name: true, criticality: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const evaluated = await Promise.all(
      objectives.map((obj) => this.evaluateObjective(workspaceId, obj.id))
    );

    return evaluated;
  }

  /**
   * Deterministically evaluates an SLO based on actual execution records.
   */
  async evaluateObjective(workspaceId: string, objectiveId: string): Promise<ReliabilityObjectiveReport> {
    const obj = await prisma.reliabilityObjective.findFirst({
      where: { id: objectiveId, workspaceId },
      include: {
        workflow: { select: { id: true, name: true } },
      },
    });

    if (!obj) {
      const error: any = new Error("Reliability objective not found.");
      error.statusCode = 404;
      throw error;
    }

    const windowDays = obj.evaluationWindowDays || 14;
    const windowStart = new Date(Date.now() - windowDays * 86400000);

    // Fetch executions in evaluation window
    const executionWhere: any = {
      workflow: { workspaceId },
      startedAt: { gte: windowStart },
      status: { not: "CANCELLED" }, // Exclude user-cancelled runs from statistical denominator
    };
    if (obj.workflowId) {
      executionWhere.workflowId = obj.workflowId;
    }

    const executions = await prisma.workflowExecution.findMany({
      where: executionWhere,
      select: {
        id: true,
        status: true,
        durationMs: true,
      },
    });

    const totalEligible = executions.length;
    const successCount = executions.filter((e) => e.status === "SUCCESS").length;
    const failureCount = totalEligible - successCount;

    let status: "MET" | "AT_RISK" | "BREACHED" | "INSUFFICIENT_DATA" | "HEALTHY" = "INSUFFICIENT_DATA";
    let currentValue: number | null = null;
    let allowedFailures: number | null = null;
    let errorBudgetRemainingPercent: number | null = null;

    // Minimum sample size requirement (statistical integrity)
    if (totalEligible < 5) {
      status = "INSUFFICIENT_DATA";
    } else {
      if (obj.targetMetric === "SUCCESS_RATE") {
        currentValue = Math.round((successCount / totalEligible) * 10000) / 100; // 2 decimal precision
        allowedFailures = Math.floor(totalEligible * (1 - obj.targetValue / 100));

        if (failureCount === 0) {
          errorBudgetRemainingPercent = 100;
        } else if (allowedFailures > 0) {
          const remainingFailures = Math.max(0, allowedFailures - failureCount);
          errorBudgetRemainingPercent = Math.round((remainingFailures / allowedFailures) * 100);
        } else {
          errorBudgetRemainingPercent = 0;
        }

        if (currentValue >= obj.targetValue) {
          status = errorBudgetRemainingPercent <= 20 ? "AT_RISK" : "HEALTHY";
        } else {
          status = "BREACHED";
        }
      } else if (obj.targetMetric === "P95_LATENCY") {
        const durations = executions.map((e) => e.durationMs || 0).sort((a, b) => a - b);
        const p95Idx = Math.floor(durations.length * 0.95);
        currentValue = durations[p95Idx] || 0;
        status = currentValue <= obj.targetValue ? "HEALTHY" : "BREACHED";
      } else if (obj.targetMetric === "MAX_DURATION") {
        const maxDuration = Math.max(...executions.map((e) => e.durationMs || 0), 0);
        currentValue = maxDuration;
        status = currentValue <= obj.targetValue ? "HEALTHY" : "BREACHED";
      }
    }

    // Deduplicated Alerting
    const now = new Date();
    if (status === "BREACHED" && (!obj.alertCooldownUntil || obj.alertCooldownUntil <= now)) {
      const cooldownHours = 6;
      await prisma.reliabilityObjective.update({
        where: { id: obj.id },
        data: {
          alertCooldownUntil: new Date(Date.now() + cooldownHours * 3600000),
        },
      });

      // Dispatch notification
      const admins = await prisma.workspaceMembership.findMany({
        where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      });
      for (const adm of admins) {
        await notificationService.createNotification({
          workspaceId,
          userId: adm.userId,
          type: "USAGE_WARNING",
          title: `Reliability Objective Breached: ${obj.name}`,
          message: `SLO target ${obj.targetValue} ${obj.targetMetric === "SUCCESS_RATE" ? "%" : "ms"} breached (current: ${currentValue}).`,
          link: "/governance?tab=reliability",
          category: "warning",
        });
      }
    }

    // Persist latest evaluated state
    await prisma.reliabilityObjective.update({
      where: { id: obj.id },
      data: {
        status,
        currentValue,
        errorBudgetRemaining: errorBudgetRemainingPercent,
        lastEvaluatedAt: now,
      },
    });

    return {
      id: obj.id,
      name: obj.name,
      workflowId: obj.workflowId,
      workflowName: obj.workflow?.name,
      metric: obj.targetMetric as any,
      targetValue: obj.targetValue,
      currentValue,
      status,
      sampleSize: totalEligible,
      errorBudgetRemainingPercent,
      allowedFailures,
      actualFailures: failureCount,
      evaluationWindow: `Past ${windowDays} days`,
      evaluationSummary: {
        insufficientData: status === "INSUFFICIENT_DATA",
        sampleSize: totalEligible,
        currentValue,
        errorBudgetRemainingPct: errorBudgetRemainingPercent ?? 100,
      },
    };
  }

  /**
   * Deletes an SLO.
   */
  async deleteObjective(workspaceId: string, objectiveId: string) {
    await prisma.reliabilityObjective.deleteMany({
      where: { id: objectiveId, workspaceId },
    });
    return { success: true };
  }
}

export const reliabilityService = new ReliabilityService();
