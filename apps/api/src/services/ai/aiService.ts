import { prisma } from "@flowforge/database";
import {
  AiWorkflowProposal,
  AiRefinementProposal,
  AiWorkflowExplanation,
  AiExecutionDebugReport,
  AiOptimizationReport,
  AiTestCaseProposal,
  AiSubsystemStatus,
  GenerateWorkflowPromptInput,
  RefineWorkflowPromptInput,
  ExplainWorkflowInput,
  validateWorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
} from "@flowforge/shared";
import { config } from "../../config.js";
import { getAiProvider } from "./provider.js";
import { buildRegistryContextPrompt } from "./registryGroundedPrompt.js";
import { entitlementService } from "../entitlements.js";
import { diagnosticsService } from "../diagnostics.js";
import { redactSensitiveData } from "../tracing.js";

export class AiService {
  /**
   * Retrieves overall status and quota availability of the AI subsystem.
   */
  async getStatus(workspaceId: string): Promise<AiSubsystemStatus> {
    const provider = getAiProvider();
    const quota = await entitlementService.canExecuteAiRequest(workspaceId);

    return {
      enabled: config.aiEnabled,
      provider: provider.name,
      model: config.aiModel,
      isConfigured: provider.isConfigured(),
      quotaRemaining: quota.remaining,
      monthlyQuota: quota.limit,
    };
  }

  /**
   * Checks whether AI request is allowed; throws structured error if disabled or quota exceeded.
   */
  private async ensureAiPermitted(workspaceId: string) {
    if (!config.aiEnabled) {
      const err: any = new Error("The AI automation subsystem is disabled by workspace administrator or environment configuration.");
      err.statusCode = 503;
      err.code = "AI_DISABLED";
      throw err;
    }

    const provider = getAiProvider();
    if (!provider.isConfigured()) {
      const err: any = new Error("AI provider is enabled but unconfigured. Missing API key or provider endpoint credentials.");
      err.statusCode = 503;
      err.code = "AI_UNCONFIGURED";
      throw err;
    }

    const quota = await entitlementService.canExecuteAiRequest(workspaceId);
    if (!quota.allowed) {
      const err: any = new Error(quota.reason || "Monthly AI automation quota exceeded for this workspace plan.");
      err.statusCode = 429;
      err.code = "AI_QUOTA_EXCEEDED";
      throw err;
    }
  }

  /**
   * Generates a registry-grounded workflow proposal from a natural-language description.
   */
  async generateWorkflowProposal(
    workspaceId: string,
    userId: string,
    input: GenerateWorkflowPromptInput
  ): Promise<AiWorkflowProposal> {
    await this.ensureAiPermitted(workspaceId);

    const provider = getAiProvider();
    const registryPrompt = buildRegistryContextPrompt();

    const systemPrompt = `
${registryPrompt}

Task: Generate a complete, syntactically valid FlowForge workflow proposal based on the user's prompt.
Output strictly JSON matching this structure:
{
  "name": "string",
  "description": "string",
  "triggerType": "WEBHOOK" | "SCHEDULE" | "MANUAL",
  "nodes": [...FlowForge nodes with id, type: 'custom', position: {x,y}, data: {label, nodeType, config}],
  "edges": [...FlowForge edges with id, source, target],
  "requiredIntegrations": ["slack", "google-sheets", etc.],
  "requiredVariables": ["STRIPE_API_KEY", etc.],
  "assumptions": ["string"],
  "suggestedTests": [
    {
      "name": "string",
      "description": "string",
      "mockPayload": {},
      "assertions": [{"target": "string", "operator": "EQUALS"|"CONTAINS"|"EXISTS"|"GREATER_THAN"|"NOT_EMPTY", "expected": any}],
      "targetScenario": "HAPPY_PATH"|"EDGE_CASE"|"ERROR_HANDLING"|"BOUNDARY_CONDITION"
    }
  ]
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: input.prompt,
    });

    const proposalData = response.data;
    const nodes = (proposalData.nodes || []) as WorkflowNode[];
    const edges = (proposalData.edges || []) as WorkflowEdge[];

    // Deterministic validation pass
    const validation = validateWorkflowGraph(nodes, edges);

    // Audit logging
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "ai.workflow_generated",
        targetType: "WORKFLOW_PROPOSAL",
        targetId: proposalData.name || "ai_proposal",
        metadata: {
          promptLength: input.prompt.length,
          nodesCount: nodes.length,
          isValid: validation.isValid,
          provider: response.provider,
        },
      },
    });

    // Record usage
    await entitlementService.recordAiUsage(workspaceId, "generate-workflow");

    return {
      name: input.workflowName || proposalData.name || "AI Generated Automation",
      description: proposalData.description || `Generated from: ${input.prompt.substring(0, 80)}`,
      triggerType: proposalData.triggerType || "WEBHOOK",
      nodes,
      edges,
      requiredIntegrations: proposalData.requiredIntegrations || [],
      requiredVariables: proposalData.requiredVariables || [],
      assumptions: proposalData.assumptions || [],
      suggestedTests: proposalData.suggestedTests || [],
      validation,
      provider: response.provider,
      model: response.model,
      isSimulated: response.isSimulated,
    };
  }

  /**
   * Refines an existing workflow definition using natural-language instructions.
   */
  async refineWorkflowProposal(
    workspaceId: string,
    userId: string,
    input: RefineWorkflowPromptInput
  ): Promise<AiRefinementProposal> {
    await this.ensureAiPermitted(workspaceId);

    const provider = getAiProvider();
    const registryPrompt = buildRegistryContextPrompt();

    // Redact secrets from current definition before passing to model
    const sanitizedNodes = redactSensitiveData(input.currentNodes);
    const sanitizedEdges = redactSensitiveData(input.currentEdges);

    const systemPrompt = `
${registryPrompt}

Task: Refine and modify a FlowForge workflow based on the user's instructions.
Output strictly JSON matching this structure:
{
  "summary": "string",
  "explanation": "string",
  "diff": {
    "addedNodes": [{"id": "string", "label": "string", "nodeType": "string"}],
    "removedNodes": [{"id": "string", "label": "string"}],
    "modifiedNodes": [{"id": "string", "label": "string", "changes": ["string"]}],
    "edgeChanges": {"added": number, "removed": number}
  },
  "proposedNodes": [...updated nodes],
  "proposedEdges": [...updated edges]
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: JSON.stringify({
        prompt: input.prompt,
        currentNodes: sanitizedNodes,
        currentEdges: sanitizedEdges,
      }),
    });

    const data = response.data;
    const proposedNodes = (data.proposedNodes || []) as WorkflowNode[];
    const proposedEdges = (data.proposedEdges || []) as WorkflowEdge[];

    const validation = validateWorkflowGraph(proposedNodes, proposedEdges);

    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "ai.workflow_refined",
        targetType: "WORKFLOW",
        targetId: input.workflowId || "draft",
        metadata: {
          prompt: input.prompt.substring(0, 100),
          isValid: validation.isValid,
        },
      },
    });

    await entitlementService.recordAiUsage(workspaceId, "refine-workflow");

    return {
      summary: data.summary || "Workflow updated based on instructions",
      explanation: data.explanation || "Modified topology and configuration according to requested changes.",
      diff: data.diff || {
        addedNodes: [],
        removedNodes: [],
        modifiedNodes: [],
        edgeChanges: { added: 0, removed: 0 },
      },
      proposedNodes,
      proposedEdges,
      validation,
      provider: response.provider,
      isSimulated: response.isSimulated,
    };
  }

  /**
   * Explains an existing workflow graph in plain, understandable English.
   */
  async explainWorkflow(
    workspaceId: string,
    input: ExplainWorkflowInput
  ): Promise<AiWorkflowExplanation> {
    await this.ensureAiPermitted(workspaceId);

    const provider = getAiProvider();
    const sanitizedNodes = redactSensitiveData(input.nodes);
    const sanitizedEdges = redactSensitiveData(input.edges);

    const systemPrompt = `
Task: Explain a FlowForge workflow based on its genuine nodes and connections.
Output strictly JSON matching this structure:
{
  "summary": "string",
  "triggerDetails": "string",
  "mainExecutionPath": ["step 1", "step 2"],
  "branchingAndConditions": ["condition notes"],
  "loopsAndApprovals": ["loop or approval notes"],
  "integrationDependencies": ["connected account requirements"],
  "dataFlowAndTransformations": ["data passing notes"],
  "errorAndRetryBehavior": "string",
  "securityAndReliabilityNotes": ["security safeguards"]
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: JSON.stringify({
        name: input.name,
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
      }),
    });

    await entitlementService.recordAiUsage(workspaceId, "explain-workflow");

    const data = response.data;
    return {
      summary: data.summary || "Summary of automated workflow operations.",
      triggerDetails: data.triggerDetails || "Workflow trigger conditions.",
      mainExecutionPath: data.mainExecutionPath || [],
      branchingAndConditions: data.branchingAndConditions || [],
      loopsAndApprovals: data.loopsAndApprovals || [],
      integrationDependencies: data.integrationDependencies || [],
      dataFlowAndTransformations: data.dataFlowAndTransformations || [],
      errorAndRetryBehavior: data.errorAndRetryBehavior || "Standard error handling.",
      securityAndReliabilityNotes: data.securityAndReliabilityNotes || [],
      provider: response.provider,
      isSimulated: response.isSimulated,
    };
  }

  /**
   * Intelligently analyzes an execution failure using authorized diagnostic records.
   */
  async debugExecution(
    workspaceId: string,
    executionId: string
  ): Promise<AiExecutionDebugReport> {
    await this.ensureAiPermitted(workspaceId);

    const execution = await prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        workflow: { workspaceId },
      },
      include: {
        workflow: { select: { id: true, name: true } },
        steps: { orderBy: { startedAt: "asc" } },
      },
    });

    if (!execution) {
      const err: any = new Error("Execution record not found or unauthorized.");
      err.statusCode = 404;
      throw err;
    }

    const failureSummary = diagnosticsService.generateFailureSummary(execution, execution.steps);
    const sanitizedSteps = redactSensitiveData(
      execution.steps.map((s) => ({
        nodeId: s.nodeId,
        nodeName: s.nodeName,
        status: s.status,
        errorCategory: s.errorCategory,
        errorMessage: s.errorMessage,
        durationMs: s.durationMs,
      }))
    );

    const provider = getAiProvider();
    const systemPrompt = `
Task: Analyze an execution failure using real diagnostic records.
Output strictly JSON matching this structure:
{
  "conciseSummary": "string",
  "probableCause": "string",
  "supportingEvidence": ["evidence 1", "evidence 2"],
  "uncertaintyLevel": "LOW" | "MEDIUM" | "HIGH",
  "remediationSteps": ["step 1", "step 2"],
  "suggestedPatch": {
    "action": "UPDATE_CONFIG" | "ADD_VALIDATION" | "ADJUST_RETRY",
    "nodeId": "string",
    "patchDescription": "string",
    "modifiedConfig": {}
  }
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: JSON.stringify({
        executionStatus: execution.status,
        errorSummary: execution.errorSummary,
        failureSummary,
        steps: sanitizedSteps,
      }),
    });

    await entitlementService.recordAiUsage(workspaceId, "debug-execution");

    const data = response.data;
    return {
      executionId: execution.id,
      workflowId: execution.workflow.id,
      workflowName: execution.workflow.name,
      status: execution.status,
      failingNodeId: failureSummary?.failingNodeId,
      failingNodeName: failureSummary?.failingNodeName,
      errorCategory: failureSummary?.errorCategory || "INTERNAL_ERROR",
      conciseSummary: data.conciseSummary || failureSummary?.errorMessage || "Execution terminated unexpectedly.",
      probableCause: data.probableCause || "Root cause identified in step execution.",
      supportingEvidence: data.supportingEvidence || [],
      uncertaintyLevel: data.uncertaintyLevel || "LOW",
      remediationSteps: data.remediationSteps || [failureSummary?.suggestedAction || "Inspect recent execution logs."],
      suggestedPatch: data.suggestedPatch,
      provider: response.provider,
      isSimulated: response.isSimulated,
    };
  }

  /**
   * Generates evidence-based workflow optimization recommendations from historical execution telemetry.
   */
  async optimizeWorkflow(
    workspaceId: string,
    workflowId: string,
    timeRangeDays = 14
  ): Promise<AiOptimizationReport> {
    await this.ensureAiPermitted(workspaceId);

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: { id: true, name: true },
    });

    if (!workflow) {
      const err: any = new Error("Workflow not found or unauthorized.");
      err.statusCode = 404;
      throw err;
    }

    const sinceDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
    const executions = await prisma.workflowExecution.findMany({
      where: {
        workflowId,
        createdAt: { gte: sinceDate },
      },
      select: {
        id: true,
        status: true,
        durationMs: true,
        errorCategory: true,
        attempt: true,
      },
      take: 200,
    });

    const provider = getAiProvider();
    const systemPrompt = `
Task: Analyze workflow performance and optimization based on genuine execution telemetry.
Output strictly JSON matching this structure:
{
  "recommendations": [
    {
      "id": "string",
      "type": "REPEATED_FAILURES" | "HIGH_LATENCY" | "MISSING_RETRY" | "PAYLOAD_OPTIMIZATION" | "BATCHING_OPPORTUNITY",
      "title": "string",
      "targetNodeId": "string",
      "targetNodeLabel": "string",
      "evidence": "string",
      "analyzedPeriod": "string",
      "estimatedImpact": "string",
      "riskAssessment": "string",
      "suggestedFix": "string"
    }
  ]
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: JSON.stringify({
        workflowName: workflow.name,
        executionCount: executions.length,
        failedCount: executions.filter((e) => e.status === "FAILED").length,
        avgDurationMs:
          executions.length > 0
            ? Math.round(executions.reduce((acc, e) => acc + (e.durationMs || 0), 0) / executions.length)
            : 0,
      }),
    });

    await entitlementService.recordAiUsage(workspaceId, "optimize-workflow");

    const data = response.data;
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      analyzedExecutionsCount: executions.length,
      recommendations: data.recommendations || [],
      provider: response.provider,
      isSimulated: response.isSimulated,
    };
  }

  /**
   * Generates automated test cases and assertions compatible with Phase 12 testing engine.
   */
  async generateTestCases(
    workspaceId: string,
    workflowId: string,
    count = 3
  ): Promise<AiTestCaseProposal[]> {
    await this.ensureAiPermitted(workspaceId);

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!workflow) {
      const err: any = new Error("Workflow not found or unauthorized.");
      err.statusCode = 404;
      throw err;
    }

    const versionSnapshot = workflow.versions[0];
    const rawNodes = (versionSnapshot?.nodes as any[]) || [];

    const provider = getAiProvider();
    const systemPrompt = `
Task: Generate automated test cases for this FlowForge workflow.
Assertions MUST use valid operators: "EQUALS", "CONTAINS", "EXISTS", "GREATER_THAN", "NOT_EMPTY".
Output strictly JSON matching this structure:
{
  "testCases": [
    {
      "name": "string",
      "description": "string",
      "mockPayload": {},
      "assertions": [{"target": "string", "operator": "EQUALS", "expected": any}],
      "targetScenario": "HAPPY_PATH" | "EDGE_CASE" | "ERROR_HANDLING" | "BOUNDARY_CONDITION"
    }
  ]
}
`.trim();

    const response = await provider.generateStructured<any>({
      systemPrompt,
      userPrompt: JSON.stringify({
        workflowName: workflow.name,
        nodeCount: rawNodes.length,
        nodes: redactSensitiveData(rawNodes),
        requestedCount: count,
      }),
    });

    await entitlementService.recordAiUsage(workspaceId, "generate-tests");

    const data = response.data;
    return data.testCases || [];
  }
}

export const aiService = new AiService();
