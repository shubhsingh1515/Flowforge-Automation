import { prisma } from "@flowforge/database";
import {
  CreateOptimizationCandidateInput,
  OptimizationRecommendation,
  WorkflowMetricsSnapshot,
  validateWorkflowGraph,
} from "@flowforge/shared";
import { releaseService } from "./releases.js";
import { auditLogService } from "./auditLog.js";

export class WorkflowOptimizationService {
  /**
   * Compare a candidate workflow graph against a baseline workflow and generate
   * structural diffs, metric comparisons, and evidence-backed recommendations.
   */
  async compareAndCreateCandidate(
    workspaceId: string,
    userId: string,
    input: CreateOptimizationCandidateInput
  ) {
    // 1. Fetch baseline workflow and latest version
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow || workflow.versions.length === 0) {
      throw new Error("Baseline workflow not found.");
    }

    const baselineVersion = workflow.versions[0];
    const baselineNodes = Array.isArray(baselineVersion.nodes) ? (baselineVersion.nodes as any[]) : [];
    const baselineEdges = Array.isArray(baselineVersion.edges) ? (baselineVersion.edges as any[]) : [];

    const candidateNodes = input.candidateNodes || [];
    const candidateEdges = input.candidateEdges || [];

    // 2. Deterministic Graph Validation for candidate
    const validation = validateWorkflowGraph(candidateNodes, candidateEdges);
    if (!validation.isValid) {
      const err: any = new Error(`Candidate workflow graph is invalid: ${validation.errors.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    // 3. Compute Content Hashes
    const baselineSanitized = releaseService.sanitizeDefinition(baselineNodes, baselineEdges, workflow.triggerType);
    const baselineArtifactHash = releaseService.calculateContentHash({
      formatVersion: "flowforge.release/v1",
      workflowName: workflow.name,
      nodes: baselineSanitized.nodes,
      edges: baselineSanitized.edges,
    });

    const candidateSanitized = releaseService.sanitizeDefinition(candidateNodes, candidateEdges, workflow.triggerType);
    const candidateArtifactHash = releaseService.calculateContentHash({
      formatVersion: "flowforge.release/v1",
      workflowName: input.title,
      nodes: candidateSanitized.nodes,
      edges: candidateSanitized.edges,
    });

    // 4. Compute Metrics Snapshots
    const baselineMetrics = this.computeMetrics(baselineNodes, baselineEdges);
    const candidateMetrics = this.computeMetrics(candidateNodes, candidateEdges);

    // 5. Compute Structural Diff
    const structuralDiff = this.computeStructuralDiff(baselineNodes, baselineEdges, candidateNodes, candidateEdges);

    // 6. Generate Evidence-Backed Optimization Recommendations
    const recommendations = this.generateRecommendations(baselineNodes, baselineEdges, candidateNodes, candidateEdges);

    // 7. Persist Candidate Record
    const candidate = await prisma.workflowOptimizationCandidate.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        baselineArtifactHash,
        candidateArtifactHash,
        title: input.title,
        summary: input.summary,
        proposedChanges: {
          nodes: candidateNodes,
          edges: candidateEdges,
        },
        structuralDiff: structuralDiff as any,
        baselineMetrics: baselineMetrics as any,
        candidateMetrics: candidateMetrics as any,
        recommendations: recommendations as any,
        status: "DRAFT",
        createdById: userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "OPTIMIZATION_CANDIDATE_CREATED",
      targetType: "OPTIMIZATION_CANDIDATE",
      targetId: candidate.id,
      metadata: {
        workflowId: input.workflowId,
        title: input.title,
        baselineHash: baselineArtifactHash,
        candidateHash: candidateArtifactHash,
      },
    });

    return candidate;
  }

  /**
   * Promotes an approved candidate into the workflow's active draft version.
   * Never mutates existing releases or production silently.
   */
  async promoteCandidateToDraft(
    workspaceId: string,
    userId: string,
    candidateId: string
  ) {
    const candidate = await prisma.workflowOptimizationCandidate.findFirst({
      where: { id: candidateId, workspaceId },
      include: { workflow: true },
    });

    if (!candidate) {
      throw new Error("Optimization candidate not found.");
    }

    const proposed = candidate.proposedChanges as any;
    const newNodes = proposed?.nodes || [];
    const newEdges = proposed?.edges || [];

    // Get current max version
    const latest = await prisma.workflowVersion.findFirst({
      where: { workflowId: candidate.workflowId },
      orderBy: { version: "desc" },
    });

    const nextVersionNum = (latest?.version || 1) + 1;

    // Create new workflow version
    const newVersion = await prisma.workflowVersion.create({
      data: {
        workflowId: candidate.workflowId,
        version: nextVersionNum,
        changeSummary: `Promoted optimization candidate: ${candidate.title}`,
        createdById: userId,
        nodes: newNodes,
        edges: newEdges,
        isValid: true,
      },
    });

    // Mark candidate as PROMOTED
    const updatedCandidate = await prisma.workflowOptimizationCandidate.update({
      where: { id: candidateId },
      data: { status: "PROMOTED" },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "OPTIMIZATION_CANDIDATE_PROMOTED",
      targetType: "OPTIMIZATION_CANDIDATE",
      targetId: candidateId,
      metadata: {
        workflowId: candidate.workflowId,
        newVersionNumber: nextVersionNum,
      },
    });

    return {
      candidate: updatedCandidate,
      newVersion,
    };
  }

  /**
   * List optimization candidates for a workflow.
   */
  async listCandidates(workspaceId: string, workflowId: string) {
    return prisma.workflowOptimizationCandidate.findMany({
      where: { workspaceId, workflowId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get single optimization candidate by ID.
   */
  async getCandidate(workspaceId: string, candidateId: string) {
    return prisma.workflowOptimizationCandidate.findFirst({
      where: { id: candidateId, workspaceId },
      include: { workflow: { select: { id: true, name: true } } },
    });
  }

  /**
   * Compute structural diff between baseline and candidate.
   */
  private computeStructuralDiff(
    baseNodes: any[],
    baseEdges: any[],
    candNodes: any[],
    candEdges: any[]
  ) {
    const baseNodeMap = new Map<string, any>(baseNodes.map((n) => [n.id, n]));
    const candNodeMap = new Map<string, any>(candNodes.map((n) => [n.id, n]));

    const addedNodes = candNodes.filter((n) => !baseNodeMap.has(n.id));
    const removedNodes = baseNodes.filter((n) => !candNodeMap.has(n.id));
    const modifiedNodes = candNodes.filter((n) => {
      const base = baseNodeMap.get(n.id);
      if (!base) return false;
      return JSON.stringify(base.data || {}) !== JSON.stringify(n.data || {});
    });

    const baseEdgeKeys = new Set(baseEdges.map((e) => `${e.source}->${e.target}`));
    const candEdgeKeys = new Set(candEdges.map((e) => `${e.source}->${e.target}`));

    const addedEdges = candEdges.filter((e) => !baseEdgeKeys.has(`${e.source}->${e.target}`));
    const removedEdges = baseEdges.filter((e) => !candEdgeKeys.has(`${e.source}->${e.target}`));

    return {
      addedNodes: addedNodes.map((n) => ({ id: n.id, label: n.data?.label || n.id, type: n.type })),
      removedNodes: removedNodes.map((n) => ({ id: n.id, label: n.data?.label || n.id, type: n.type })),
      modifiedNodes: modifiedNodes.map((n) => ({ id: n.id, label: n.data?.label || n.id })),
      addedEdges: addedEdges.map((e) => ({ source: e.source, target: e.target })),
      removedEdges: removedEdges.map((e) => ({ source: e.source, target: e.target })),
    };
  }

  /**
   * Compute workflow metrics snapshot.
   */
  private computeMetrics(nodes: any[], edges: any[]): WorkflowMetricsSnapshot {
    let externalCallCount = 0;
    let estimatedDurationMs = 15; // base overhead

    for (const node of nodes) {
      const nodeType = (node.data?.nodeType || node.type || "ACTION").toUpperCase();
      if (nodeType === "HTTP" || nodeType === "INTEGRATION" || nodeType === "CUSTOM_INTEGRATION") {
        externalCallCount++;
        estimatedDurationMs += 120;
      } else if (nodeType === "LOOP") {
        estimatedDurationMs += 80;
      } else {
        estimatedDurationMs += 10;
      }
    }

    // Complexity score based on cyclomatic edges & nodes
    const complexityScore = Math.max(1, edges.length - nodes.length + 2);

    return {
      nodeCount: nodes.length,
      estimatedDurationMs,
      externalCallCount,
      redundantNodeCount: 0,
      complexityScore,
    };
  }

  /**
   * Generate evidence-backed optimization recommendations.
   */
  private generateRecommendations(
    baseNodes: any[],
    baseEdges: any[],
    candNodes: any[],
    candEdges: any[]
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // 1. Redundant consecutive transforms detection
    for (let i = 0; i < baseNodes.length - 1; i++) {
      const n1 = baseNodes[i];
      const n2 = baseNodes[i + 1];
      const t1 = (n1.data?.nodeType || n1.type || "").toUpperCase();
      const t2 = (n2.data?.nodeType || n2.type || "").toUpperCase();
      if ((t1 === "TRANSFORM" || t1 === "ACTION") && (t2 === "TRANSFORM" || t2 === "ACTION")) {
        const edge = baseEdges.find((e) => e.source === n1.id && e.target === n2.id);
        if (edge) {
          recommendations.push({
            id: `rec_merge_${n1.id}_${n2.id}`,
            type: "REMOVE_REDUNDANT_TRANSFORM",
            title: `Consolidate consecutive transformations (${n1.data?.label || n1.id} -> ${n2.data?.label || n2.id})`,
            targetNodeId: n2.id,
            targetNodeLabel: n2.data?.label || n2.id,
            evidence: "Two consecutive linear data transform steps can be consolidated into a single mapping step.",
            proposedAction: "Merge intermediate mapping expressions into a single transformation node.",
            expectedBenefit: "Reduces execution latency by ~15ms and eliminates unnecessary checkpoint storage.",
            riskAssessment: "Low risk if output schema is preserved.",
            confidence: 0.95,
            safeToApply: true,
          });
        }
      }
    }

    // 2. Condition before expensive external calls
    const externalNodes = baseNodes.filter((n) => {
      const t = (n.data?.nodeType || n.type || "").toUpperCase();
      return t === "HTTP" || t === "INTEGRATION";
    });

    for (const ext of externalNodes) {
      // Check if external node has a guard condition upstream
      const incoming = baseEdges.filter((e) => e.target === ext.id);
      const hasConditionUpstream = incoming.some((e) => {
        const src = baseNodes.find((n) => n.id === e.source);
        return (src?.data?.nodeType || src?.type || "").toUpperCase() === "CONDITION";
      });

      if (!hasConditionUpstream && incoming.length > 0) {
        recommendations.push({
          id: `rec_guard_${ext.id}`,
          type: "ADD_CONDITION_BEFORE_ACTION",
          title: `Add input validation condition before external action '${ext.data?.label || ext.id}'`,
          targetNodeId: ext.id,
          targetNodeLabel: ext.data?.label || ext.id,
          evidence: `External outbound call '${ext.data?.label || ext.id}' is executed without prior validation guard.`,
          proposedAction: "Insert a condition node before this step to verify required payload parameters exist.",
          expectedBenefit: "Prevents unnecessary 4xx/5xx external API requests and reduces quota consumption.",
          riskAssessment: "Ensure fallback branch handles invalid inputs appropriately.",
          confidence: 0.88,
          safeToApply: true,
        });
      }
    }

    // 3. Retry policy recommendation for HTTP nodes
    for (const ext of externalNodes) {
      const config = ext.data?.config || {};
      if (!config.retryPolicy || config.retryPolicy.maxRetries === 0) {
        recommendations.push({
          id: `rec_retry_${ext.id}`,
          type: "TUNE_RETRY_POLICY",
          title: `Configure exponential backoff retry for '${ext.data?.label || ext.id}'`,
          targetNodeId: ext.id,
          targetNodeLabel: ext.data?.label || ext.id,
          evidence: "Outbound step has no exponential backoff retry configured against transient provider failures.",
          proposedAction: "Set retry policy with 3 attempts and exponential jitter (1000ms base delay).",
          expectedBenefit: "Increases workflow resilience against transient network blips and 503 errors.",
          riskAssessment: "Action must be idempotent to avoid duplicate execution.",
          confidence: 0.92,
          safeToApply: true,
        });
      }
    }

    return recommendations;
  }
}

export const workflowOptimizationService = new WorkflowOptimizationService();
