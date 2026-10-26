import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateAccountPlanInput,
  UpdateAccountPlanInput,
  AccountPlanStatus,
  PERMITTED_ACCOUNT_PLAN_STATUS_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class AccountPlanService {
  /**
   * Creates a strategic account plan.
   */
  public async createPlan(
    workspaceId: string,
    input: CreateAccountPlanInput,
    actorId?: string
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    const reviewDueAt = input.reviewDueAt ? new Date(input.reviewDueAt) : null;

    // Check planNumber uniqueness in workspace
    const existing = await prisma.customerAccountPlan.findUnique({
      where: {
        workspaceId_planNumber: {
          workspaceId,
          planNumber: input.planNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Account plan with number '${input.planNumber}' already exists in workspace.`);
    }

    const plan = await prisma.customerAccountPlan.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        planNumber: input.planNumber,
        title: input.title,
        planYear: input.planYear || 2027,
        status: "DRAFT",
        currentVersion: 1,
        executiveSummary: input.executiveSummary || null,
        visionStatement: input.visionStatement || null,
        ownerUserId: input.ownerUserId || account.ownerUserId || null,
        reviewDueAt,
      },
    });

    // Initial version snapshot
    await prisma.customerAccountPlanVersion.create({
      data: {
        workspaceId,
        accountPlanId: plan.id,
        versionNumber: 1,
        snapshotJson: {
          planNumber: plan.planNumber,
          title: plan.title,
          planYear: plan.planYear,
          visionStatement: plan.visionStatement,
          executiveSummary: plan.executiveSummary,
          status: plan.status,
        },
        changeSummary: "Initial plan creation (Draft)",
        approvedById: actorId || null,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_ACCOUNT_PLAN_CREATED",
      entityType: "CustomerAccountPlan",
      entityId: plan.id,
      metadata: { customerAccountId: input.customerAccountId, title: plan.title },
    });

    return plan;
  }

  /**
   * Retrieves an account plan with its objectives, initiatives, and versions.
   */
  public async getPlan(workspaceId: string, planId: string) {
    const plan = await prisma.customerAccountPlan.findFirst({
      where: { id: planId, workspaceId },
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
            tier: true,
          },
        },
        objectives: {
          include: {
            evidence: { orderBy: { observationTimestamp: "desc" }, take: 5 },
            blockers: { where: { status: { in: ["OPEN", "INVESTIGATING"] } } },
          },
        },
        initiatives: {
          include: {
            milestones: { orderBy: { targetDate: "asc" } },
          },
        },
        versions: {
          orderBy: { versionNumber: "desc" },
        },
      },
    });

    if (!plan) {
      throw new HttpError(404, `Account plan '${planId}' not found in workspace.`);
    }

    return plan;
  }

  /**
   * Lists account plans in a workspace.
   */
  public async listPlans(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      status?: AccountPlanStatus;
    }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) {
      where.customerAccountId = filters.customerAccountId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    return prisma.customerAccountPlan.findMany({
      where,
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
            tier: true,
          },
        },
        _count: {
          select: {
            objectives: true,
            initiatives: true,
            versions: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Updates an existing account plan.
   */
  public async updatePlan(
    workspaceId: string,
    planId: string,
    input: UpdateAccountPlanInput,
    actorId?: string
  ) {
    const plan = await prisma.customerAccountPlan.findFirst({
      where: { id: planId, workspaceId },
    });
    if (!plan) {
      throw new HttpError(404, `Account plan '${planId}' not found in workspace.`);
    }

    const updated = await prisma.customerAccountPlan.update({
      where: { id: planId },
      data: {
        title: input.title !== undefined ? input.title : plan.title,
        visionStatement: input.visionStatement !== undefined ? input.visionStatement : plan.visionStatement,
        executiveSummary: input.executiveSummary !== undefined ? input.executiveSummary : plan.executiveSummary,
        ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : plan.ownerUserId,
        reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : plan.reviewDueAt,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_ACCOUNT_PLAN_UPDATED",
      entityType: "CustomerAccountPlan",
      entityId: planId,
    });

    return updated;
  }

  /**
   * Updates plan status with state transition enforcement.
   */
  public async updatePlanStatus(
    workspaceId: string,
    planId: string,
    newStatus: AccountPlanStatus,
    actorId?: string
  ) {
    const plan = await prisma.customerAccountPlan.findFirst({
      where: { id: planId, workspaceId },
    });
    if (!plan) {
      throw new HttpError(404, `Account plan '${planId}' not found in workspace.`);
    }

    const allowed = PERMITTED_ACCOUNT_PLAN_STATUS_TRANSITIONS[plan.status as AccountPlanStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new HttpError(
        400,
        `Invalid plan status transition from '${plan.status}' to '${newStatus}'. Permitted: [${allowed.join(", ")}]`
      );
    }

    const updated = await prisma.customerAccountPlan.update({
      where: { id: planId },
      data: { status: newStatus },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_ACCOUNT_PLAN_STATUS_CHANGED",
      entityType: "CustomerAccountPlan",
      entityId: planId,
      metadata: { previousStatus: plan.status, newStatus },
    });

    return updated;
  }

  /**
   * Approves a strategic plan, increments the version number, and snapshots the entire plan state.
   */
  public async approvePlan(
    workspaceId: string,
    planId: string,
    changeSummary?: string,
    actorId?: string
  ) {
    const plan = await this.getPlan(workspaceId, planId);

    if (plan.status !== "DRAFT" && plan.status !== "IN_REVIEW") {
      throw new HttpError(400, `Plan cannot be approved from current status '${plan.status}'. Must be DRAFT or IN_REVIEW.`);
    }

    const nextVersion = plan.currentVersion + 1;

    // Complete snapshot
    const snapshotJson = {
      planId: plan.id,
      planNumber: plan.planNumber,
      title: plan.title,
      planYear: plan.planYear,
      visionStatement: plan.visionStatement,
      status: "APPROVED",
      customerAccountId: plan.customerAccountId,
      customerAccountName: plan.customerAccount?.name,
      objectives: plan.objectives,
      initiatives: plan.initiatives,
      approvedAt: new Date().toISOString(),
      approvedById: actorId || null,
      changeSummary,
    };

    const [updatedPlan, planVersion] = await prisma.$transaction([
      prisma.customerAccountPlan.update({
        where: { id: planId },
        data: {
          status: "APPROVED",
          currentVersion: nextVersion,
          approvedAt: new Date(),
          approvedById: actorId || null,
        },
      }),
      prisma.customerAccountPlanVersion.create({
        data: {
          workspaceId,
          accountPlanId: planId,
          versionNumber: nextVersion,
          snapshotJson: snapshotJson as any,
          changeSummary: changeSummary || `Approved strategic plan version v${nextVersion}`,
          approvedById: actorId || null,
        },
      }),
    ]);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_ACCOUNT_PLAN_APPROVED",
      entityType: "CustomerAccountPlan",
      entityId: planId,
      metadata: { version: nextVersion, changeSummary },
    });

    return { plan: updatedPlan, version: planVersion };
  }

  /**
   * Archives a plan.
   */
  public async archivePlan(workspaceId: string, planId: string, actorId?: string) {
    const plan = await prisma.customerAccountPlan.findFirst({
      where: { id: planId, workspaceId },
    });
    if (!plan) {
      throw new HttpError(404, `Account plan '${planId}' not found in workspace.`);
    }

    const updated = await prisma.customerAccountPlan.update({
      where: { id: planId },
      data: { status: "ARCHIVED" },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_ACCOUNT_PLAN_ARCHIVED",
      entityType: "CustomerAccountPlan",
      entityId: planId,
    });

    return updated;
  }
}

export const accountPlanService = new AccountPlanService();
