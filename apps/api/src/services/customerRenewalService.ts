import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateRenewalOpportunityInput,
  UpdateRenewalOpportunityStageInput,
  RecordRenewalOutcomeInput,
  RenewalStage,
  PERMITTED_RENEWAL_STAGE_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerRenewalService {
  /**
   * Creates a tenant-isolated renewal opportunity.
   */
  public async createOpportunity(
    workspaceId: string,
    input: CreateRenewalOpportunityInput,
    actorId?: string
  ) {
    // 1. Verify contract exists in workspace
    const contract = await prisma.customerContract.findFirst({
      where: { id: input.contractId, workspaceId },
      include: { customerAccount: true },
    });
    if (!contract) {
      throw new HttpError(404, `Contract '${input.contractId}' not found in workspace.`);
    }

    // 2. Uniqueness check for opportunityNumber
    const existing = await prisma.customerRenewalOpportunity.findUnique({
      where: {
        workspaceId_opportunityNumber: {
          workspaceId,
          opportunityNumber: input.opportunityNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Renewal opportunity '${input.opportunityNumber}' already exists.`);
    }

    // 3. Create opportunity
    const opportunity = await prisma.customerRenewalOpportunity.create({
      data: {
        workspaceId,
        contractId: contract.id,
        customerAccountId: contract.customerAccountId,
        opportunityNumber: input.opportunityNumber,
        ownerUserId: input.ownerUserId || contract.ownerUserId,
        targetDate: new Date(input.targetDate),
        renewalAmount: Math.round(input.renewalAmount * 100) / 100,
        currency: input.currency.toUpperCase(),
        stage: input.stage,
        nextAction: input.nextAction,
        nextActionDueDate: input.nextActionDueDate ? new Date(input.nextActionDueDate) : null,
        qualificationNotes: input.qualificationNotes,
        supportingEvidence: input.supportingEvidence,
        lastActivityAt: new Date(),
      },
    });

    // 4. Update contract status to RENEWAL_PENDING if currently ACTIVE
    if (contract.status === "ACTIVE") {
      await prisma.customerContract.update({
        where: { id: contract.id },
        data: { status: "RENEWAL_PENDING", updatedById: actorId },
      });
    }

    // 5. Record initial timeline event
    await prisma.customerRenewalTimelineEvent.create({
      data: {
        workspaceId,
        renewalOpportunityId: opportunity.id,
        eventType: "OPPORTUNITY_CREATED",
        eventTitle: "Renewal Opportunity Created",
        description: `Renewal pipeline initialized for contract ${contract.contractNumber} (${contract.currency} ${opportunity.renewalAmount})`,
        newStage: opportunity.stage,
        actorId: actorId || "SYSTEM",
        idempotencyKey: `init_${opportunity.id}`,
      },
    });

    // 6. Audit log
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.renewal.created",
      targetType: "CustomerRenewalOpportunity",
      targetId: opportunity.id,
      metadata: {
        opportunityNumber: opportunity.opportunityNumber,
        contractId: contract.id,
        renewalAmount: opportunity.renewalAmount,
      },
    });

    return opportunity;
  }

  /**
   * Retrieves a renewal opportunity with full details.
   */
  public async getOpportunity(workspaceId: string, opportunityIdOrNumber: string) {
    const opp = await prisma.customerRenewalOpportunity.findFirst({
      where: {
        workspaceId,
        OR: [{ id: opportunityIdOrNumber }, { opportunityNumber: opportunityIdOrNumber }],
      },
      include: {
        contract: true,
        customerAccount: {
          select: { id: true, name: true, slug: true, tier: true, healthStatus: true, healthScore: true },
        },
        timelineEvents: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        riskEvaluations: {
          orderBy: { evaluationTimestamp: "desc" },
          take: 10,
        },
      },
    });

    if (!opp) {
      throw new HttpError(404, `Renewal opportunity '${opportunityIdOrNumber}' not found.`);
    }

    return opp;
  }

  /**
   * Lists renewal opportunities with filtering.
   */
  public async listOpportunities(
    workspaceId: string,
    filters?: {
      stage?: string;
      riskClassification?: string;
      contractId?: string;
      customerAccountId?: string;
      ownerUserId?: string;
      currency?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { workspaceId };

    if (filters?.stage) where.stage = filters.stage;
    if (filters?.riskClassification) where.riskClassification = filters.riskClassification;
    if (filters?.contractId) where.contractId = filters.contractId;
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters?.ownerUserId) where.ownerUserId = filters.ownerUserId;
    if (filters?.currency) where.currency = filters.currency.toUpperCase();
    if (filters?.search) {
      where.OR = [
        { opportunityNumber: { contains: filters.search, mode: "insensitive" } },
        { qualificationNotes: { contains: filters.search, mode: "insensitive" } },
        { nextAction: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.customerRenewalOpportunity.count({ where }),
      prisma.customerRenewalOpportunity.findMany({
        where,
        include: {
          contract: {
            select: { id: true, contractNumber: true, name: true, renewalDate: true, status: true },
          },
          customerAccount: {
            select: { id: true, name: true, slug: true, healthStatus: true, healthScore: true },
          },
        },
        orderBy: { targetDate: "asc" },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
    ]);

    return { total, items, limit: filters?.limit || 50, offset: filters?.offset || 0 };
  }

  /**
   * Updates renewal opportunity stage following permitted transitions.
   */
  public async updateStage(
    workspaceId: string,
    opportunityId: string,
    input: UpdateRenewalOpportunityStageInput,
    actorId?: string
  ) {
    const opp = await prisma.customerRenewalOpportunity.findFirst({
      where: { id: opportunityId, workspaceId },
    });
    if (!opp) {
      throw new HttpError(404, `Renewal opportunity '${opportunityId}' not found.`);
    }

    if (opp.stage === input.stage) {
      return opp;
    }

    // Validate transition
    const allowed = PERMITTED_RENEWAL_STAGE_TRANSITIONS[opp.stage as RenewalStage] || [];
    if (!allowed.includes(input.stage as RenewalStage)) {
      throw new HttpError(
        400,
        `Invalid renewal stage transition from '${opp.stage}' to '${input.stage}'. Permitted: [${allowed.join(", ")}]`
      );
    }

    const updated = await prisma.customerRenewalOpportunity.update({
      where: { id: opportunityId },
      data: {
        stage: input.stage,
        nextAction: input.nextAction !== undefined ? input.nextAction : opp.nextAction,
        nextActionDueDate: input.nextActionDueDate ? new Date(input.nextActionDueDate) : opp.nextActionDueDate,
        lastActivityAt: new Date(),
        closedAt: input.stage === "RENEWED" || input.stage === "LOST" ? new Date() : opp.closedAt,
      },
    });

    // Timeline event
    await prisma.customerRenewalTimelineEvent.create({
      data: {
        workspaceId,
        renewalOpportunityId: opp.id,
        eventType: "STAGE_CHANGED",
        eventTitle: `Stage advanced to ${input.stage}`,
        description: input.notes || `Renewal opportunity moved from ${opp.stage} to ${input.stage}`,
        previousStage: opp.stage,
        newStage: input.stage,
        actorId: actorId || "SYSTEM",
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.renewal.stage_changed",
      targetType: "CustomerRenewalOpportunity",
      targetId: opportunityId,
      metadata: { from: opp.stage, to: input.stage },
    });

    return updated;
  }

  /**
   * Records a formal commercial renewal outcome.
   */
  public async recordOutcome(
    workspaceId: string,
    opportunityId: string,
    input: RecordRenewalOutcomeInput,
    actorId?: string
  ) {
    const opp = await prisma.customerRenewalOpportunity.findFirst({
      where: { id: opportunityId, workspaceId },
      include: { contract: true },
    });
    if (!opp) {
      throw new HttpError(404, `Renewal opportunity '${opportunityId}' not found.`);
    }

    const isSuccess = input.outcome.startsWith("RENEWED");
    const terminalStage: RenewalStage = isSuccess ? "RENEWED" : "LOST";

    // Update opportunity
    const updated = await prisma.customerRenewalOpportunity.update({
      where: { id: opportunityId },
      data: {
        stage: terminalStage,
        outcome: input.outcome,
        renewalAmount: input.finalAmount !== undefined
          ? Math.round(input.finalAmount * 100) / 100
          : opp.renewalAmount,
        closedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    // Update associated contract
    if (isSuccess) {
      await prisma.customerContract.update({
        where: { id: opp.contractId },
        data: { status: "RENEWED", updatedById: actorId },
      });

      // If successor contract number is specified and not exists, create the successor contract
      if (input.successorContractNumber) {
        const nextStartDate = new Date(opp.contract.termEndDate);
        const nextEndDate = new Date(nextStartDate);
        nextEndDate.setDate(nextEndDate.getDate() + opp.contract.renewalTermsDays);

        const successor = await prisma.customerContract.findUnique({
          where: {
            workspaceId_contractNumber: {
              workspaceId,
              contractNumber: input.successorContractNumber,
            },
          },
        });

        if (!successor) {
          await prisma.customerContract.create({
            data: {
              workspaceId,
              customerAccountId: opp.customerAccountId,
              contractNumber: input.successorContractNumber,
              name: `${opp.contract.name} (Renewal Term)`,
              status: "ACTIVE",
              ownerUserId: opp.ownerUserId || opp.contract.ownerUserId,
              startDate: nextStartDate,
              termEndDate: nextEndDate,
              renewalDate: nextEndDate,
              contractValue: updated.renewalAmount,
              annualRecurringValue: updated.renewalAmount,
              currency: opp.currency,
              contractType: opp.contract.contractType,
              renewalType: opp.contract.renewalType,
              autoRenew: opp.contract.autoRenew,
              previousContractId: opp.contract.id,
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }
    } else if (input.outcome === "CHURNED") {
      await prisma.customerContract.update({
        where: { id: opp.contractId },
        data: { status: "TERMINATED", updatedById: actorId },
      });

      await prisma.customerAccount.update({
        where: { id: opp.customerAccountId },
        data: { lifecycleState: "CHURNED" },
      });
    }

    // Timeline event
    await prisma.customerRenewalTimelineEvent.create({
      data: {
        workspaceId,
        renewalOpportunityId: opp.id,
        eventType: "OUTCOME_FINALIZED",
        eventTitle: `Renewal outcome finalized: ${input.outcome}`,
        description: input.notes,
        previousStage: opp.stage,
        newStage: terminalStage,
        actorId: actorId || "SYSTEM",
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.renewal.completed",
      targetType: "CustomerRenewalOpportunity",
      targetId: opportunityId,
      metadata: { outcome: input.outcome, terminalStage },
    });

    return updated;
  }

  /**
   * Adds a durable timeline event to a renewal opportunity.
   */
  public async recordTimelineEvent(
    workspaceId: string,
    opportunityId: string,
    input: {
      eventType: string;
      eventTitle: string;
      description?: string;
      actorId?: string;
      idempotencyKey?: string;
      metadata?: any;
    }
  ) {
    if (input.idempotencyKey) {
      const existing = await prisma.customerRenewalTimelineEvent.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }

    return prisma.customerRenewalTimelineEvent.create({
      data: {
        workspaceId,
        renewalOpportunityId: opportunityId,
        eventType: input.eventType,
        eventTitle: input.eventTitle,
        description: input.description,
        actorId: input.actorId || "SYSTEM",
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata || {},
      },
    });
  }

  /**
   * Retrieves timeline for a renewal opportunity.
   */
  public async getTimeline(workspaceId: string, opportunityId: string) {
    return prisma.customerRenewalTimelineEvent.findMany({
      where: { workspaceId, renewalOpportunityId: opportunityId },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const customerRenewalService = new CustomerRenewalService();
