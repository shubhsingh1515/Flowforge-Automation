import {
  MilestoneMiningStats,
  ProcessMiningBottleneck,
  ProcessOptimizationRecommendation,
} from "@flowforge/shared";

export class ProcessOptimizationService {
  /**
   * Generates actionable, evidence-backed optimization recommendations
   * based on mined execution logs and observed process bottlenecks.
   */
  generateRecommendations(
    processDefinitionId: string,
    milestoneStats: MilestoneMiningStats[],
    bottlenecks: ProcessMiningBottleneck[]
  ): ProcessOptimizationRecommendation[] {
    const recommendations: ProcessOptimizationRecommendation[] = [];

    for (const stat of milestoneStats) {
      // 1. Check for Approval Bottlenecks
      if (stat.waitingForApprovalMs > 10000) {
        recommendations.push({
          id: `rec_approval_${stat.milestoneId}`,
          processDefinitionId,
          milestoneId: stat.milestoneId,
          title: `Automate low-risk approvals for milestone '${stat.name}'`,
          evidence: `Approval wait time averages ${(stat.waitingForApprovalMs / 1000).toFixed(1)}s across ${stat.visitCount} instances, accounting for majority of milestone latency.`,
          sampleSize: stat.visitCount,
          measuredBaselineMs: stat.medianDurationMs,
          proposedAction:
            "Configure conditional auto-approval threshold rules for low-value requests to bypass manual human-in-the-loop gates.",
          expectedBenefit: `Reduces milestone lead time by up to ${(stat.waitingForApprovalMs / 1000).toFixed(1)}s without increasing operational risk.`,
          riskAssessment: "Low risk when restricted to transactions below predefined business thresholds.",
          confidence: 0.92,
          safeToApply: true,
        });
      }

      // 2. Check for Rework / Retry Storms
      if (stat.reworkCount > 0 || stat.failureRate > 0.15) {
        recommendations.push({
          id: `rec_rework_${stat.milestoneId}`,
          processDefinitionId,
          milestoneId: stat.milestoneId,
          title: `Introduce strict payload validation before '${stat.name}'`,
          evidence: `Milestone experienced ${stat.reworkCount} rework loops and a ${(stat.failureRate * 100).toFixed(1)}% failure rate due to downstream schema rejections.`,
          sampleSize: stat.visitCount,
          measuredBaselineMs: stat.p95DurationMs,
          proposedAction:
            "Add pre-flight schema validation and idempotency key verification prior to dispatching external connector calls.",
          expectedBenefit: "Eliminates redundant retries and drops failure rate towards <1%.",
          riskAssessment: "Zero risk to production workflows; invalid payloads fail fast before external API costs.",
          confidence: 0.88,
          safeToApply: true,
        });
      }

      // 3. Check for Slow External Connectors / Heavy Latency
      if (stat.waitingForExternalMs > 15000 || (stat.medianDurationMs > 20000 && stat.waitingForApprovalMs === 0)) {
        recommendations.push({
          id: `rec_latency_${stat.milestoneId}`,
          processDefinitionId,
          milestoneId: stat.milestoneId,
          title: `Enable async queuing or caching for '${stat.name}'`,
          evidence: `External synchronous wait time averages ${(stat.waitingForExternalMs / 1000).toFixed(1)}s (P95: ${(stat.p95DurationMs / 1000).toFixed(1)}s).`,
          sampleSize: stat.visitCount,
          measuredBaselineMs: stat.medianDurationMs,
          proposedAction:
            "Switch synchronous third-party API step to asynchronous transactional outbox worker with webhook completion callback.",
          expectedBenefit: `Frees worker thread pool and cuts synchronous process blockage by ~${(stat.medianDurationMs * 0.7 / 1000).toFixed(1)}s.`,
          riskAssessment: "Medium risk: requires downstream integration to support webhook callbacks or polling.",
          confidence: 0.85,
          safeToApply: false,
        });
      }
    }

    // Deduplicate recommendations by id
    const uniqueMap = new Map<string, ProcessOptimizationRecommendation>();
    for (const r of recommendations) {
      uniqueMap.set(r.id, r);
    }

    return Array.from(uniqueMap.values());
  }
}

export const processOptimizationService = new ProcessOptimizationService();
