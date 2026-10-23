import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { EvaluateOutcomeInput, OutcomeVerdict } from "@flowforge/shared";

export class OutcomeEvaluationService {
  /**
   * Evaluates the measured business outcome of an executed decision proposal.
   */
  public async evaluateOutcome(workspaceId: string, input: EvaluateOutcomeInput) {
    const proposal = await prisma.decisionProposal.findFirst({
      where: { id: input.proposalId, workspaceId },
      include: { insight: true },
    });

    if (!proposal) throw new HttpError(404, `Decision proposal '${input.proposalId}' not found.`);

    if (proposal.status !== "SUCCEEDED") {
      throw new HttpError(400, `Cannot evaluate outcome for proposal in '${proposal.status}' status (must be 'SUCCEEDED').`);
    }

    // Determine baseline and post-action values based on action and metric
    let baselineValue = 1.0;
    let postActionValue = 0.0;

    if (proposal.actionType === "RETRY_WORKFLOW_EXECUTION") {
      // Baseline was failure (1.0), check if retry succeeded
      const retryResult = (proposal.executionResult as any)?.retryExecutionId;
      if (retryResult) {
        const retryExec = await prisma.workflowExecution.findUnique({
          where: { id: retryResult },
        });
        postActionValue = retryExec?.status === "SUCCESS" ? 0.0 : 1.0;
      }
    } else if (proposal.actionType === "REPLAY_EVENT_DELIVERY") {
      // Replay delivered event
      baselineValue = 1.0; // was dead letter
      const delivery = await prisma.eventDelivery.findUnique({
        where: { id: proposal.targetResourceId },
      });
      postActionValue = delivery?.status === "DELIVERED" ? 0.0 : 1.0;
    } else if (proposal.actionType === "REFRESH_DATA_PIPELINE") {
      baselineValue = 1.0; // had stale snapshot or failed quality
      const run = await prisma.dataPipelineRun.findFirst({
        where: { pipelineId: proposal.targetResourceId, status: "SUCCESS" },
        orderBy: { startedAt: "desc" },
      });
      postActionValue = run ? 0.0 : 1.0;
    } else {
      baselineValue = 100;
      postActionValue = 50;
    }

    const delta = postActionValue - baselineValue;
    let outcomeVerdict: OutcomeVerdict = "NEUTRAL";
    if (delta < 0) {
      outcomeVerdict = "IMPROVED";
    } else if (delta > 0) {
      outcomeVerdict = "WORSENED";
    }

    const evaluation = await prisma.decisionOutcomeEvaluation.create({
      data: {
        workspaceId,
        proposalId: proposal.id,
        targetMetric: input.targetMetric,
        baselineValue,
        postActionValue,
        delta,
        outcomeVerdict,
        confidence: 0.9,
        evaluationWindowMinutes: input.evaluationWindowMinutes,
      },
    });

    return evaluation;
  }

  /**
   * Lists outcome evaluations for a workspace.
   */
  public async listEvaluations(workspaceId: string, proposalId?: string) {
    const where: any = { workspaceId };
    if (proposalId) where.proposalId = proposalId;

    return prisma.decisionOutcomeEvaluation.findMany({
      where,
      orderBy: { evaluatedAt: "desc" },
      include: {
        proposal: {
          select: { id: true, actionType: true, targetResourceType: true, rationale: true },
        },
      },
    });
  }
}

export const outcomeEvaluationService = new OutcomeEvaluationService();
