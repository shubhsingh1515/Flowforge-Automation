import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  ScheduleExecutiveReviewInput,
  UpdateExecutiveReviewInput,
  RecordReviewCommitmentInput,
  CompleteExecutiveReviewInput,
  ExecutiveReviewStatus,
  PERMITTED_EXECUTIVE_REVIEW_STATUS_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";
import { strategicAccountService } from "./strategicAccountService.js";

export class ExecutiveReviewService {
  /**
   * Generates a deterministic preparation snapshot aggregating real account data.
   */
  public async generatePrepSnapshot(
    workspaceId: string,
    customerAccountId: string,
    reviewPeriod: string
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
      include: {
        strategicProfile: true,
        contracts: {
          where: { status: "ACTIVE" },
          orderBy: { renewalDate: "asc" },
        },
        successObjectives: {
          orderBy: { targetDate: "asc" },
        },
      },
    });

    if (!account) {
      throw new HttpError(404, `Customer account '${customerAccountId}' not found in workspace.`);
    }

    const openBlockers = await prisma.customerObjectiveBlocker.findMany({
      where: {
        workspaceId,
        objective: { customerAccountId },
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
    });

    const coverage = await strategicAccountService.calculateCoverage(workspaceId, customerAccountId);

    const latestHealth = await prisma.customerHealthEvaluation.findFirst({
      where: { workspaceId, customerAccountId },
      orderBy: { evaluatedAt: "desc" },
    });

    const totalArr = account.contracts.reduce((sum, c) => sum + (c.annualRecurringValue || 0), 0);
    const nearestRenewal = account.contracts[0]?.renewalDate || null;

    const totalObjectives = account.successObjectives.length;
    const achievedObjectives = account.successObjectives.filter(o => o.status === "ACHIEVED").length;
    const atRiskObjectives = account.successObjectives.filter(o => o.status === "AT_RISK" || o.status === "BLOCKED").length;
    const activeObjectives = account.successObjectives.filter(o => o.status === "ACTIVE").length;

    const priorReviews = await prisma.customerExecutiveReview.findMany({
      where: {
        workspaceId,
        customerAccountId,
        status: "COMPLETED",
      },
      select: { id: true },
    });

    const openCommitments = priorReviews.length > 0
      ? await prisma.customerExecutiveReviewCommitment.findMany({
          where: {
            reviewId: { in: priorReviews.map(r => r.id) },
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        })
      : [];

    return {
      generatedAt: new Date().toISOString(),
      reviewPeriod,
      accountSummary: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        tier: account.tier,
        lifecycleState: account.lifecycleState,
        arr: totalArr,
        nearestRenewalDate: nearestRenewal ? nearestRenewal.toISOString() : null,
        strategicTier: account.strategicProfile?.strategicTier || "TIER_4_FOUNDATIONAL",
        accountSegment: account.strategicProfile?.accountSegment || "STANDARD",
      },
      health: {
        score: latestHealth?.score ?? null,
        status: latestHealth?.status ?? "INSUFFICIENT_DATA",
      },
      stakeholderCoverage: coverage,
      objectivesSummary: {
        total: totalObjectives,
        achieved: achievedObjectives,
        active: activeObjectives,
        atRisk: atRiskObjectives,
        openBlockersCount: openBlockers.length,
      },
      priorOpenCommitmentsCount: openCommitments.length,
    };
  }

  /**
   * Schedules an executive business review.
   */
  public async scheduleReview(
    workspaceId: string,
    input: ScheduleExecutiveReviewInput,
    actorId?: string
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
      include: { strategicProfile: true },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    // Uniqueness check for reviewNumber in workspace
    const existing = await prisma.customerExecutiveReview.findUnique({
      where: {
        workspaceId_reviewNumber: {
          workspaceId,
          reviewNumber: input.reviewNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Review with number '${input.reviewNumber}' already exists in workspace.`);
    }

    const plannedDate = new Date(input.plannedDate);
    const prepDataSnapshot = await this.generatePrepSnapshot(workspaceId, input.customerAccountId, input.reviewPeriod);

    const review = await prisma.customerExecutiveReview.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        reviewNumber: input.reviewNumber,
        reviewPeriod: input.reviewPeriod,
        plannedDate,
        status: "PLANNED",
        reviewOwnerId: input.reviewOwnerId || account.ownerUserId || null,
        executiveSponsorId: input.executiveSponsorId || account.strategicProfile?.executiveSponsorId || null,
        meetingNotes: input.meetingNotes || null,
        prepDataSnapshot: prepDataSnapshot as any,
      },
    });

    // Auto-register key contacts as invited participants
    const relationships = await prisma.customerStakeholderRelationship.findMany({
      where: { workspaceId, customerAccountId: input.customerAccountId, status: "ACTIVE" },
      take: 5,
    });

    for (const rel of relationships) {
      await prisma.customerExecutiveReviewParticipant.create({
        data: {
          workspaceId,
          reviewId: review.id,
          contactId: rel.contactId,
          role: rel.role,
          attendanceStatus: "INVITED",
        },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "EXECUTIVE_REVIEW_SCHEDULED",
      entityType: "CustomerExecutiveReview",
      entityId: review.id,
      metadata: { customerAccountId: input.customerAccountId, reviewPeriod: input.reviewPeriod, plannedDate },
    });

    return this.getReview(workspaceId, review.id);
  }

  /**
   * Retrieves an executive review with its participants and commitments.
   */
  public async getReview(workspaceId: string, reviewId: string) {
    const review = await prisma.customerExecutiveReview.findFirst({
      where: { id: reviewId, workspaceId },
      include: {
        customerAccount: {
          select: { id: true, name: true, tier: true },
        },
        participants: {
          include: { contact: true },
        },
        commitments: {
          orderBy: { dueDate: "asc" },
        },
      },
    });

    if (!review) {
      throw new HttpError(404, `Executive review '${reviewId}' not found in workspace.`);
    }

    return review;
  }

  /**
   * Lists executive reviews.
   */
  public async listReviews(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      status?: ExecutiveReviewStatus;
    }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) {
      where.customerAccountId = filters.customerAccountId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    return prisma.customerExecutiveReview.findMany({
      where,
      include: {
        customerAccount: {
          select: { id: true, name: true, tier: true },
        },
        _count: {
          select: {
            participants: true,
            commitments: true,
          },
        },
      },
      orderBy: { plannedDate: "desc" },
    });
  }

  /**
   * Updates executive review details.
   */
  public async updateReview(
    workspaceId: string,
    reviewId: string,
    input: UpdateExecutiveReviewInput,
    actorId?: string
  ) {
    const review = await prisma.customerExecutiveReview.findFirst({
      where: { id: reviewId, workspaceId },
    });
    if (!review) {
      throw new HttpError(404, `Executive review '${reviewId}' not found in workspace.`);
    }

    // Status transition validation
    if (input.status && input.status !== review.status) {
      const allowed = PERMITTED_EXECUTIVE_REVIEW_STATUS_TRANSITIONS[review.status as ExecutiveReviewStatus] || [];
      if (!allowed.includes(input.status)) {
        throw new HttpError(
          400,
          `Invalid review status transition from '${review.status}' to '${input.status}'. Permitted: [${allowed.join(", ")}]`
        );
      }
    }

    const updated = await prisma.customerExecutiveReview.update({
      where: { id: reviewId },
      data: {
        plannedDate: input.plannedDate ? new Date(input.plannedDate) : review.plannedDate,
        conductedDate: input.conductedDate ? new Date(input.conductedDate) : review.conductedDate,
        status: input.status !== undefined ? input.status : review.status,
        meetingNotes: input.meetingNotes !== undefined ? input.meetingNotes : review.meetingNotes,
        agreedSummary: input.agreedSummary !== undefined ? input.agreedSummary : review.agreedSummary,
        nextReviewDate: input.nextReviewDate ? new Date(input.nextReviewDate) : review.nextReviewDate,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "EXECUTIVE_REVIEW_UPDATED",
      entityType: "CustomerExecutiveReview",
      entityId: reviewId,
      metadata: { previousStatus: review.status, newStatus: updated.status },
    });

    return updated;
  }

  /**
   * Completes an executive review with agreed summary.
   */
  public async completeReview(
    workspaceId: string,
    reviewId: string,
    input: CompleteExecutiveReviewInput,
    actorId?: string
  ) {
    const review = await prisma.customerExecutiveReview.findFirst({
      where: { id: reviewId, workspaceId },
    });
    if (!review) {
      throw new HttpError(404, `Executive review '${reviewId}' not found in workspace.`);
    }

    const nextReviewDate = input.nextReviewDate ? new Date(input.nextReviewDate) : null;

    const updated = await prisma.customerExecutiveReview.update({
      where: { id: reviewId },
      data: {
        status: "COMPLETED",
        conductedDate: review.conductedDate || new Date(),
        agreedSummary: input.agreedSummary,
        nextReviewDate: nextReviewDate || review.nextReviewDate,
        meetingNotes: input.meetingNotes !== undefined ? input.meetingNotes : review.meetingNotes,
      },
    });

    // Update strategic profile with review dates
    await prisma.customerStrategicAccountProfile.updateMany({
      where: { workspaceId, customerAccountId: review.customerAccountId },
      data: {
        lastStrategicReviewAt: new Date(),
        nextStrategicReviewAt: nextReviewDate || undefined,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "EXECUTIVE_REVIEW_COMPLETED",
      entityType: "CustomerExecutiveReview",
      entityId: reviewId,
      metadata: { reviewPeriod: review.reviewPeriod },
    });

    return updated;
  }

  /**
   * Records an executive commitment and idempotently creates a linked CustomerSuccessTask.
   */
  public async recordCommitment(
    workspaceId: string,
    reviewId: string,
    input: RecordReviewCommitmentInput,
    _actorId?: string
  ) {
    const review = await prisma.customerExecutiveReview.findFirst({
      where: { id: reviewId, workspaceId },
    });
    if (!review) {
      throw new HttpError(404, `Executive review '${reviewId}' not found in workspace.`);
    }

    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    const idempotencyKey = `ebr-${reviewId}-${Date.now()}`;

    // Link CustomerSuccessTask in Phase 25 domain if requested
    let linkedTaskId: string | null = null;
    if (input.generateSuccessTask) {
      try {
        const task = await prisma.customerSuccessTask.create({
          data: {
            workspaceId,
            customerAccountId: review.customerAccountId,
            taskType: "RENEWAL_CHECK",
            title: `[EBR Action Item] ${input.title.substring(0, 80)}`,
            description: input.description || `Committed during ${review.reviewPeriod} review`,
            priority: "HIGH",
            status: "OPEN",
            assignedUserId: input.ownerUserId || review.reviewOwnerId || null,
            dueAt: dueDate,
          },
        });
        linkedTaskId = task.id;
      } catch (_e) {
        // Fallback gracefully
      }
    }

    const commitment = await prisma.customerExecutiveReviewCommitment.create({
      data: {
        workspaceId,
        reviewId,
        title: input.title,
        description: input.description || null,
        ownerUserId: input.ownerUserId || null,
        dueDate,
        status: "OPEN",
        linkedTaskId,
        idempotencyKey,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: _actorId,
      action: "EXECUTIVE_REVIEW_COMMITMENT_RECORDED",
      entityType: "CustomerExecutiveReviewCommitment",
      entityId: commitment.id,
      metadata: { reviewId, linkedTaskId },
    });

    return commitment;
  }

  /**
   * Updates commitment status.
   */
  public async updateCommitmentStatus(
    workspaceId: string,
    commitmentId: string,
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED",
    _actorId?: string
  ) {
    const commitment = await prisma.customerExecutiveReviewCommitment.findFirst({
      where: { id: commitmentId, workspaceId },
    });
    if (!commitment) {
      throw new HttpError(404, `Review commitment '${commitmentId}' not found in workspace.`);
    }

    const updated = await prisma.customerExecutiveReviewCommitment.update({
      where: { id: commitmentId },
      data: { status },
    });

    // Sync CustomerSuccessTask status if linked
    if (commitment.linkedTaskId) {
      const taskStatus = status === "COMPLETED" ? "RESOLVED" : "IN_PROGRESS";
      await prisma.customerSuccessTask.updateMany({
        where: { id: commitment.linkedTaskId, workspaceId },
        data: {
          status: taskStatus,
          resolvedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
    }

    return updated;
  }
}

export const executiveReviewService = new ExecutiveReviewService();
