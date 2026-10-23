import { prisma } from "@flowforge/database";
import {
  DiagnosticMilestone,
  ExecutionDiagnosticsDto,
  FailureSummary,
  TimelineMilestoneType,
} from "@flowforge/shared";
import { redactSensitiveData } from "./tracing.js";

const NON_RETRYABLE_CATEGORIES = new Set([
  "INVALID_CONFIG",
  "INVALID_INPUT",
  "SSRF_VIOLATION",
  "AUTH_FAILURE",
  "RESOURCE_LIMIT_EXCEEDED",
]);

export class DiagnosticsService {
  /**
   * Builds an actionable failure summary based on genuine execution state.
   */
  public generateFailureSummary(execution: any, steps: any[]): FailureSummary | null {
    if (execution.status !== "FAILED") return null;

    const failingStep = steps.find((s) => s.status === "FAILED") || steps[steps.length - 1];
    const errorCategory = failingStep?.errorCategory || execution.errorCategory || "INTERNAL_ERROR";
    const errorMessage = failingStep?.errorMessage || execution.errorSummary || "Workflow execution encountered an unexpected error.";
    const isRetryable = !NON_RETRYABLE_CATEGORIES.has(errorCategory);

    let suggestedAction = "Review workflow configuration and recent execution inputs.";
    if (errorCategory === "AUTH_FAILURE") {
      suggestedAction = "Refresh or reconnect your third-party credentials under the Connections tab.";
    } else if (errorCategory === "SSRF_VIOLATION") {
      suggestedAction = "Ensure target HTTP URLs resolve to public hostnames and do not target internal IP addresses.";
    } else if (errorCategory === "RATE_LIMIT_EXCEEDED") {
      suggestedAction = "Third-party rate limit encountered. Wait for cooldown period or enable automatic backoff.";
    } else if (errorCategory === "NETWORK_TIMEOUT") {
      suggestedAction = "The external service timed out. Verify network reachability or retry the execution.";
    } else if (errorCategory === "INVALID_CONFIG") {
      suggestedAction = "Inspect node parameters, JSON expressions, or missing required fields in the workflow editor.";
    } else if (errorCategory === "WORKER_TIMEOUT") {
      suggestedAction = "Execution exceeded maximum runtime threshold and was terminated by the reliability reconciler.";
    }

    return {
      failingNodeId: failingStep?.nodeId,
      failingNodeName: failingStep?.nodeName,
      errorCategory,
      errorMessage,
      isRetryable,
      attemptCount: execution.attempt || 1,
      maxAttempts: execution.maxAttempts || 3,
      suggestedAction,
    };
  }

  /**
   * Generates or extracts structured timeline milestones.
   */
  public buildTimelineMilestones(execution: any, steps: any[]): DiagnosticMilestone[] {
    // If milestones were persisted in execution.timeline, use and sanitize them
    if (execution.timeline && Array.isArray(execution.timeline) && execution.timeline.length > 0) {
      return execution.timeline.map((m: any) => ({
        ...m,
        details: m.details ? redactSensitiveData(m.details) : undefined,
      }));
    }

    // Otherwise derive reliably from durable DB records
    const milestones: DiagnosticMilestone[] = [];

    // 1. Queued / Created
    milestones.push({
      id: `ms_queued_${execution.id}`,
      type: "QUEUED",
      timestamp: execution.createdAt.toISOString(),
      details: { attempt: execution.attempt },
    });

    // 2. Started
    if (execution.startedAt) {
      milestones.push({
        id: `ms_started_${execution.id}`,
        type: "STARTED",
        timestamp: execution.startedAt.toISOString(),
        details: { correlationId: execution.correlationId },
      });
    }

    // 3. Step executions
    for (const step of steps) {
      milestones.push({
        id: `ms_step_start_${step.id}`,
        type: "NODE_STARTED",
        timestamp: step.startedAt.toISOString(),
        nodeId: step.nodeId,
        nodeName: step.nodeName,
        nodeType: step.nodeType,
        attempt: step.attempt,
      });

      if (step.finishedAt) {
        milestones.push({
          id: `ms_step_end_${step.id}`,
          type: step.status === "FAILED" ? "FAILED" : "NODE_COMPLETED",
          timestamp: step.finishedAt.toISOString(),
          durationMs: step.durationMs || undefined,
          nodeId: step.nodeId,
          nodeName: step.nodeName,
          nodeType: step.nodeType,
          attempt: step.attempt,
          details: step.errorMessage ? { error: step.errorMessage } : undefined,
        });
      }
    }

    // 4. Final outcome
    if (execution.finishedAt) {
      let finalType: TimelineMilestoneType = "SUCCEEDED";
      if (execution.status === "FAILED") finalType = "FAILED";
      else if (execution.status === "CANCELLED") finalType = "CANCELLED";
      else if (execution.status === "WAITING_APPROVAL") finalType = "WAITING_APPROVAL";

      milestones.push({
        id: `ms_final_${execution.id}`,
        type: finalType,
        timestamp: execution.finishedAt.toISOString(),
        durationMs: execution.durationMs || undefined,
        details: execution.errorSummary ? { error: execution.errorSummary } : undefined,
      });
    }

    // Sort chronologically
    return milestones.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Retrieves sanitized execution diagnostics.
   */
  public async getExecutionDiagnostics(workspaceId: string, executionId: string): Promise<ExecutionDiagnosticsDto> {
    const execution = await prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        workflow: { workspaceId },
      },
      include: {
        workflow: true,
        steps: {
          orderBy: { startedAt: "asc" },
        },
      },
    });

    if (!execution) {
      throw new Error("Execution not found in this workspace.");
    }

    const sanitizedSteps = execution.steps.map((step) => ({
      nodeId: step.nodeId,
      nodeName: step.nodeName,
      nodeType: step.nodeType,
      status: step.status,
      attempt: step.attempt,
      durationMs: step.durationMs,
      errorCategory: step.errorCategory,
      errorMessage: step.errorMessage,
      inputData: redactSensitiveData(step.inputData),
      outputData: redactSensitiveData(step.outputData),
      startedAt: step.startedAt.toISOString(),
      finishedAt: step.finishedAt ? step.finishedAt.toISOString() : null,
    }));

    const milestones = this.buildTimelineMilestones(execution, execution.steps);
    const failureSummary = this.generateFailureSummary(execution, execution.steps);

    return {
      executionId: execution.id,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      status: execution.status,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
      durationMs: execution.durationMs,
      correlationId: execution.correlationId,
      traceparent: execution.traceparent,
      attempt: execution.attempt,
      maxAttempts: execution.maxAttempts,
      milestones,
      failureSummary,
      steps: sanitizedSteps,
    };
  }
}

export const diagnosticsService = new DiagnosticsService();
