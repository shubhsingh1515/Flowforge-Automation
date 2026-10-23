import { prisma } from "@flowforge/database";
import {
  ProcessMiningResult,
  ProcessObservedPath,
  MilestoneMiningStats,
  ProcessMiningBottleneck,
  ProcessMetricsSummary,
  ProcessMilestone,
} from "@flowforge/shared";
import { processOptimizationService } from "./processOptimizationService.js";

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export class ProcessMiningService {
  /**
   * Mines event logs across business process instances to discover observed paths,
   * transition frequencies, bottlenecks, and rework rates.
   */
  async mineProcess(
    workspaceId: string,
    processDefinitionId: string,
    timeRangeDays = 30
  ): Promise<ProcessMiningResult> {
    const processDef = await prisma.businessProcessDefinition.findFirst({
      where: { id: processDefinitionId, workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!processDef) {
      throw new Error(`Process definition '${processDefinitionId}' not found.`);
    }

    const cutoff = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);

    const instances = await prisma.businessProcessInstance.findMany({
      where: {
        workspaceId,
        processDefinitionId,
        createdAt: { gte: cutoff },
      },
      include: {
        events: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Enforce data sufficiency standard: need at least 3 instances to extrapolate patterns
    if (instances.length < 3) {
      return {
        processDefinitionId,
        instancesExamined: instances.length,
        timeRangeDays,
        eventCompleteness: instances.length > 0 ? 1.0 : 0.0,
        dataSufficiency: "INSUFFICIENT_DATA",
        observedPaths: [],
        milestoneStats: [],
        bottlenecks: [],
        recommendations: [],
      };
    }

    const activeVersion = processDef.versions[0];
    const registeredMilestones =
      (activeVersion?.milestones as unknown as ProcessMilestone[]) || [];
    const milestoneNameMap = new Map<string, string>();
    for (const m of registeredMilestones) {
      milestoneNameMap.set(m.id, m.name);
    }

    // 1. Discover Observed Paths
    const pathGroupMap = new Map<
      string,
      {
        path: string[];
        count: number;
        durations: number[];
        reworkCount: number;
      }
    >();

    for (const inst of instances) {
      const milestoneSequence: string[] = [];
      const seenInInstance = new Set<string>();
      let instanceHasRework = false;

      for (const evt of inst.events) {
        const name = evt.milestoneName || milestoneNameMap.get(evt.milestoneId) || evt.milestoneId;
        // Avoid consecutive duplicate state logs if simply transitioning event types
        if (milestoneSequence.length === 0 || milestoneSequence[milestoneSequence.length - 1] !== name) {
          if (seenInInstance.has(name)) {
            instanceHasRework = true;
          }
          seenInInstance.add(name);
          milestoneSequence.push(name);
        }
      }

      if (milestoneSequence.length === 0) continue;

      const pathKey = milestoneSequence.join(" -> ");
      const existing = pathGroupMap.get(pathKey) || {
        path: milestoneSequence,
        count: 0,
        durations: [],
        reworkCount: 0,
      };

      existing.count += 1;
      if (inst.durationMs) {
        existing.durations.push(inst.durationMs);
      }
      if (instanceHasRework) {
        existing.reworkCount += 1;
      }
      pathGroupMap.set(pathKey, existing);
    }

    const totalPathsExamined = Array.from(pathGroupMap.values()).reduce((sum, p) => sum + p.count, 0);

    const observedPaths: ProcessObservedPath[] = Array.from(pathGroupMap.values())
      .map((p) => {
        const avgDuration =
          p.durations.length > 0
            ? Math.round(p.durations.reduce((a, b) => a + b, 0) / p.durations.length)
            : 0;

        return {
          path: p.path,
          frequency: p.count,
          percentage: totalPathsExamined > 0 ? Number(((p.count / totalPathsExamined) * 100).toFixed(1)) : 0,
          averageDurationMs: avgDuration,
          reworkRate: Number((p.reworkCount / p.count).toFixed(2)),
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    // 2. Compute Milestone-Level Mining Statistics
    const milestoneMap = new Map<
      string,
      {
        milestoneId: string;
        name: string;
        visitCount: number;
        durations: number[];
        failures: number;
        approvalWaits: number[];
        reworks: number;
      }
    >();

    for (const inst of instances) {
      const milestoneOccurrencesInInstance = new Map<string, number>();

      for (let i = 0; i < inst.events.length; i++) {
        const evt = inst.events[i];
        const name = evt.milestoneName || milestoneNameMap.get(evt.milestoneId) || evt.milestoneId;
        const entry = milestoneMap.get(evt.milestoneId) || {
          milestoneId: evt.milestoneId,
          name,
          visitCount: 0,
          durations: [],
          failures: 0,
          approvalWaits: [],
          reworks: 0,
        };

        entry.visitCount += 1;

        if (evt.durationMs) {
          entry.durations.push(evt.durationMs);
        }

        if (evt.eventType === "MILESTONE_FAILED") {
          entry.failures += 1;
        }

        if (evt.eventType === "APPROVAL_WAITING") {
          // Look ahead to calculate approval wait latency
          const nextEvt = inst.events.slice(i + 1).find((e) => e.milestoneId === evt.milestoneId);
          if (nextEvt) {
            const waitTime = Math.max(0, new Date(nextEvt.createdAt).getTime() - new Date(evt.createdAt).getTime());
            entry.approvalWaits.push(waitTime);
          } else if (evt.durationMs) {
            entry.approvalWaits.push(evt.durationMs);
          }
        }

        const countSoFar = (milestoneOccurrencesInInstance.get(evt.milestoneId) || 0) + 1;
        milestoneOccurrencesInInstance.set(evt.milestoneId, countSoFar);
        if (countSoFar > 1 && evt.eventType === "MILESTONE_STARTED") {
          entry.reworks += 1;
        }

        milestoneMap.set(evt.milestoneId, entry);
      }
    }

    const milestoneStats: MilestoneMiningStats[] = Array.from(milestoneMap.values()).map((m) => {
      const medianDurationMs = calculatePercentile(m.durations, 50);
      const p95DurationMs = calculatePercentile(m.durations, 95);
      const avgApprovalWaitMs =
        m.approvalWaits.length > 0
          ? Math.round(m.approvalWaits.reduce((a, b) => a + b, 0) / m.approvalWaits.length)
          : 0;
      const waitingForExternalMs = Math.max(0, medianDurationMs - avgApprovalWaitMs);
      const failureRate = m.visitCount > 0 ? Number((m.failures / m.visitCount).toFixed(3)) : 0;

      return {
        milestoneId: m.milestoneId,
        name: m.name,
        visitCount: m.visitCount,
        medianDurationMs,
        p95DurationMs,
        failureRate,
        waitingForApprovalMs: avgApprovalWaitMs,
        waitingForExternalMs,
        reworkCount: m.reworks,
      };
    });

    // 3. Identify Bottlenecks
    const bottlenecks: ProcessMiningBottleneck[] = [];

    for (const stat of milestoneStats) {
      if (stat.waitingForApprovalMs > 10000) {
        bottlenecks.push({
          milestoneId: stat.milestoneId,
          name: stat.name,
          reason: `High approval gate waiting latency (avg ${(stat.waitingForApprovalMs / 1000).toFixed(1)}s)`,
          severity: "HIGH",
          impactMs: stat.waitingForApprovalMs,
        });
      } else if (stat.medianDurationMs > 25000) {
        bottlenecks.push({
          milestoneId: stat.milestoneId,
          name: stat.name,
          reason: `Long synchronous execution duration (median ${(stat.medianDurationMs / 1000).toFixed(1)}s)`,
          severity: "MEDIUM",
          impactMs: stat.medianDurationMs,
        });
      } else if (stat.reworkCount > 0) {
        bottlenecks.push({
          milestoneId: stat.milestoneId,
          name: stat.name,
          reason: `Milestone re-executed ${stat.reworkCount} times due to rework or failed attempts`,
          severity: "MEDIUM",
          impactMs: stat.medianDurationMs * stat.reworkCount,
        });
      }
    }

    // 4. Generate Evidence-Backed Optimization Recommendations
    const recommendations = processOptimizationService.generateRecommendations(
      processDefinitionId,
      milestoneStats,
      bottlenecks
    );

    return {
      processDefinitionId,
      instancesExamined: instances.length,
      timeRangeDays,
      eventCompleteness: 1.0,
      dataSufficiency: "SUFFICIENT",
      observedPaths,
      milestoneStats,
      bottlenecks,
      recommendations,
    };
  }

  /**
   * Aggregates process performance and outcome metrics across instances
   */
  async getProcessMetrics(
    workspaceId: string,
    processDefinitionId: string,
    timeRangeDays = 30
  ): Promise<ProcessMetricsSummary> {
    const cutoff = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);

    const instances = await prisma.businessProcessInstance.findMany({
      where: {
        workspaceId,
        processDefinitionId,
        createdAt: { gte: cutoff },
      },
      include: {
        slaEvaluations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const totalInstances = instances.length;
    const completedInstances = instances.filter((i) => i.status === "COMPLETED").length;
    const failedInstances = instances.filter((i) => i.status === "FAILED").length;
    const cancelledInstances = instances.filter((i) => i.status === "CANCELLED").length;
    const activeInstances = instances.filter((i) =>
      ["CREATED", "IN_PROGRESS", "WAITING", "AT_RISK"].includes(i.status)
    ).length;

    const completedDurations = instances
      .filter((i) => i.status === "COMPLETED" && i.durationMs)
      .map((i) => i.durationMs as number);

    const medianDurationMs = calculatePercentile(completedDurations, 50);
    const p90DurationMs = calculatePercentile(completedDurations, 90);
    const p95DurationMs = calculatePercentile(completedDurations, 95);

    // Calculate deadline attainment rate from SLA evaluations
    const evaluatedInstances = instances.filter((i) => i.slaEvaluations.length > 0);
    const metSlaCount = evaluatedInstances.filter(
      (i) => i.slaEvaluations[0].status === "MET"
    ).length;
    const deadlineAttainmentRate =
      evaluatedInstances.length > 0
        ? Number(((metSlaCount / evaluatedInstances.length) * 100).toFixed(1))
        : 100.0;

    // Aggregate terminal outcomes
    const outcomesRecorded: Record<string, number> = {};
    for (const inst of instances) {
      if (inst.terminalOutcome) {
        outcomesRecorded[inst.terminalOutcome] =
          (outcomesRecorded[inst.terminalOutcome] || 0) + 1;
      }
    }

    return {
      processDefinitionId,
      totalInstances,
      activeInstances,
      completedInstances,
      failedInstances,
      cancelledInstances,
      completionRate: totalInstances > 0 ? Number(((completedInstances / totalInstances) * 100).toFixed(1)) : 0,
      failureRate: totalInstances > 0 ? Number(((failedInstances / totalInstances) * 100).toFixed(1)) : 0,
      medianDurationMs,
      p90DurationMs,
      p95DurationMs,
      approvalWaitDurationMs: 0,
      externalWaitDurationMs: 0,
      deadlineAttainmentRate,
      outcomesRecorded,
      timeRangeDays,
    };
  }
}

export const processMiningService = new ProcessMiningService();
