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
  resumeNodeId?: string;
}

export interface WorkflowRunResult {
  executionId: string;
  status: "SUCCESS" | "FAILED" | "CANCELLED" | "WAITING_APPROVAL";
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

  // 1. Fetch current execution record to check if already cancelled
  const initialExecution = await prisma.workflowExecution.findUnique({
    where: { id: options.executionId },
  });

  if (!initialExecution) {
    return {
      executionId: options.executionId,
      status: "FAILED",
      stepsExecuted: 0,
      errorSummary: "Execution record not found",
      durationMs: Date.now() - startTime,
    };
  }

  if (initialExecution.status === ExecutionStatus.CANCELLED) {
    return {
      executionId: options.executionId,
      status: "CANCELLED",
      stepsExecuted: 0,
      errorSummary: initialExecution.cancellationReason || "Execution was cancelled",
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Update execution record to RUNNING
  await prisma.workflowExecution.update({
    where: { id: options.executionId },
    data: {
      status: ExecutionStatus.RUNNING,
      startedAt: initialExecution.startedAt || new Date(),
      correlationId,
      attempt,
      triggerEvent: options.triggerPayload as any,
    },
  });

  // 3. Load Workflow and its Version
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
  if (!triggerNode && !options.resumeNodeId) {
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

  // 4. Initialize Execution Context (or restore from saved state on resume)
  const savedState = initialExecution.executionState as any;
  const rawTrigger = options.triggerPayload || {};
  const normalizedTrigger =
    typeof rawTrigger === "object" && rawTrigger !== null && rawTrigger.body !== undefined
      ? rawTrigger
      : { ...rawTrigger, body: rawTrigger };

  const context: ExecutionContext = savedState?.context || {
    trigger: normalizedTrigger,
    steps: {},
    env: {
      WORKFLOW_ID: workflow.id,
      WORKFLOW_NAME: workflow.name,
      EXECUTION_ID: options.executionId,
    },
  };

  // 5. Graph Topology Setup
  const outgoingEdges = new Map<string, any[]>();
  const incomingEdges = new Map<string, any[]>();

  for (const node of nodes) {
    outgoingEdges.set(node.id, []);
    incomingEdges.set(node.id, []);
  }

  for (const edge of edges) {
    outgoingEdges.get(edge.source)?.push(edge);
    incomingEdges.get(edge.target)?.push(edge);
  }

  // Restore visited set and active branches from saved state if resuming
  const visited = new Set<string>(savedState?.visited || []);
  const activeBranches = new Map<string, string | null>(
    savedState?.activeBranches ? Object.entries(savedState.activeBranches) : []
  );
  const skippedNodes = new Set<string>();
  const skippedEdges = new Set<string>();

  // Determine starting node(s)
  const queue: string[] = [];
  if (options.resumeNodeId) {
    // If resuming at a specific node
    queue.push(options.resumeNodeId);
  } else if (triggerNode) {
    queue.push(triggerNode.id);
  }

  let stepsExecutedCount = 0;
  const executionTrace: Array<{ nodeId: string; status: string; durationMs: number; branch?: string }> =
    savedState?.executionTrace || [];

  while (queue.length > 0) {
    // Check if cancellation was requested mid-execution
    const currentStatusCheck = await prisma.workflowExecution.findUnique({
      where: { id: options.executionId },
      select: { status: true, cancellationReason: true },
    });

    if (currentStatusCheck?.status === ExecutionStatus.CANCELLED) {
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          executionTrace: executionTrace as any,
        },
      });
      return {
        executionId: options.executionId,
        status: "CANCELLED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: currentStatusCheck.cancellationReason || "Workflow execution cancelled",
        durationMs: Date.now() - startTime,
      };
    }

    const currentNodeId = queue.shift()!;
    if (visited.has(currentNodeId) && currentNodeId !== options.resumeNodeId) continue;
    if (skippedNodes.has(currentNodeId)) continue;

    const node = nodeMap.get(currentNodeId);
    if (!node) continue;

    // Check if all incoming dependencies have completed or been skipped
    const incoming = incomingEdges.get(currentNodeId) || [];
    let canExecute = true;

    for (const inEdge of incoming) {
      if (skippedEdges.has(inEdge.id)) {
        continue; // Upstream branch was not chosen, so don't wait on this edge
      }

      if (!visited.has(inEdge.source) && inEdge.source !== options.resumeNodeId) {
        canExecute = false;
        break;
      }

      // Check condition routing from source node
      const sourceBranch = activeBranches.get(inEdge.source);
      if (sourceBranch !== undefined && sourceBranch !== null) {
        const edgeHandle = inEdge.sourceHandle || (inEdge.label || "").toLowerCase();
        if (edgeHandle && edgeHandle !== sourceBranch) {
          canExecute = false;
          skippedEdges.add(inEdge.id);
          break;
        }
      }
    }

    if (!canExecute && incoming.length > 0 && currentNodeId !== options.resumeNodeId) {
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

    // Execute Node Handler
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

    // Check for Human Approval Pause Signal
    if (result.outputData?.waitingForApproval) {
      await prisma.workflowStepExecution.update({
        where: { id: stepRecord.id },
        data: {
          status: ExecutionStatus.PENDING,
          outputData: (result.outputData as any) || null,
          finishedAt: new Date(),
          durationMs: stepDuration,
        },
      });

      // Save execution state for durable pause/resume
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.WAITING_APPROVAL,
          executionState: {
            context,
            visited: Array.from(visited),
            activeBranches: Object.fromEntries(activeBranches),
            executionTrace,
            pausedNodeId: currentNodeId,
          },
        },
      });

      return {
        executionId: options.executionId,
        status: "WAITING_APPROVAL",
        stepsExecuted: stepsExecutedCount,
        durationMs: Date.now() - startTime,
      };
    }

    // Persist standard step result
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
      branch: result.selectedBranch || undefined,
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
          executionState: { context, visited: Array.from(visited) },
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

    // Branching logic for Condition / Decision nodes
    if (result.selectedBranch) {
      activeBranches.set(currentNodeId, result.selectedBranch);
    }

    // Enqueue downstream target nodes
    const outEdges = outgoingEdges.get(currentNodeId) || [];
    for (const edge of outEdges) {
      if (result.selectedBranch) {
        const edgeHandle = edge.sourceHandle || (edge.label || "").toLowerCase();
        if (edgeHandle && edgeHandle !== result.selectedBranch) {
          skippedEdges.add(edge.id);
          continue; // Skip edges that don't match the taken branch
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
      executionState: { context, visited: Array.from(visited) },
    },
  });

  return {
    executionId: options.executionId,
    status: "SUCCESS",
    stepsExecuted: stepsExecutedCount,
    durationMs: totalDuration,
  };
}
