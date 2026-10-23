import { outboundWebhookService } from "../services/outboundWebhooks.js";
import { outboxService } from "../services/outboxService.js";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { config } from "../config.js";
import { workflowExecutionsTotal, workflowExecutionDuration } from "../metrics.js";
import { entitlementService } from "../services/entitlements.js";
import { usageService } from "../services/usage.js";
import { defaultRegistry } from "./registry.js";
import { ExecutionContext } from "./mapping/resolver.js";
import { ExecutionErrorCategory } from "./types.js";
import { tracingService, redactSensitiveData } from "../services/tracing.js";
import { diagnosticsService } from "../services/diagnostics.js";
import { DiagnosticMilestone } from "@flowforge/shared";

export interface WorkflowRunOptions {
  workflowId: string;
  executionId: string;
  versionId?: string | null;
  triggerPayload: any;
  correlationId?: string;
  traceparent?: string;
  attempt?: number;
  resumeNodeId?: string;
  workerId?: string;
}

export interface WorkflowRunResult {
  executionId: string;
  status: "SUCCESS" | "FAILED" | "CANCELLED" | "WAITING_APPROVAL";
  stepsExecuted: number;
  errorSummary?: string;
  errorCategory?: ExecutionErrorCategory;
  durationMs: number;
}

async function executeWorkflowInternal(
  options: WorkflowRunOptions
): Promise<WorkflowRunResult> {
  const startTime = Date.now();
  const correlationId = options.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const attempt = options.attempt || 1;
  const traceCtx = tracingService.generateTraceContext(options.traceparent);

  // 1. Fetch current execution record to check if already cancelled or invalid
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

  const timelineMilestones: DiagnosticMilestone[] = [
    {
      id: `ms_queued_${options.executionId}`,
      type: "QUEUED",
      timestamp: new Date(initialExecution.createdAt).toISOString(),
      details: { attempt },
    },
    {
      id: `ms_started_${options.executionId}`,
      type: "STARTED",
      timestamp: new Date().toISOString(),
      details: { correlationId, traceparent: traceCtx.traceparent },
    },
  ];

  // Phase 15: Worker Leasing & Monotonically Increasing Fencing Token
  const workerId = options.workerId || `worker_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;
  const LEASE_DURATION_MS = 30000; // 30 second heartbeat lease
  const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
  const nextLeaseToken = (initialExecution.leaseToken || 0) + 1;

  // Atomically acquire lease
  const leaseAcquisition = await prisma.workflowExecution.updateMany({
    where: {
      id: options.executionId,
      status: { in: [ExecutionStatus.PENDING, ExecutionStatus.RUNNING, ExecutionStatus.WAITING_APPROVAL] },
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: new Date() } },
        { leaseOwner: workerId },
      ],
    },
    data: {
      status: ExecutionStatus.RUNNING,
      leaseOwner: workerId,
      leaseToken: nextLeaseToken,
      leaseExpiresAt,
      startedAt: initialExecution.startedAt || new Date(),
      correlationId,
      attempt,
      triggerEvent: options.triggerPayload as any,
    },
  });

  if (leaseAcquisition.count === 0) {
    return {
      executionId: options.executionId,
      status: "FAILED",
      stepsExecuted: 0,
      errorSummary: "Concurrent worker lease conflict: execution is currently owned by another worker with an unexpired lease.",
      errorCategory: "INTERNAL_ERROR",
      durationMs: Date.now() - startTime,
    };
  }

  const currentLeaseToken = nextLeaseToken;

  // Fencing token verification helper
  const verifyFencing = async (): Promise<boolean> => {
    const current = await prisma.workflowExecution.findUnique({
      where: { id: options.executionId },
      select: { leaseToken: true, status: true },
    });
    return !!(
      current &&
      current.leaseToken === currentLeaseToken &&
      current.status !== ExecutionStatus.CANCELLED
    );
  };

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

  // Phase 10 & 15: Resumption does not count as a new concurrency or quota allocation
  const isResumingExecution = !!(
    options.resumeNodeId ||
    initialExecution.lastCheckpointNodeId ||
    (initialExecution.recoveryAttempts && initialExecution.recoveryAttempts > 0)
  );

  if (!isResumingExecution) {
    const concurrentCheck = await entitlementService.canExecuteConcurrentWorkflow(workflow.workspaceId);
    if (!concurrentCheck.allowed) {
      const errorMsg = concurrentCheck.reason || "Concurrent execution quota exceeded for this workspace.";
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: errorMsg,
          errorCategory: "RESOURCE_LIMIT_EXCEEDED",
        },
      });
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: 0,
        errorSummary: errorMsg,
        errorCategory: "RESOURCE_LIMIT_EXCEEDED",
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Phase 6: Server-authoritative execution quota check
  if (!isResumingExecution) {
    const quotaCheck = await entitlementService.canExecuteWorkflow(workflow.workspaceId);
    if (!quotaCheck.allowed) {
      const errorMsg = quotaCheck.reason || "Monthly execution quota exceeded for this workspace.";
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: errorMsg,
          errorCategory: "RESOURCE_LIMIT_EXCEEDED",
        },
      });
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: 0,
        errorSummary: errorMsg,
        errorCategory: "RESOURCE_LIMIT_EXCEEDED",
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Phase 6: Durable idempotent usage recording
  await usageService.recordExecutionUsage({
    workspaceId: workflow.workspaceId,
    executionId: options.executionId,
  });

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

  // Phase 15 Checkpointing: Load all prior durable step executions
  const priorSteps = await prisma.workflowStepExecution.findMany({
    where: { executionId: options.executionId, status: ExecutionStatus.SUCCESS },
    orderBy: { startedAt: "asc" },
  });
  const checkpointedMap = new Map<string, any>(priorSteps.map((s) => [s.nodeId, s]));

  for (const past of priorSteps) {
    context.steps[past.nodeId] = {
      input: past.inputData,
      output: past.outputData,
      status: "SUCCESS",
    };
    visited.add(past.nodeId);
    if (past.branch) {
      activeBranches.set(past.nodeId, past.branch);
    }
  }

  // Determine starting node(s)
  const queue: string[] = [];
  if (options.resumeNodeId) {
    queue.push(options.resumeNodeId);
  } else if (priorSteps.length > 0) {
    // Checkpoint resumption: enqueue unvisited downstream targets from completed steps
    for (const past of priorSteps) {
      const outEdges = outgoingEdges.get(past.nodeId) || [];
      for (const edge of outEdges) {
        if (past.branch) {
          const edgeHandle = edge.sourceHandle || (edge.label || "").toLowerCase();
          if (edgeHandle && edgeHandle !== past.branch) {
            skippedEdges.add(edge.id);
            continue;
          }
        }
        if (!visited.has(edge.target) && !queue.includes(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
  } else if (triggerNode) {
    queue.push(triggerNode.id);
  }

  let stepsExecutedCount = 0;
  const executionTrace: Array<{ nodeId: string; status: string; durationMs: number; branch?: string }> =
    savedState?.executionTrace || [];

  for (const past of priorSteps) {
    if (!executionTrace.some((t) => t.nodeId === past.nodeId)) {
      executionTrace.push({
        nodeId: past.nodeId,
        status: "SUCCESS",
        durationMs: past.durationMs || 0,
        branch: past.branch || undefined,
      });
    }
  }

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

    // Phase 5: Resource limits & execution caps
    const maxDurationMs = (config.maxExecutionDurationSeconds || 300) * 1000;
    if (Date.now() - startTime > maxDurationMs) {
      const errorMsg = `Workflow execution exceeded maximum allowable duration of ${config.maxExecutionDurationSeconds}s`;
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: errorMsg,
          errorCategory: "TIMEOUT",
          executionTrace: executionTrace as any,
        },
      });
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: errorMsg,
        errorCategory: "TIMEOUT",
        durationMs: Date.now() - startTime,
      };
    }

    const maxSteps = config.maxWorkflowSteps || 500;
    if (stepsExecutedCount >= maxSteps) {
      const errorMsg = `Workflow execution exceeded maximum allowable steps limit of ${maxSteps}`;
      await prisma.workflowExecution.update({
        where: { id: options.executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorSummary: errorMsg,
          errorCategory: "RESOURCE_LIMIT_EXCEEDED",
          executionTrace: executionTrace as any,
        },
      });
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: errorMsg,
        errorCategory: "RESOURCE_LIMIT_EXCEEDED",
        durationMs: Date.now() - startTime,
      };
    }

    const currentNodeId = queue.shift()!;

    // Phase 15 Checkpoint Resumption: skip re-running nodes that already succeeded
    if (checkpointedMap.has(currentNodeId) && currentNodeId !== options.resumeNodeId) {
      const pastStep = checkpointedMap.get(currentNodeId)!;
      const outEdges = outgoingEdges.get(currentNodeId) || [];
      for (const edge of outEdges) {
        if (pastStep.branch) {
          const edgeHandle = edge.sourceHandle || (edge.label || "").toLowerCase();
          if (edgeHandle && edgeHandle !== pastStep.branch) {
            skippedEdges.add(edge.id);
            continue;
          }
        }
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
      continue;
    }

    if (visited.has(currentNodeId) && currentNodeId !== options.resumeNodeId) continue;
    if (skippedNodes.has(currentNodeId)) continue;

    const node = nodeMap.get(currentNodeId);
    if (!node) continue;

    // Check if all incoming dependencies have completed or been skipped
    const incoming = incomingEdges.get(currentNodeId) || [];
    let canExecute = true;

    for (const inEdge of incoming) {
      if (skippedEdges.has(inEdge.id)) {
        continue;
      }

      if (!visited.has(inEdge.source) && inEdge.source !== options.resumeNodeId) {
        canExecute = false;
        break;
      }

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

    if (!canExecute) {
      skippedNodes.add(currentNodeId);
      continue;
    }

    // Phase 15: Verify fencing token before step execution
    if (!(await verifyFencing())) {
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: "Execution fencing rejected: worker lease was preempted or lease expired before step execution.",
        errorCategory: "INTERNAL_ERROR",
        durationMs: Date.now() - startTime,
      };
    }

    // Step Execution Record in DB
    const stepStartTime = Date.now();
    timelineMilestones.push({
      id: `ms_step_start_${currentNodeId}_${Date.now()}`,
      type: "NODE_STARTED",
      timestamp: new Date().toISOString(),
      nodeId: currentNodeId,
      nodeName: node.data?.label || node.id,
      nodeType: node.data?.nodeType,
      attempt,
    });
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

    // Phase 15: Verify fencing token before committing step results
    if (!(await verifyFencing())) {
      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: "Execution fencing rejected: worker lease was preempted during step execution.",
        errorCategory: "INTERNAL_ERROR",
        durationMs: Date.now() - startTime,
      };
    }

    const stepDuration = Date.now() - stepStartTime;
    timelineMilestones.push({
      id: `ms_step_end_${currentNodeId}_${Date.now()}`,
      type: result.status === "SUCCESS" ? "NODE_COMPLETED" : "FAILED",
      timestamp: new Date().toISOString(),
      durationMs: stepDuration,
      nodeId: currentNodeId,
      nodeName: node.data?.label || node.id,
      nodeType: node.data?.nodeType,
      attempt,
      details: result.errorMessage ? { error: result.errorMessage } : undefined,
    });
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
          leaseOwner: null,
          leaseExpiresAt: null,
          lastCheckpointNodeId: currentNodeId,
          executionState: {
            context,
            visited: Array.from(visited),
            activeBranches: Object.fromEntries(activeBranches),
            executionTrace,
            pausedNodeId: currentNodeId,
          } as any,
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
        branch: result.selectedBranch || null,
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
          executionState: { context, visited: Array.from(visited) } as any,
        },
      });

      // Transactional Outbox for failure notification
      await outboxService.enqueueEvent({
        workspaceId: workflow.workspaceId,
        eventType: "execution.failed",
        payload: {
          executionId: options.executionId,
          workflowId: options.workflowId,
          errorSummary: summary,
          errorCategory: result.errorCategory || "INTERNAL_ERROR",
          durationMs: Date.now() - startTime,
        },
        idempotencyKey: `exec_fail_${options.executionId}_att_${attempt}`,
      }).catch(() => {});

      return {
        executionId: options.executionId,
        status: "FAILED",
        stepsExecuted: stepsExecutedCount,
        errorSummary: summary,
        errorCategory: result.errorCategory,
        durationMs: Date.now() - startTime,
      };
    }

    // Phase 15 Checkpoint & Lease Heartbeat update
    await prisma.workflowExecution.update({
      where: { id: options.executionId },
      data: {
        lastCheckpointNodeId: currentNodeId,
        leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
      },
    });

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
          continue;
        }
      }

      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // Finalize Workflow Execution as SUCCESS
  const totalDuration = Date.now() - startTime;

  // Phase 15: Verify fencing before final state commit
  if (!(await verifyFencing())) {
    return {
      executionId: options.executionId,
      status: "FAILED",
      stepsExecuted: stepsExecutedCount,
      errorSummary: "Execution fencing rejected: worker lease was preempted before final commit.",
      errorCategory: "INTERNAL_ERROR",
      durationMs: totalDuration,
    };
  }

  // Atomically update execution to SUCCESS
  await prisma.workflowExecution.update({
    where: { id: options.executionId },
    data: {
      status: ExecutionStatus.SUCCESS,
      finishedAt: new Date(),
      durationMs: totalDuration,
      leaseExpiresAt: null, // Clear active lease
      executionTrace: executionTrace as any,
      executionState: { context, visited: Array.from(visited) } as any,
    },
  });

  // Enqueue outbox event for reliable asynchronous delivery
  await outboxService.enqueueEvent({
    workspaceId: workflow.workspaceId,
    eventType: "execution.succeeded",
    payload: {
      executionId: options.executionId,
      workflowId: options.workflowId,
      durationMs: totalDuration,
      stepsExecuted: stepsExecutedCount,
    },
    idempotencyKey: `exec_succ_${options.executionId}_${currentLeaseToken}`,
  }).catch((err) => {
    console.warn(`Failed to enqueue outbox event for execution ${options.executionId}: ${err.message}`);
  });

  return {
    executionId: options.executionId,
    status: "SUCCESS",
    stepsExecuted: stepsExecutedCount,
    durationMs: totalDuration,
  };
}

export async function runWorkflowExecution(
  options: WorkflowRunOptions
): Promise<WorkflowRunResult> {
  const result = await executeWorkflowInternal(options);
  try {
    workflowExecutionsTotal.inc({
      status: result.status,
      error_category: result.errorCategory || "none",
    });
    workflowExecutionDuration.observe({ status: result.status }, result.durationMs / 1000);
  } catch (_e) {
    // Non-blocking metrics failure
  }
  return result;
}
