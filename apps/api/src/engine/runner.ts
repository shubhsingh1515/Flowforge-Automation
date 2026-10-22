import { prisma, ExecutionStatus } from "@flowforge/database";
import { defaultRegistry } from "./registry.js";
import { ExecutionContext } from "./mapping/resolver.js";
import { ExecutionErrorCategory } from "./types.js";

export interface WorkflowRunOptions {
  workflowId: string;
  executionId: string;
  versionId?: string | null;
  triggerPayload: any;
  correlationId?: string;
  attempt?: number;
}

export interface WorkflowRunResult {
  executionId: string;
  status: "SUCCESS" | "FAILED" | "CANCELLED";
  stepsExecuted: number;
  errorSummary?: string;
  errorCategory?: ExecutionErrorCategory;
  durationMs: number;
}

export async function runWorkflowExecution(
  options: WorkflowRunOptions
): Promise<WorkflowRunResult> {
  const startTime = Date.now();
  const correlationId = options.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const attempt = options.attempt || 1;

  // 1. Update execution record to RUNNING
  await prisma.workflowExecution.update({
    where: { id: options.executionId },
    data: {
      status: ExecutionStatus.RUNNING,
      startedAt: new Date(),
      correlationId,
      attempt,
      triggerEvent: options.triggerPayload as any,
    },
  });

  // 2. Load Workflow and its Version
  const workflow = await prisma.workflow.findUnique({
    where: { id: options.workflowId },
    include: {
      versions: {
        where: options.versionId ? { id: options.versionId } : undefined,
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!workflow || workflow.versions.length === 0) {
    const errorMsg = "Workflow or workflow version not found.";
    await prisma.workflowExecution.update({
      where: { id: options.executionId },
      data: {
        status: ExecutionStatus.FAILED,
        finishedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorSummary: errorMsg,
        errorCategory: "INVALID_CONFIG",
      },
    });
    return {
      executionId: options.executionId,
      status: "FAILED",
      stepsExecuted: 0,
      errorSummary: errorMsg,
      errorCategory: "INVALID_CONFIG",
      durationMs: Date.now() - startTime,
    };
  }

  const version = workflow.versions[0];
  const nodes: any[] = Array.isArray(version.nodes) ? version.nodes : [];
  const edges: any[] = Array.isArray(version.edges) ? version.edges : [];

  const nodeMap = new Map<string, any>(nodes.map((n) => [n.id, n]));

  // Find Trigger Node
  const triggerNode = nodes.find((n) => n.data?.nodeType === "TRIGGER");
  if (!triggerNode) {
    const errorMsg = "Workflow has no Trigger node configured.";
    await prisma.workflowExecution.update({
      where: { id: options.executionId },
      data: {
        status: ExecutionStatus.FAILED,
        finishedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorSummary: errorMsg,
        errorCategory: "INVALID_CONFIG",
      },
    });
    return {
      executionId: options.executionId,
      status: "FAILED",
      stepsExecuted: 0,
      errorSummary: errorMsg,
      errorCategory: "INVALID_CONFIG",
      durationMs: Date.now() - startTime,
    };
  }

  // 3. Initialize Execution Context
  const context: ExecutionContext = {
    trigger: options.triggerPayload || {},
    steps: {},
    env: {
      WORKFLOW_ID: workflow.id,
      WORKFLOW_NAME: workflow.name,
      EXECUTION_ID: options.executionId,
    },
  };

  // 4. DAG Traversal Setup
  // Map outgoing edges from each node: source -> Edge[]
  const outgoingEdges = new Map<string, any[]>();
  // Map incoming edges for dependency checking: target -> Edge[]
  const incomingEdges = new Map<string, any[]>();

  for (const node of nodes) {
    outgoingEdges.set(node.id, []);
    incomingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    outgoingEdges.get(edge.source)?.push(edge);
    incomingEdges.get(edge.target)?.push(edge);
  }

  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();
  const activeBranches = new Map<string, string | null>(); // nodeId -> selectedBranch

  let stepsExecutedCount = 0;
  const executionTrace: Array<{ nodeId: string; status: string; durationMs: number }> = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    if (visited.has(currentNodeId)) continue;

    const node = nodeMap.get(currentNodeId);
    if (!node) continue;

    // Check if all incoming dependencies have completed
    const incoming = incomingEdges.get(currentNodeId) || [];
    let canExecute = true;

    for (const inEdge of incoming) {
      // If the source node hasn't been visited, we cannot run yet
      if (!visited.has(inEdge.source)) {
        canExecute = false;
        break;
      }

      // If the source node was a condition, verify this edge matches the branch selected
      const sourceBranch = activeBranches.get(inEdge.source);
      if (sourceBranch !== undefined && sourceBranch !== null) {
        // Condition node edge
        const edgeHandle = inEdge.sourceHandle || (inEdge.label || "").toLowerCase();
        if (edgeHandle && edgeHandle !== sourceBranch) {
          canExecute = false;
          break;
        }
      }
    }

    if (!canExecute && incoming.length > 0) {
      continue;
    }

    // Step Execution Record in DB
    const stepStartTime = Date.now();
    const stepRecord = await prisma.workflowStepExecution.create({
      data: {
        executionId: options.executionId,
        nodeId: node.id,
        nodeName: node.data?.label || node.id,
        nodeType: node.data?.nodeType || "ACTION",
        status: ExecutionStatus.RUNNING,
        attempt,
        correlationId,
        inputData: context as any,
        startedAt: new Date(),
      },
    });

    const handler = defaultRegistry.getHandler(
      node.data?.nodeType || "ACTION",
      node.data?.integrationKey
    );

    if (!handler) {
      const errorMsg = `No registered node handler for type '${node.data?.nodeType}'.`;
      await prisma.workflowStepExecution.update({
        where: { id: stepRecord.id },
        data: {
          status: ExecutionStatus.FAILED,
          errorMessage: errorMsg,
          errorCategory: "INVALID_CONFIG",
          finishedAt: new Date(),
          durationMs: Date.now() - stepStartTime,
        },
      });

      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: errorMsg,
          errorCategory: "INVALID_CONFIG",
          executionTrace: executionTrace as any,
        },
      });

      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount + 1,
        errorSummary: errorMsg,
        errorCategory: "INVALID_CONFIG",
        durationMs: Date.now() - startTime,
      };
    }

    // Execute Node
    let result;
    try {
      result = await handler.execute({
        nodeId: node.id,
        nodeName: node.data?.label || node.id,
        nodeType: node.data?.nodeType || "ACTION",
        config: node.data?.config || {},
        context,
        executionId: options.executionId,
        workflowId: workflow.id,
        correlationId,
        attempt,
      });
    } catch (err: any) {
      result = {
        status: "FAILED" as const,
        errorCategory: "INTERNAL_ERROR" as const,
        errorMessage: err.message || "Unhandled node execution error.",
      };
    }

    const stepDuration = Date.now() - stepStartTime;
    stepsExecutedCount++;
    visited.add(currentNodeId);

    // Persist step result
    await prisma.workflowStepExecution.update({
      where: { id: stepRecord.id },
      data: {
        status: result.status === "SUCCESS" ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED,
        outputData: (result.outputData as any) || null,
        errorMessage: result.errorMessage || null,
        errorCategory: result.errorCategory || null,
        finishedAt: new Date(),
        durationMs: stepDuration,
      },
    });

    executionTrace.push({
      nodeId: currentNodeId,
      status: result.status,
      durationMs: stepDuration,
    });

    // Update Context
    context.steps[currentNodeId] = {
      input: node.data?.config,
      output: result.outputData,
      status: result.status,
    };

    if (result.status === "FAILED") {
      const summary = result.errorMessage || `Step '${node.data?.label || node.id}' failed.`;
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: summary,
          errorCategory: result.errorCategory || "INTERNAL_ERROR",
          executionTrace: executionTrace as any,
        },
      });

      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: summary,
        errorCategory: result.errorCategory,
        durationMs: Date.now() - startTime,
      };
    }

    // Branching logic for Condition nodes
    if (result.selectedBranch) {
      activeBranches.set(currentNodeId, result.selectedBranch);
    }

    // Enqueue downstream target nodes
    const outEdges = outgoingEdges.get(currentNodeId) || [];
    for (const edge of outEdges) {
      // If edge is conditioned, check matching branch
      if (result.selectedBranch) {
        const edgeHandle = edge.sourceHandle || (edge.label || "").toLowerCase();
        if (edgeHandle && edgeHandle !== result.selectedBranch) {
          continue; // Skip branch that condition didn't take
        }
      }

      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // Finalize Workflow Execution as SUCCESS
  const totalDuration = Date.now() - startTime;
  await prisma.workflowExecution.update({
    where: { id: options.executionId },
    data: {
      status: ExecutionStatus.SUCCESS,
      finishedAt: new Date(),
      durationMs: totalDuration,
      executionTrace: executionTrace as any,
    },
  });

  return {
    executionId: options.executionId,
    status: "SUCCESS",
    stepsExecuted: stepsExecutedCount,
    durationMs: totalDuration,
  };
}
