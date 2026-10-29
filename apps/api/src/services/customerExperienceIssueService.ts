import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateExperienceIssueInput,
  UpdateExperienceIssueInput,
  CreateActionPlanInput,
  UpdateActionPlanInput,
  ALLOWED_ISSUE_TRANSITIONS,
  ExperienceIssueStatus,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerExperienceIssueService {
  /**
   * Generates a sequential issue number.
   */
  private async generateIssueNumber(workspaceId: string): Promise<string> {
    const count = await prisma.customerExperienceIssue.count({ where: { workspaceId } });
    return `EXP-${String(count + 1001).padStart(5, "0")}`;
  }

  /**
   * Creates an experience issue.
   */
  public async createIssue(workspaceId: string, input: CreateExperienceIssueInput, actorUserId?: string) {
    if (input.customerAccountId) {
      const account = await prisma.customerAccount.findFirst({
        where: { id: input.customerAccountId, workspaceId },
      });
      if (!account) {
        throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);
      }
    }

    const issueNumber = await this.generateIssueNumber(workspaceId);

    const issue = await prisma.customerExperienceIssue.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        issueNumber,
        title: input.title,
        description: input.description,
        category: input.category,
        severity: input.severity,
        status: "OPEN",
        ownerUserId: input.ownerUserId,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        relatedIncidentId: input.relatedIncidentId,
        rootCauseStatus: input.rootCauseStatus || "HYPOTHESIS",
        rootCauseDetails: input.rootCauseDetails,
      },
    });

    // Link feedback records if provided
    if (input.feedbackIds && input.feedbackIds.length > 0) {
      for (const fbId of input.feedbackIds) {
        await prisma.customerExperienceIssueFeedback.upsert({
          where: {
            issueId_feedbackId: {
              issueId: issue.id,
              feedbackId: fbId,
            },
          },
          create: {
            workspaceId,
            issueId: issue.id,
            feedbackId: fbId,
            linkedByUserId: actorUserId,
          },
          update: {},
        });
      }
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "EXPERIENCE_ISSUE_CREATED",
      entityType: "CustomerExperienceIssue",
      entityId: issue.id,
      metadata: { description: `Experience issue ${issue.issueNumber} (${issue.severity}) created: "${issue.title}".` },
    });

    return issue;
  }

  /**
   * Lists experience issues with optional filters.
   */
  public async listIssues(
    workspaceId: string,
    filters?: { status?: string; severity?: string; customerAccountId?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;

    return prisma.customerExperienceIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      include: {
        customerAccount: { select: { id: true, name: true, slug: true } },
        _count: {
          select: { feedbackLinks: true, actionPlans: true },
        },
      },
    });
  }

  /**
   * Retrieves issue with complete details.
   */
  public async getIssue(workspaceId: string, id: string) {
    const issue = await prisma.customerExperienceIssue.findFirst({
      where: { id, workspaceId },
      include: {
        customerAccount: true,
        feedbackLinks: {
          include: {
            feedback: {
              include: {
                customerAccount: { select: { id: true, name: true } },
                contact: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        actionPlans: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!issue) {
      throw new HttpError(404, `Experience issue '${id}' not found.`);
    }

    return issue;
  }

  /**
   * Updates an experience issue enforcing valid lifecycle transitions.
   */
  public async updateIssue(workspaceId: string, id: string, input: UpdateExperienceIssueInput, actorUserId?: string) {
    const issue = await this.getIssue(workspaceId, id);

    if (input.status && input.status !== issue.status) {
      const allowed = ALLOWED_ISSUE_TRANSITIONS[issue.status as ExperienceIssueStatus] || [];
      if (!allowed.includes(input.status as ExperienceIssueStatus)) {
        throw new HttpError(
          400,
          `Invalid issue status transition from '${issue.status}' to '${input.status}'. Allowed: ${allowed.join(", ")}`
        );
      }

      if (input.status === "WONT_FIX" && !input.closeReason) {
        throw new HttpError(400, "A documented closeReason is required when marking an issue as WONT_FIX.");
      }
    }

    const updated = await prisma.customerExperienceIssue.update({
      where: { id: issue.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.targetDate ? { targetDate: new Date(input.targetDate) } : {}),
        ...(input.rootCauseStatus ? { rootCauseStatus: input.rootCauseStatus } : {}),
        ...(input.rootCauseDetails !== undefined ? { rootCauseDetails: input.rootCauseDetails } : {}),
        ...(input.resolutionSummary !== undefined ? { resolutionSummary: input.resolutionSummary } : {}),
        ...(input.resolutionEvidence ? { resolutionEvidence: input.resolutionEvidence } : {}),
        ...(input.closeReason !== undefined ? { closeReason: input.closeReason } : {}),
        ...(input.status === "RESOLVED" || input.status === "CLOSED" || input.status === "WONT_FIX"
          ? { closedAt: new Date() }
          : {}),
      },
      include: {
        customerAccount: true,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "EXPERIENCE_ISSUE_UPDATED",
      entityType: "CustomerExperienceIssue",
      entityId: issue.id,
      metadata: { description: `Experience issue ${issue.issueNumber} updated (status: ${updated.status}).` },
    });

    return updated;
  }

  /**
   * Links a feedback record to an issue.
   */
  public async linkFeedback(workspaceId: string, issueId: string, feedbackId: string, userId?: string) {
    const [issue, feedback] = await Promise.all([
      this.getIssue(workspaceId, issueId),
      prisma.customerFeedbackRecord.findFirst({ where: { id: feedbackId, workspaceId } }),
    ]);

    if (!feedback) {
      throw new HttpError(404, `Feedback record '${feedbackId}' not found.`);
    }

    const link = await prisma.customerExperienceIssueFeedback.upsert({
      where: {
        issueId_feedbackId: {
          issueId: issue.id,
          feedbackId: feedback.id,
        },
      },
      create: {
        workspaceId,
        issueId: issue.id,
        feedbackId: feedback.id,
        linkedByUserId: userId,
      },
      update: {},
    });

    return link;
  }

  /**
   * Creates an action plan linked to an issue and optionally materializes a Phase 25 CustomerSuccessTask.
   */
  public async createActionPlan(workspaceId: string, input: CreateActionPlanInput, actorUserId?: string) {
    const issue = await this.getIssue(workspaceId, input.issueId);

    let materializedTaskId: string | null = null;

    // Closed-loop integration with Phase 25 CustomerSuccessTask
    if (input.materializeTask && issue.customerAccountId) {
      const task = await prisma.customerSuccessTask.create({
        data: {
          workspaceId,
          customerAccountId: issue.customerAccountId,
          taskType: "SUPPORT_ESCALATION",
          title: `[VoC Action] ${input.title}`,
          description: `Action item for issue ${issue.issueNumber}: ${input.description}`,
          priority: issue.severity === "CRITICAL" ? "URGENT" : issue.severity === "HIGH" ? "HIGH" : "MEDIUM",
          assignedUserId: input.ownerUserId,
          dueAt: input.dueDate ? new Date(input.dueDate) : undefined,
          status: "OPEN",
        },
      });
      materializedTaskId = task.id;
    }

    const actionPlan = await prisma.customerExperienceActionPlan.create({
      data: {
        workspaceId,
        issueId: issue.id,
        title: input.title,
        description: input.description,
        ownerUserId: input.ownerUserId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        expectedOutcome: input.expectedOutcome,
        successMeasure: input.successMeasure,
        status: "PLANNED",
        materializedTaskId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "EXPERIENCE_ACTION_PLAN_CREATED",
      entityType: "CustomerExperienceActionPlan",
      entityId: actionPlan.id,
      metadata: { description: `Action plan created for issue ${issue.issueNumber} (task materialized: ${!!materializedTaskId}).` },
    });

    return actionPlan;
  }

  /**
   * Updates an action plan status and completion.
   */
  public async updateActionPlan(workspaceId: string, id: string, input: UpdateActionPlanInput, actorUserId?: string) {
    const plan = await prisma.customerExperienceActionPlan.findFirst({
      where: { id, workspaceId },
      include: { issue: true },
    });
    if (!plan) {
      throw new HttpError(404, `Action plan '${id}' not found.`);
    }

    const isCompleted = input.status === "COMPLETED";

    const updated = await prisma.customerExperienceActionPlan.update({
      where: { id: plan.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.dueDate ? { dueDate: new Date(input.dueDate) } : {}),
        ...(input.completionEvidence ? { completionEvidence: input.completionEvidence } : {}),
        ...(isCompleted ? { completedAt: new Date() } : {}),
      },
    });

    // If linked task exists, sync status
    if (plan.materializedTaskId && isCompleted) {
      await prisma.customerSuccessTask.update({
        where: { id: plan.materializedTaskId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNotes: "Resolved via Customer Experience Action Plan completion.",
        },
      });
    }

    return updated;
  }
}

export const customerExperienceIssueService = new CustomerExperienceIssueService();
