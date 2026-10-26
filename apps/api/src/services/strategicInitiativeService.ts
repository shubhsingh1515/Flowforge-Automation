import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateStrategicInitiativeInput,
  UpdateStrategicInitiativeInput,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class StrategicInitiativeService {
  /**
   * Creates a strategic initiative tied to an account and optional plan/opportunity.
   */
  public async createInitiative(
    workspaceId: string,
    input: CreateStrategicInitiativeInput,
    actorId?: string
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    if (input.accountPlanId) {
      const plan = await prisma.customerAccountPlan.findFirst({
        where: { id: input.accountPlanId, workspaceId },
      });
      if (!plan) {
        throw new HttpError(404, `Account plan '${input.accountPlanId}' not found in workspace.`);
      }
    }

    if (input.linkedRevenueOpportunityId) {
      const opp = await prisma.customerExpansionOpportunity.findFirst({
        where: { id: input.linkedRevenueOpportunityId, workspaceId },
      });
      if (!opp) {
        throw new HttpError(404, `Expansion opportunity '${input.linkedRevenueOpportunityId}' not found in workspace.`);
      }
    }

    // Uniqueness check for initiativeNumber in workspace
    const existing = await prisma.customerStrategicInitiative.findUnique({
      where: {
        workspaceId_initiativeNumber: {
          workspaceId,
          initiativeNumber: input.initiativeNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Initiative with number '${input.initiativeNumber}' already exists in workspace.`);
    }

    const initiative = await prisma.customerStrategicInitiative.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        accountPlanId: input.accountPlanId || null,
        initiativeNumber: input.initiativeNumber,
        title: input.title,
        description: input.description || null,
        status: "PROPOSED",
        ownerUserId: input.ownerUserId || account.ownerUserId || null,
        targetCompletionDate: new Date(input.targetCompletionDate),
        linkedRevenueOpportunityId: input.linkedRevenueOpportunityId || null,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "STRATEGIC_INITIATIVE_CREATED",
      entityType: "CustomerStrategicInitiative",
      entityId: initiative.id,
      metadata: { customerAccountId: input.customerAccountId, title: initiative.title },
    });

    return initiative;
  }

  /**
   * Retrieves an initiative with its milestones.
   */
  public async getInitiative(workspaceId: string, initiativeId: string) {
    const initiative = await prisma.customerStrategicInitiative.findFirst({
      where: { id: initiativeId, workspaceId },
      include: {
        customerAccount: { select: { id: true, name: true } },
        accountPlan: { select: { id: true, title: true } },
        milestones: { orderBy: { targetDate: "asc" } },
      },
    });

    if (!initiative) {
      throw new HttpError(404, `Strategic initiative '${initiativeId}' not found in workspace.`);
    }

    return initiative;
  }

  /**
   * Lists strategic initiatives with filters.
   */
  public async listInitiatives(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      accountPlanId?: string;
      status?: string;
    }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) {
      where.customerAccountId = filters.customerAccountId;
    }
    if (filters?.accountPlanId) {
      where.accountPlanId = filters.accountPlanId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    return prisma.customerStrategicInitiative.findMany({
      where,
      include: {
        customerAccount: { select: { id: true, name: true } },
        accountPlan: { select: { id: true, title: true } },
        _count: { select: { milestones: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Updates an initiative.
   */
  public async updateInitiative(
    workspaceId: string,
    initiativeId: string,
    input: UpdateStrategicInitiativeInput,
    actorId?: string
  ) {
    const initiative = await prisma.customerStrategicInitiative.findFirst({
      where: { id: initiativeId, workspaceId },
    });
    if (!initiative) {
      throw new HttpError(404, `Strategic initiative '${initiativeId}' not found in workspace.`);
    }

    const updated = await prisma.customerStrategicInitiative.update({
      where: { id: initiativeId },
      data: {
        title: input.title !== undefined ? input.title : initiative.title,
        description: input.description !== undefined ? input.description : initiative.description,
        status: input.status !== undefined ? input.status : initiative.status,
        targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : initiative.targetCompletionDate,
        completedAt: input.completedAt ? new Date(input.completedAt) : input.status === "COMPLETED" ? new Date() : initiative.completedAt,
        ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : initiative.ownerUserId,
        linkedRevenueOpportunityId: input.linkedRevenueOpportunityId !== undefined ? input.linkedRevenueOpportunityId : initiative.linkedRevenueOpportunityId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "STRATEGIC_INITIATIVE_UPDATED",
      entityType: "CustomerStrategicInitiative",
      entityId: initiativeId,
      metadata: { previousStatus: initiative.status, newStatus: updated.status },
    });

    return updated;
  }

  /**
   * Adds a milestone to an initiative.
   */
  public async addMilestone(
    workspaceId: string,
    initiativeId: string,
    input: { title: string; targetDate: string },
    actorId?: string
  ) {
    const initiative = await prisma.customerStrategicInitiative.findFirst({
      where: { id: initiativeId, workspaceId },
    });
    if (!initiative) {
      throw new HttpError(404, `Strategic initiative '${initiativeId}' not found in workspace.`);
    }

    const milestone = await prisma.customerStrategicMilestone.create({
      data: {
        workspaceId,
        initiativeId,
        title: input.title,
        targetDate: new Date(input.targetDate),
        status: "PENDING",
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "STRATEGIC_MILESTONE_CREATED",
      entityType: "CustomerStrategicMilestone",
      entityId: milestone.id,
      metadata: { initiativeId, title: milestone.title },
    });

    return milestone;
  }

  /**
   * Updates a milestone.
   */
  public async updateMilestone(
    workspaceId: string,
    milestoneId: string,
    input: { title?: string; targetDate?: string; status?: "PENDING" | "COMPLETED" | "OVERDUE" },
    actorId?: string
  ) {
    const milestone = await prisma.customerStrategicMilestone.findFirst({
      where: { id: milestoneId, workspaceId },
    });
    if (!milestone) {
      throw new HttpError(404, `Milestone '${milestoneId}' not found in workspace.`);
    }

    const completedAt = input.status === "COMPLETED" && !milestone.completedAt
      ? new Date()
      : input.status !== "COMPLETED" ? null : milestone.completedAt;

    const updated = await prisma.customerStrategicMilestone.update({
      where: { id: milestoneId },
      data: {
        title: input.title !== undefined ? input.title : milestone.title,
        targetDate: input.targetDate ? new Date(input.targetDate) : milestone.targetDate,
        status: input.status || milestone.status,
        completedAt,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "STRATEGIC_MILESTONE_UPDATED",
      entityType: "CustomerStrategicMilestone",
      entityId: milestoneId,
      metadata: { previousStatus: milestone.status, newStatus: updated.status },
    });

    return updated;
  }
}

export const strategicInitiativeService = new StrategicInitiativeService();
