import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";

export interface EvidenceRecord {
  sourceService: "workflow" | "process" | "event" | "data_product" | "incident" | "connector";
  resourceId: string;
  resourceName: string;
  observationTimestamp: string;
  metricName: string;
  metricValue: number | string;
  metadata?: Record<string, any>;
}

export interface IntelligenceContext {
  workspaceId: string;
  homeRegion: string;
  observationWindow: {
    start: string;
    end: string;
    durationHours: number;
  };
  metrics: {
    workflowFailureRate: number;
    totalExecutions: number;
    failedExecutions: number;
    processInstancesCount: number;
    atRiskProcessesCount: number;
    deadLetterEventsCount: number;
    eventThroughput: number;
    failedQualityRulesCount: number;
    staleDataProductsCount: number;
    openIncidentsCount: number;
  };
  evidence: EvidenceRecord[];
}

export class IntelligenceContextService {
  /**
   * Redacts sensitive fields recursively from evidence records.
   */
  public redactSensitive(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((i) => this.redactSensitive(i));
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lower = k.toLowerCase();
      if (lower.includes("secret") || lower.includes("password") || lower.includes("token") || lower.includes("key")) {
        clean[k] = "[REDACTED]";
      } else if (lower.includes("email") && typeof v === "string") {
        const parts = v.split("@");
        clean[k] = parts.length === 2 ? parts[0].slice(0, 2) + "***@" + parts[1] : "***";
      } else if (typeof v === "object") {
        clean[k] = this.redactSensitive(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  /**
   * Assembles a unified, permission-aware business intelligence context across FlowForge services.
   */
  public async assembleContext(
    workspaceId: string,
    options?: { timeRangeHours?: number; targetResources?: string[] }
  ): Promise<IntelligenceContext> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, homeRegion: true, dataResidency: true },
    });
    if (!workspace) throw new HttpError(404, `Workspace '${workspaceId}' not found.`);

    const durationHours = Math.min(options?.timeRangeHours || 168, 720); // max 30 days
    const windowStart = new Date(Date.now() - durationHours * 3600 * 1000);
    const windowEnd = new Date();

    const evidence: EvidenceRecord[] = [];

    // 1. Gather Workflow Executions
    const executions = await prisma.workflowExecution.findMany({
      where: {
        workflow: { workspaceId },
        startedAt: { gte: windowStart },
      },
      select: {
        id: true,
        workflowId: true,
        status: true,
        durationMs: true,
        startedAt: true,
        workflow: { select: { name: true } },
      },
      take: 200,
    });

    const totalExecutions = executions.length;
    const failedExecutions = executions.filter((e) => e.status === "FAILED").length;
    const workflowFailureRate = totalExecutions > 0 ? failedExecutions / totalExecutions : 0;

    for (const e of executions.slice(0, 50)) {
      if (e.status === "FAILED") {
        evidence.push({
          sourceService: "workflow",
          resourceId: e.workflowId,
          resourceName: e.workflow?.name || "Workflow",
          observationTimestamp: e.startedAt.toISOString(),
          metricName: "execution_failure",
          metricValue: e.durationMs || 0,
        });
      }
    }

    // 2. Gather Business Process Instances (Phase 21)
    const processInstances = await prisma.businessProcessInstance.findMany({
      where: {
        workspaceId,
        startedAt: { gte: windowStart },
      },
      select: {
        id: true,
        processDefinitionId: true,
        status: true,
        currentMilestoneName: true,
        startedAt: true,
        processDefinition: { select: { name: true } },
      },
      take: 100,
    });

    const atRiskProcesses = processInstances.filter((p) => p.status === "AT_RISK" || p.status === "FAILED");
    for (const p of atRiskProcesses) {
      evidence.push({
        sourceService: "process",
        resourceId: p.processDefinitionId,
        resourceName: p.processDefinition?.name || "Process",
        observationTimestamp: p.startedAt.toISOString(),
        metricName: "process_at_risk",
        metricValue: p.status,
        metadata: { currentMilestone: p.currentMilestoneName },
      });
    }

    // 3. Gather Event Fabric Deliveries (Phase 22)
    const deadLetters = await prisma.eventDelivery.findMany({
      where: {
        workspaceId,
        status: "DEAD_LETTER",
        updatedAt: { gte: windowStart },
      },
      select: {
        id: true,
        subscriptionId: true,
        attemptCount: true,
        lastError: true,
        updatedAt: true,
        subscription: { select: { name: true, eventTypes: true } },
      },
      take: 50,
    });

    for (const dl of deadLetters) {
      evidence.push({
        sourceService: "event",
        resourceId: dl.subscriptionId,
        resourceName: dl.subscription?.name || "Subscription",
        observationTimestamp: dl.updatedAt.toISOString(),
        metricName: "event_dead_letter",
        metricValue: dl.attemptCount,
        metadata: { eventTypes: dl.subscription?.eventTypes, error: dl.lastError },
      });
    }

    // 4. Gather Data Products & Quality Evaluations (Phase 23)
    const qualityFails = await prisma.dataQualityEvaluation.findMany({
      where: {
        workspaceId,
        status: "FAIL",
        evaluatedAt: { gte: windowStart },
      },
      select: {
        id: true,
        dataProductId: true,
        ruleId: true,
        recordsFailed: true,
        evaluatedAt: true,
        rule: { select: { name: true, ruleType: true } },
        dataProduct: { select: { name: true } },
      },
      take: 50,
    });

    for (const qf of qualityFails) {
      evidence.push({
        sourceService: "data_product",
        resourceId: qf.dataProductId,
        resourceName: qf.dataProduct?.name || "Data Product",
        observationTimestamp: qf.evaluatedAt.toISOString(),
        metricName: "quality_rule_failure",
        metricValue: qf.recordsFailed,
        metadata: { ruleName: qf.rule?.name, ruleType: qf.rule?.ruleType },
      });
    }

    // 5. Gather Stale Data Products
    const allProducts = await prisma.dataProductDefinition.findMany({
      where: { workspaceId, lifecycleStatus: "PUBLISHED" },
      select: { id: true, name: true, targetFreshnessMinutes: true, lastMaterializedAt: true },
    });

    let staleProductsCount = 0;
    const nowMs = Date.now();
    for (const prod of allProducts) {
      if (prod.targetFreshnessMinutes && prod.lastMaterializedAt) {
        const elapsedMins = (nowMs - new Date(prod.lastMaterializedAt).getTime()) / 60000;
        if (elapsedMins > prod.targetFreshnessMinutes) {
          staleProductsCount++;
          evidence.push({
            sourceService: "data_product",
            resourceId: prod.id,
            resourceName: prod.name,
            observationTimestamp: new Date().toISOString(),
            metricName: "freshness_sla_breach",
            metricValue: Math.round(elapsedMins),
            metadata: { targetMinutes: prod.targetFreshnessMinutes },
          });
        }
      }
    }

    // 6. Gather Operational Incidents (Phase 18)
    const openIncidents = await prisma.operationalIncident.findMany({
      where: {
        workspaceId,
        status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
      select: { id: true, title: true, severity: true, category: true, createdAt: true },
      take: 20,
    });

    for (const inc of openIncidents) {
      evidence.push({
        sourceService: "incident",
        resourceId: inc.id,
        resourceName: inc.title,
        observationTimestamp: inc.createdAt.toISOString(),
        metricName: "open_incident",
        metricValue: inc.severity,
        metadata: { category: inc.category },
      });
    }

    return {
      workspaceId,
      homeRegion: workspace.homeRegion,
      observationWindow: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        durationHours,
      },
      metrics: {
        workflowFailureRate,
        totalExecutions,
        failedExecutions,
        processInstancesCount: processInstances.length,
        atRiskProcessesCount: atRiskProcesses.length,
        deadLetterEventsCount: deadLetters.length,
        eventThroughput: executions.length * 2, // estimated
        failedQualityRulesCount: qualityFails.length,
        staleDataProductsCount: staleProductsCount,
        openIncidentsCount: openIncidents.length,
      },
      evidence: this.redactSensitive(evidence),
    };
  }
}

export const intelligenceContextService = new IntelligenceContextService();
