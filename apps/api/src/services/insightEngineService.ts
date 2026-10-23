import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  InsightCategory,
  InsightSeverity,
  InsightStatus,
} from "@flowforge/shared";
import { intelligenceContextService, IntelligenceContext } from "./intelligenceContextService.js";
import { MockAiProvider } from "./ai/provider.js";

export class InsightEngineService {
  private aiProvider = new MockAiProvider();

  /**
   * Generates or updates evidence-grounded business insights by analyzing real telemetry.
   */
  public async analyzeWorkspace(
    workspaceId: string,
    options?: { intelligenceWorkspaceId?: string; timeRangeHours?: number }
  ) {
    const context = await intelligenceContextService.assembleContext(workspaceId, {
      timeRangeHours: options?.timeRangeHours,
    });

    const generatedInsights: any[] = [];
    const now = new Date();

    // 1. Check Workflow Reliability Regression
    if (context.metrics.failedExecutions > 0 && context.metrics.workflowFailureRate >= 0.05) {
      const topFailedEvidence = context.evidence.find((e) => e.sourceService === "workflow");
      const resourceId = topFailedEvidence?.resourceId || "all-workflows";
      const correlationKey = `workflow_fail:${resourceId}`;

      const insight = await this.upsertInsight(workspaceId, {
        intelligenceWorkspaceId: options?.intelligenceWorkspaceId,
        category: "WORKFLOW_RELIABILITY_REGRESSION",
        severity: context.metrics.workflowFailureRate > 0.2 ? "CRITICAL" : "HIGH",
        title: `Workflow Failure Rate Spike (${(context.metrics.workflowFailureRate * 100).toFixed(1)}%)`,
        summary: `Detected ${context.metrics.failedExecutions} execution failures across ${context.metrics.totalExecutions} workflow runs in the observation window.`,
        confidence: 0.95,
        correlationKey,
        resourceType: "WORKFLOW",
        resourceId,
        metricsData: {
          failureRate: context.metrics.workflowFailureRate,
          failedCount: context.metrics.failedExecutions,
          totalCount: context.metrics.totalExecutions,
        },
        evidenceReferences: context.evidence.filter((e) => e.sourceService === "workflow"),
        observationWindowStart: new Date(context.observationWindow.start),
        observationWindowEnd: new Date(context.observationWindow.end),
      });

      generatedInsights.push(insight);
    }

    // 2. Check Business Process SLA Breach Risk
    if (context.metrics.atRiskProcessesCount > 0) {
      const topProcessEvidence = context.evidence.find((e) => e.sourceService === "process");
      const resourceId = topProcessEvidence?.resourceId || "all-processes";
      const correlationKey = `process_at_risk:${resourceId}`;

      const insight = await this.upsertInsight(workspaceId, {
        intelligenceWorkspaceId: options?.intelligenceWorkspaceId,
        category: "SLA_BREACH_RISK",
        severity: "HIGH",
        title: `Business Process SLA Breach Risk (${context.metrics.atRiskProcessesCount} At Risk)`,
        summary: `Identified ${context.metrics.atRiskProcessesCount} business process instances in AT_RISK or FAILED status exceeding expected milestone durations.`,
        confidence: 0.9,
        correlationKey,
        resourceType: "PROCESS",
        resourceId,
        metricsData: {
          atRiskCount: context.metrics.atRiskProcessesCount,
          totalInstances: context.metrics.processInstancesCount,
        },
        evidenceReferences: context.evidence.filter((e) => e.sourceService === "process"),
        observationWindowStart: new Date(context.observationWindow.start),
        observationWindowEnd: new Date(context.observationWindow.end),
      });

      generatedInsights.push(insight);
    }

    // 3. Check Event Delivery Degradation
    if (context.metrics.deadLetterEventsCount > 0) {
      const topEventEvidence = context.evidence.find((e) => e.sourceService === "event");
      const resourceId = topEventEvidence?.resourceId || "event-fabric";
      const correlationKey = `event_dead_letter:${resourceId}`;

      const insight = await this.upsertInsight(workspaceId, {
        intelligenceWorkspaceId: options?.intelligenceWorkspaceId,
        category: "EVENT_DELIVERY_DEGRADATION",
        severity: "CRITICAL",
        title: `Event Delivery Degradation (${context.metrics.deadLetterEventsCount} Dead Letters)`,
        summary: `Event fabric subscriptions encountered unrecoverable delivery errors resulting in ${context.metrics.deadLetterEventsCount} dead-lettered events.`,
        confidence: 0.98,
        correlationKey,
        resourceType: "EVENT",
        resourceId,
        metricsData: {
          deadLetterCount: context.metrics.deadLetterEventsCount,
        },
        evidenceReferences: context.evidence.filter((e) => e.sourceService === "event"),
        observationWindowStart: new Date(context.observationWindow.start),
        observationWindowEnd: new Date(context.observationWindow.end),
      });

      generatedInsights.push(insight);
    }

    // 4. Check Data Quality Deterioration
    if (context.metrics.failedQualityRulesCount > 0) {
      const topQualityEvidence = context.evidence.find((e) => e.sourceService === "data_product");
      const resourceId = topQualityEvidence?.resourceId || "data-products";
      const correlationKey = `data_quality_fail:${resourceId}`;

      const insight = await this.upsertInsight(workspaceId, {
        intelligenceWorkspaceId: options?.intelligenceWorkspaceId,
        category: "DATA_QUALITY_DETERIORATION",
        severity: "HIGH",
        title: `Data Product Quality Gate Failure (${context.metrics.failedQualityRulesCount} Failed Rules)`,
        summary: `Governed data products failed validation rules on recent snapshot materialization.`,
        confidence: 0.92,
        correlationKey,
        resourceType: "DATA_PRODUCT",
        resourceId,
        metricsData: {
          failedRuleEvaluations: context.metrics.failedQualityRulesCount,
        },
        evidenceReferences: context.evidence.filter((e) => e.sourceService === "data_product"),
        observationWindowStart: new Date(context.observationWindow.start),
        observationWindowEnd: new Date(context.observationWindow.end),
      });

      generatedInsights.push(insight);
    }

    // 5. Check Data Freshness Violation
    if (context.metrics.staleDataProductsCount > 0) {
      const insight = await this.upsertInsight(workspaceId, {
        intelligenceWorkspaceId: options?.intelligenceWorkspaceId,
        category: "DATA_FRESHNESS_VIOLATION",
        severity: "MEDIUM",
        title: `Data Freshness Target Breach (${context.metrics.staleDataProductsCount} Stale Products)`,
        summary: `${context.metrics.staleDataProductsCount} published data product snapshots have exceeded their configured targetFreshnessMinutes SLA.`,
        confidence: 0.95,
        correlationKey: `data_freshness_stale:workspace`,
        resourceType: "DATA_PRODUCT",
        resourceId: "stale-products",
        metricsData: {
          staleCount: context.metrics.staleDataProductsCount,
        },
        evidenceReferences: context.evidence.filter((e) => e.metricName === "freshness_sla_breach"),
        observationWindowStart: new Date(context.observationWindow.start),
        observationWindowEnd: new Date(context.observationWindow.end),
      });

      generatedInsights.push(insight);
    }

    return {
      contextMetrics: context.metrics,
      insightsGenerated: generatedInsights.length,
      insights: generatedInsights,
    };
  }

  /**
   * Upserts an insight with deterministic deduplication by correlationKey.
   */
  private async upsertInsight(
    workspaceId: string,
    data: {
      intelligenceWorkspaceId?: string;
      category: InsightCategory;
      severity: InsightSeverity;
      title: string;
      summary: string;
      confidence: number;
      correlationKey: string;
      resourceType: string;
      resourceId: string;
      metricsData: Record<string, any>;
      evidenceReferences: any[];
      observationWindowStart: Date;
      observationWindowEnd: Date;
    }
  ) {
    const existing = await prisma.businessInsight.findFirst({
      where: {
        workspaceId,
        correlationKey: data.correlationKey,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
    });

    const now = new Date();

    if (existing) {
      // Deduplicate & update
      return prisma.businessInsight.update({
        where: { id: existing.id },
        data: {
          severity: data.severity,
          title: data.title,
          summary: data.summary,
          metricsData: data.metricsData,
          evidenceReferences: data.evidenceReferences,
          observationWindowEnd: data.observationWindowEnd,
          lastObservedAt: now,
        },
      });
    }

    return prisma.businessInsight.create({
      data: {
        workspaceId,
        intelligenceWorkspaceId: data.intelligenceWorkspaceId,
        category: data.category,
        severity: data.severity,
        status: "OPEN",
        title: data.title,
        summary: data.summary,
        confidence: data.confidence,
        correlationKey: data.correlationKey,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        metricsData: data.metricsData,
        evidenceReferences: data.evidenceReferences,
        observationWindowStart: data.observationWindowStart,
        observationWindowEnd: data.observationWindowEnd,
        firstObservedAt: now,
        lastObservedAt: now,
      },
    });
  }

  /**
   * Lists insights for a workspace.
   */
  public async listInsights(
    workspaceId: string,
    filters?: { category?: string; severity?: string; status?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.category) where.category = filters.category;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.status) where.status = filters.status;

    return prisma.businessInsight.findMany({
      where,
      orderBy: { lastObservedAt: "desc" },
      include: {
        proposals: { take: 3 },
      },
    });
  }

  /**
   * Retrieves an insight by ID.
   */
  public async getInsight(workspaceId: string, insightId: string) {
    const insight = await prisma.businessInsight.findFirst({
      where: { id: insightId, workspaceId },
      include: {
        proposals: true,
        investigations: true,
      },
    });
    if (!insight) throw new HttpError(404, `Insight '${insightId}' not found.`);
    return insight;
  }

  /**
   * Acknowledges an open insight.
   */
  public async acknowledgeInsight(workspaceId: string, insightId: string, userId?: string) {
    const insight = await this.getInsight(workspaceId, insightId);
    return prisma.businessInsight.update({
      where: { id: insight.id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
      },
    });
  }

  /**
   * Dismisses an insight.
   */
  public async dismissInsight(workspaceId: string, insightId: string) {
    const insight = await this.getInsight(workspaceId, insightId);
    return prisma.businessInsight.update({
      where: { id: insight.id },
      data: { status: "DISMISSED" },
    });
  }

  /**
   * Resolves an insight.
   */
  public async resolveInsight(workspaceId: string, insightId: string) {
    const insight = await this.getInsight(workspaceId, insightId);
    return prisma.businessInsight.update({
      where: { id: insight.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }
}

export const insightEngineService = new InsightEngineService();
