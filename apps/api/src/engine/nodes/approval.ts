import { outboundWebhookService } from "../../services/outboundWebhooks.js";
import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { prisma, WorkspaceRole } from "@flowforge/database";
import { interpolateString } from "../mapping/resolver.js";

export interface ApprovalNodeConfig {
  title?: string;
  description?: string;
  requiredRole?: WorkspaceRole | "OWNER" | "ADMIN" | "MEMBER";
  timeoutSeconds?: number;
  timeoutAction?: "REJECT" | "FAIL";
}

export const approvalHandler: NodeHandler<ApprovalNodeConfig> = {
  type: "APPROVAL",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config || !config.title) {
      errors.push("Approval node requires an approval 'title'.");
    }
    return { isValid: errors.length === 0, errors };
  },

  async execute(ctx: StepExecutionContext<ApprovalNodeConfig>): Promise<NodeExecutionResult> {
    const config = ctx.config || {};
    const rawTitle = config.title || `Approval required for step ${ctx.nodeName}`;
    const title = interpolateString(rawTitle, ctx.context);
    const description = interpolateString(config.description || "", ctx.context);
    const timeoutSeconds = config.timeoutSeconds || 86400; // 24 hours default
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Check if we are resuming an already-approved execution
    const existingApproval = await prisma.workflowApproval.findFirst({
      where: {
        executionId: ctx.executionId,
        nodeId: ctx.nodeId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingApproval && existingApproval.status === "APPROVED") {
      return {
        status: "SUCCESS",
        selectedBranch: "approved",
        outputData: {
          approvalId: existingApproval.id,
          decision: existingApproval.decision,
          comment: existingApproval.comment,
          decidedByUserId: existingApproval.decidedByUserId,
          decidedAt: existingApproval.decidedAt,
        },
      };
    }

    if (existingApproval && existingApproval.status === "REJECTED") {
      return {
        status: "FAILED",
        selectedBranch: "rejected",
        errorCategory: "AUTH_FAILURE",
        errorMessage: `Execution was rejected by reviewer: ${existingApproval.comment || "No comment provided"}`,
        outputData: {
          approvalId: existingApproval.id,
          decision: existingApproval.decision,
          comment: existingApproval.comment,
          decidedByUserId: existingApproval.decidedByUserId,
        },
      };
    }

    // Lookup workflow's workspaceId
    const workflow = await prisma.workflow.findUnique({
      where: { id: ctx.workflowId },
      select: { workspaceId: true },
    });

    const workspaceId = workflow?.workspaceId || "";

    // Create sanitized context snapshot for approver (redact potential secret fields)
    const sanitizedContext = {
      trigger: ctx.context.trigger,
      steps: Object.fromEntries(
        Object.entries(ctx.context.steps || {}).map(([k, v]) => [
          k,
          { output: v.output, status: v.status },
        ])
      ),
    };

    // Create pending approval record
    if (workspaceId) outboundWebhookService.emitEvent(workspaceId, "approval.requested", {
      approvalId: ctx.executionId,
      workflowId: ctx.workflowId,
      executionId: ctx.executionId,
      title,
    }).catch(() => {});

    const approval = await prisma.workflowApproval.create({
      data: {
        workspaceId,
        workflowId: ctx.workflowId,
        executionId: ctx.executionId,
        nodeId: ctx.nodeId,
        title,
        description,
        context: sanitizedContext as any,
        status: "PENDING",
        requiredRole: config.requiredRole as any,
        timeoutSeconds,
        expiresAt,
        resumeNodeId: ctx.nodeId,
      },
    });

    // Return special waiting signal to runner
    return {
      status: "SKIPPED",
      outputData: {
        waitingForApproval: true,
        approvalId: approval.id,
        title,
        expiresAt,
      },
    };
  },
};
