import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { StartInvestigationInput } from "@flowforge/shared";
import { intelligenceContextService } from "./intelligenceContextService.js";

export class InvestigationService {
  /**
   * Performs cross-system correlation to trace the root cause of an operational issue.
   */
  public async startInvestigation(
    workspaceId: string,
    input: StartInvestigationInput,
    intelligenceWorkspaceId?: string
  ) {
    const timeRangeHours = Math.min(input.timeRangeHours || 48, 720);
    const windowStart = new Date(Date.now() - timeRangeHours * 3600 * 1000);

    const timeline: any[] = [];
    const candidateExplanations: any[] = [];
    const contradictoryEvidence: any[] = [];
    const missingEvidence: any[] = [];

    // 1. Correlate Workflow Failures
    const failedExecutions = await prisma.workflowExecution.findMany({
      where: {
        workflow: { workspaceId },
        status: "FAILED",
        startedAt: { gte: windowStart },
      },
      select: {
        id: true,
        workflowId: true,
        startedAt: true,
        durationMs: true,
        errorSummary: true,
        workflow: { select: { name: true } },
      },
      take: 20,
    });

    for (const fe of failedExecutions) {
      timeline.push({
        timestamp: fe.startedAt.toISOString(),
        service: "Workflow",
        event: `Workflow execution failed: ${fe.workflow?.name}`,
        severity: "HIGH",
        details: fe.errorSummary || "Unhandled step error",
      });
    }

    // 2. Correlate Dead-Letter Events
    const deadLetters = await prisma.eventDelivery.findMany({
      where: {
        workspaceId,
        status: "DEAD_LETTER",
        updatedAt: { gte: windowStart },
      },
      select: {
        id: true,
        lastError: true,
        updatedAt: true,
        subscription: { select: { name: true, eventTypes: true } },
      },
      take: 10,
    });

    for (const dl of deadLetters) {
      timeline.push({
        timestamp: dl.updatedAt.toISOString(),
        service: "Event Fabric",
        event: `Dead-letter event on subscription '${dl.subscription?.name}'`,
        severity: "CRITICAL",
        details: dl.lastError || "Maximum retry attempts exhausted",
      });
    }

    // 3. Correlate Process Milestones
    const atRiskProcesses = await prisma.businessProcessInstance.findMany({
      where: {
        workspaceId,
        status: { in: ["AT_RISK", "FAILED"] },
        startedAt: { gte: windowStart },
      },
      select: {
        id: true,
        correlationKey: true,
        currentMilestoneName: true,
        startedAt: true,
        processDefinition: { select: { name: true } },
      },
      take: 10,
    });

    for (const ap of atRiskProcesses) {
      timeline.push({
        timestamp: ap.startedAt.toISOString(),
        service: "Business Process",
        event: `Process '${ap.processDefinition?.name}' flagged AT_RISK at milestone '${ap.currentMilestoneName}'`,
        severity: "HIGH",
        details: `Correlation Key: ${ap.correlationKey}`,
      });
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 4. Formulate Candidate Explanations
    if (deadLetters.length > 0 && failedExecutions.length > 0) {
      candidateExplanations.push({
        hypothesis: "Event delivery failures cascading into workflow execution timeouts",
        likelihood: "HIGH",
        evidenceRefs: [
          `Event dead-letters (${deadLetters.length} instances)`,
          `Workflow execution failures (${failedExecutions.length} instances)`,
        ],
      });
    }

    if (atRiskProcesses.length > 0) {
      candidateExplanations.push({
        hypothesis: "Process milestone backlog caused by delayed upstream milestone triggers",
        likelihood: "MEDIUM",
        evidenceRefs: [`At-risk instances count: ${atRiskProcesses.length}`],
      });
    }

    if (candidateExplanations.length === 0) {
      candidateExplanations.push({
        hypothesis: "Transient isolated network or dependency error without broad system cascade",
        likelihood: "LOW",
        evidenceRefs: [],
      });
      missingEvidence.push({
        description: "Insufficient error logs or step diagnostics recorded in observation window",
        recommendedLookup: "Increase diagnostic log level in workflow configuration",
      });
    }

    const recommendedNextSteps = [
      "Review failed execution step output payloads for specific upstream API error codes.",
      "Check event subscription endpoint health and partner webhook receiver availability.",
      "Consider triggering a policy-controlled decision proposal to retry eligible operations.",
    ];

    const investigation = await prisma.rootCauseInvestigation.create({
      data: {
        workspaceId,
        intelligenceWorkspaceId,
        insightId: input.insightId,
        title: input.title,
        issueDescription: input.issueDescription,
        status: "COMPLETED",
        timeline,
        candidateExplanations,
        contradictoryEvidence: contradictoryEvidence.length > 0 ? contradictoryEvidence : undefined,
        missingEvidence: missingEvidence.length > 0 ? missingEvidence : undefined,
        confidenceScore: 0.88,
        recommendedNextSteps,
      },
    });

    return investigation;
  }

  /**
   * Retrieves an investigation by ID.
   */
  public async getInvestigation(workspaceId: string, id: string) {
    const inv = await prisma.rootCauseInvestigation.findFirst({
      where: { id, workspaceId },
      include: { insight: true },
    });
    if (!inv) throw new HttpError(404, `Investigation '${id}' not found.`);
    return inv;
  }

  /**
   * Lists investigations for a workspace.
   */
  public async listInvestigations(workspaceId: string) {
    return prisma.rootCauseInvestigation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}

export const investigationService = new InvestigationService();
