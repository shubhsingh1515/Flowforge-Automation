import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateExpansionOpportunityInput,
  QualifyExpansionOpportunityInput,
  UpdateExpansionStageInput,
  ExpansionStage,
  PERMITTED_EXPANSION_STAGE_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerExpansionService {
  /**
   * Creates a tenant-isolated expansion opportunity in DETECTED stage.
   */
  public async createOpportunity(
    workspaceId: string,
    input: CreateExpansionOpportunityInput,
    actorId?: string
  ) {
    // 1. Verify customer account exists in workspace
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    // 2. Uniqueness check for opportunityNumber
    const existing = await prisma.customerExpansionOpportunity.findUnique({
      where: {
        workspaceId_opportunityNumber: {
          workspaceId,
          opportunityNumber: input.opportunityNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Expansion opportunity '${input.opportunityNumber}' already exists.`);
    }

    // 3. Create opportunity with initial DETECTED stage
    const opportunity = await prisma.customerExpansionOpportunity.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        opportunityNumber: input.opportunityNumber,
        opportunityType: input.opportunityType,
        stage: "DETECTED",
        title: input.title,
        description: input.description,
        ownerUserId: input.ownerUserId || account.ownerUserId || undefined,
        estimatedValue: input.estimatedValue !== undefined ? Math.round(input.estimatedValue * 100) / 100 : null,
        currency: input.currency || "USD",
        estimateSource: input.estimateSource || "MANUAL_INPUT",
        evidenceSignals: input.evidenceSignals || [],
        qualificationNotes: input.qualificationNotes,
        nextAction: input.nextAction,
        nextActionDueDate: input.nextActionDueDate ? new Date(input.nextActionDueDate) : null,
        stageHistory: {
          create: {
            workspaceId,
            fromStage: null,
            toStage: "DETECTED",
            notes: "Expansion opportunity detected and registered.",
            actorId: actorId || null,
          },
        },
      },
      include: {
        customerAccount: true,
        stageHistory: true,
      },
    });

    // 4. Audit log
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.expansion.created",
      targetType: "CustomerExpansionOpportunity",
      targetId: opportunity.id,
      metadata: {
        opportunityNumber: opportunity.opportunityNumber,
        customerAccountId: opportunity.customerAccountId,
        opportunityType: opportunity.opportunityType,
        estimatedValue: opportunity.estimatedValue,
        currency: opportunity.currency,
      },
    });

    return opportunity;
  }

  /**
   * Retrieves an expansion opportunity by ID with account and stage history.
   */
  public async getOpportunity(workspaceId: string, opportunityId: string) {
    const opportunity = await prisma.customerExpansionOpportunity.findFirst({
      where: { id: opportunityId, workspaceId },
      include: {
        customerAccount: true,
        stageHistory: {
          orderBy: { changedAt: "asc" },
        },
      },
    });
    if (!opportunity) {
      throw new HttpError(404, `Expansion opportunity '${opportunityId}' not found.`);
    }
    return opportunity;
  }

  /**
   * Lists expansion opportunities for a workspace with optional filters.
   */
  public async listOpportunities(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      stage?: string;
      opportunityType?: string;
    }
  ) {
    return prisma.customerExpansionOpportunity.findMany({
      where: {
        workspaceId,
        ...(filters?.customerAccountId ? { customerAccountId: filters.customerAccountId } : {}),
        ...(filters?.stage ? { stage: filters.stage } : {}),
        ...(filters?.opportunityType ? { opportunityType: filters.opportunityType } : {}),
      },
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
            tier: true,
            domain: true,
            lifecycleState: true,
          },
        },
        stageHistory: {
          orderBy: { changedAt: "desc" },
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Governed human qualification of an expansion opportunity.
   * Autonomous AI or automated monitors can detect opportunities, but human qualification
   * is strictly required to move into QUALIFIED or DISMISSED.
   */
  public async qualifyOpportunity(
    workspaceId: string,
    opportunityId: string,
    input: QualifyExpansionOpportunityInput,
    actorId?: string
  ) {
    const opportunity = await this.getOpportunity(workspaceId, opportunityId);

    // Only DETECTED or NEEDS_REVIEW opportunities can be qualified/dismissed here
    if (opportunity.stage !== "DETECTED" && opportunity.stage !== "NEEDS_REVIEW") {
      throw new HttpError(
        400,
        `Cannot qualify expansion opportunity in '${opportunity.stage}' stage. Must be in 'DETECTED' or 'NEEDS_REVIEW'.`
      );
    }

    const targetStage: ExpansionStage = input.qualified ? "QUALIFIED" : "DISMISSED";
    const closedAt = targetStage === "DISMISSED" ? new Date() : null;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update opportunity record
      const opp = await tx.customerExpansionOpportunity.update({
        where: { id: opportunity.id },
        data: {
          stage: targetStage,
          qualificationNotes: input.notes,
          estimatedValue:
            input.estimatedValue !== undefined
              ? Math.round(input.estimatedValue * 100) / 100
              : opportunity.estimatedValue,
          nextAction: input.nextAction || opportunity.nextAction,
          nextActionDueDate: input.nextActionDueDate
            ? new Date(input.nextActionDueDate)
            : opportunity.nextActionDueDate,
          closedAt,
        },
        include: {
          customerAccount: true,
          stageHistory: {
            orderBy: { changedAt: "asc" },
          },
        },
      });

      // 2. Record stage history
      await tx.customerExpansionStageHistory.create({
        data: {
          workspaceId,
          opportunityId: opportunity.id,
          fromStage: opportunity.stage,
          toStage: targetStage,
          notes: input.notes,
          actorId: actorId || null,
        },
      });

      return opp;
    });

    // 3. Audit log
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.expansion.qualified",
      targetType: "CustomerExpansionOpportunity",
      targetId: opportunity.id,
      metadata: {
        fromStage: opportunity.stage,
        toStage: targetStage,
        qualified: input.qualified,
        notes: input.notes,
      },
    });

    return updated;
  }

  /**
   * Governed stage progression with strict transition validation.
   */
  public async updateStage(
    workspaceId: string,
    opportunityId: string,
    input: UpdateExpansionStageInput,
    actorId?: string
  ) {
    const opportunity = await this.getOpportunity(workspaceId, opportunityId);
    const currentStage = opportunity.stage as ExpansionStage;
    const targetStage = input.stage;

    if (currentStage === targetStage) {
      return opportunity;
    }

    // Verify transition validity
    const allowedTransitions = PERMITTED_EXPANSION_STAGE_TRANSITIONS[currentStage] || [];
    if (!allowedTransitions.includes(targetStage)) {
      throw new HttpError(
        400,
        `Invalid expansion stage transition from '${currentStage}' to '${targetStage}'. Allowed targets: [${allowedTransitions.join(", ")}]`
      );
    }

    const closedAt = ["WON", "LOST", "DISMISSED"].includes(targetStage) ? new Date() : null;

    const updated = await prisma.$transaction(async (tx) => {
      const opp = await tx.customerExpansionOpportunity.update({
        where: { id: opportunity.id },
        data: {
          stage: targetStage,
          nextAction: input.nextAction !== undefined ? input.nextAction : opportunity.nextAction,
          nextActionDueDate: input.nextActionDueDate
            ? new Date(input.nextActionDueDate)
            : opportunity.nextActionDueDate,
          closedAt,
        },
        include: {
          customerAccount: true,
          stageHistory: {
            orderBy: { changedAt: "asc" },
          },
        },
      });

      await tx.customerExpansionStageHistory.create({
        data: {
          workspaceId,
          opportunityId: opportunity.id,
          fromStage: currentStage,
          toStage: targetStage,
          notes: input.notes || `Stage updated to ${targetStage}`,
          actorId: actorId || null,
        },
      });

      return opp;
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.expansion.stage_updated",
      targetType: "CustomerExpansionOpportunity",
      targetId: opportunity.id,
      metadata: {
        fromStage: currentStage,
        toStage: targetStage,
        notes: input.notes,
      },
    });

    return updated;
  }

  /**
   * Retrieves stage transition history for an opportunity.
   */
  public async getStageHistory(workspaceId: string, opportunityId: string) {
    await this.getOpportunity(workspaceId, opportunityId);

    return prisma.customerExpansionStageHistory.findMany({
      where: { workspaceId, opportunityId },
      orderBy: { changedAt: "asc" },
    });
  }
}

export const customerExpansionService = new CustomerExpansionService();
