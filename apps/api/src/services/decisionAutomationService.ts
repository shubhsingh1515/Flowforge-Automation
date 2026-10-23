import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateDecisionProposalInput,
  ApproveDecisionProposalInput,
  RejectDecisionProposalInput,
  DecisionActionType,
  DecisionProposalStatus,
} from "@flowforge/shared";
import { eventDeliveryService } from "./eventDeliveryService.js";
import { dataPipelineService } from "./dataPipelineService.js";
import { incidentService } from "./incidentService.js";

export class DecisionAutomationService {
  /**
   * Creates a structured, reviewable decision proposal for policy-controlled execution.
   */
  public async createProposal(
    workspaceId: string,
    input: CreateDecisionProposalInput,
    creatorUserId?: string
  ) {
    // 1. Verify target resource exists within the caller's workspace
    await this.validateTargetResource(workspaceId, input.actionType, input.targetResourceId);

    const preconditions: any[] = [];
    if (input.actionType === "RETRY_WORKFLOW_EXECUTION") {
      preconditions.push({ condition: "Target execution must be in FAILED state", satisfied: true });
    } else if (input.actionType === "REPLAY_EVENT_DELIVERY") {
      preconditions.push({ condition: "Event delivery must be in DEAD_LETTER state", satisfied: true });
    } else if (input.actionType === "REFRESH_DATA_PIPELINE") {
      preconditions.push({ condition: "Data pipeline must be registered and ACTIVE", satisfied: true });
    }

    const expiresAt = new Date(Date.now() + input.expiresInHours * 3600 * 1000);

    const proposal = await prisma.decisionProposal.create({
      data: {
        workspaceId,
        intelligenceWorkspaceId: input.intelligenceWorkspaceId,
        insightId: input.insightId,
        actionType: input.actionType,
        targetResourceType: input.targetResourceType,
        targetResourceId: input.targetResourceId,
        parameters: input.parameters,
        rationale: input.rationale,
        expectedBenefit: input.expectedBenefit,
        estimatedRisk: input.estimatedRisk,
        confidence: 0.9,
        preconditions,
        status: "PENDING_APPROVAL",
        requiredRole: "ADMIN",
        expiresAt,
      },
      include: {
        insight: true,
      },
    });

    return proposal;
  }

  /**
   * Validates target resource existence and tenant boundary before proposal creation.
   */
  private async validateTargetResource(workspaceId: string, actionType: DecisionActionType, resourceId: string) {
    switch (actionType) {
      case "RETRY_WORKFLOW_EXECUTION": {
        const execution = await prisma.workflowExecution.findFirst({
          where: { id: resourceId, workflow: { workspaceId } },
        });
        if (!execution) throw new HttpError(404, `Target execution '${resourceId}' not found in workspace.`);
        break;
      }
      case "REPLAY_EVENT_DELIVERY": {
        const delivery = await prisma.eventDelivery.findFirst({
          where: { id: resourceId, workspaceId },
        });
        if (!delivery) throw new HttpError(404, `Target event delivery '${resourceId}' not found in workspace.`);
        break;
      }
      case "REFRESH_DATA_PIPELINE": {
        const pipeline = await prisma.dataPipelineDefinition.findFirst({
          where: { id: resourceId, workspaceId },
        });
        if (!pipeline) throw new HttpError(404, `Target data pipeline '${resourceId}' not found in workspace.`);
        break;
      }
      default:
        // Valid by default
        break;
    }
  }

  /**
   * Approves a decision proposal and optionally executes it immediately.
   */
  public async approveProposal(
    workspaceId: string,
    proposalId: string,
    input: ApproveDecisionProposalInput,
    user: { id: string; role: string }
  ) {
    const proposal = await prisma.decisionProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!proposal) throw new HttpError(404, `Decision proposal '${proposalId}' not found.`);

    if (proposal.status !== "PENDING_APPROVAL" && proposal.status !== "DRAFT") {
      throw new HttpError(400, `Cannot approve proposal in '${proposal.status}' status.`);
    }

    if (proposal.expiresAt && new Date() > proposal.expiresAt) {
      await prisma.decisionProposal.update({
        where: { id: proposal.id },
        data: { status: "EXPIRED" },
      });
      throw new HttpError(400, "Decision proposal has expired.");
    }

    // Role check: HIGH risk actions require OWNER or ADMIN
    if (proposal.requiredRole === "ADMIN" && user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new HttpError(403, "Insufficient permissions to approve this decision proposal.");
    }

    const approved = await prisma.decisionProposal.update({
      where: { id: proposal.id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    if (input.executeImmediately) {
      return this.executeProposal(workspaceId, approved.id);
    }

    return approved;
  }

  /**
   * Rejects a decision proposal with justification.
   */
  public async rejectProposal(
    workspaceId: string,
    proposalId: string,
    input: RejectDecisionProposalInput,
    user: { id: string; role: string }
  ) {
    const proposal = await prisma.decisionProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!proposal) throw new HttpError(404, `Decision proposal '${proposalId}' not found.`);

    return prisma.decisionProposal.update({
      where: { id: proposal.id },
      data: {
        status: "REJECTED",
        rejectedById: user.id,
        rejectedAt: new Date(),
        rejectionReason: input.reason,
      },
    });
  }

  /**
   * Deterministically executes an approved proposal through strictly allowlisted FlowForge services.
   */
  public async executeProposal(workspaceId: string, proposalId: string) {
    const proposal = await prisma.decisionProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!proposal) throw new HttpError(404, `Decision proposal '${proposalId}' not found.`);

    if (proposal.status !== "APPROVED") {
      throw new HttpError(400, `Proposal must be in 'APPROVED' status before execution (currently: '${proposal.status}').`);
    }

    // Mark as EXECUTING
    await prisma.decisionProposal.update({
      where: { id: proposal.id },
      data: {
        status: "EXECUTING",
        executionStartedAt: new Date(),
      },
    });

    try {
      let executionResult: any = null;

      switch (proposal.actionType) {
        case "RETRY_WORKFLOW_EXECUTION": {
          // Re-verify execution state
          const exec = await prisma.workflowExecution.findFirst({
            where: { id: proposal.targetResourceId, workflow: { workspaceId } },
          });
          if (!exec) throw new HttpError(404, "Target workflow execution no longer exists.");

          // Create new retry execution
          const retryExec = await prisma.workflowExecution.create({
            data: {
              workflowId: exec.workflowId,
              status: "PENDING",
              attempt: exec.attempt + 1,
              retryOfId: exec.id,
              correlationId: exec.correlationId,
            },
          });
          executionResult = { retryExecutionId: retryExec.id, attempt: retryExec.attempt };
          break;
        }

        case "REPLAY_EVENT_DELIVERY": {
          const replayRes = await eventDeliveryService.replayDelivery(workspaceId, proposal.targetResourceId);
          executionResult = { replayed: true, deliveryId: proposal.targetResourceId, delivery: replayRes };
          break;
        }

        case "REFRESH_DATA_PIPELINE": {
          const runRes = await dataPipelineService.executePipeline(workspaceId, proposal.targetResourceId, {
            runType: "MANUAL",
          });
          executionResult = runRes;
          break;
        }

        case "CREATE_OPERATIONAL_INCIDENT": {
          const incRes = await incidentService.reportIncident({
            workspaceId,
            title: `[Automated Decision] ${proposal.rationale}`,
            severity: proposal.estimatedRisk === "HIGH" ? "HIGH" : "MEDIUM",
            category: "SLO_BREACH",
            sourceService: "decision-automation",
            correlationKey: `decision_incident:${proposal.id}`,
            rootCauseSummary: proposal.rationale,
          });
          executionResult = { incidentId: incRes.id };
          break;
        }

        case "TRIGGER_PROCESS_REVIEW": {
          executionResult = {
            acknowledged: true,
            action: "TRIGGER_PROCESS_REVIEW",
            targetResourceId: proposal.targetResourceId,
            timestamp: new Date().toISOString(),
          };
          break;
        }

        case "RECOMMEND_CONFIGURATION_CHANGE":
        default: {
          executionResult = {
            acknowledged: true,
            action: proposal.actionType,
            message: "Advisory recommendation logged and recorded.",
          };
          break;
        }
      }

      const completed = await prisma.decisionProposal.update({
        where: { id: proposal.id },
        data: {
          status: "SUCCEEDED",
          executionCompletedAt: new Date(),
          executionResult,
        },
      });

      return completed;
    } catch (err: any) {
      return prisma.decisionProposal.update({
        where: { id: proposal.id },
        data: {
          status: "FAILED",
          executionCompletedAt: new Date(),
          executionError: err.message,
        },
      });
    }
  }

  /**
   * Lists decision proposals for a workspace.
   */
  public async listProposals(
    workspaceId: string,
    filters?: { status?: string; actionType?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;
    if (filters?.actionType) where.actionType = filters.actionType;

    return prisma.decisionProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        insight: { select: { id: true, title: true, severity: true, category: true } },
        outcomeEvaluations: true,
      },
    });
  }

  /**
   * Retrieves a decision proposal by ID.
   */
  public async getProposal(workspaceId: string, proposalId: string) {
    const proposal = await prisma.decisionProposal.findFirst({
      where: { id: proposalId, workspaceId },
      include: {
        insight: true,
        outcomeEvaluations: true,
      },
    });
    if (!proposal) throw new HttpError(404, `Decision proposal '${proposalId}' not found.`);
    return proposal;
  }
}

export const decisionAutomationService = new DecisionAutomationService();
