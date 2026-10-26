import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateSuccessObjectiveInput,
  UpdateSuccessObjectiveInput,
  RecordObjectiveEvidenceInput,
  RecordObjectiveBlockerInput,
  ResolveObjectiveBlockerInput,
  ObjectiveStatus,
  PERMITTED_OBJECTIVE_STATUS_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";
import { strategicAccountService } from "./strategicAccountService.js";

export class CustomerObjectiveService {
  /**
   * Creates a quantifiable customer business objective.
   */
  public async createObjective(
    workspaceId: string,
    input: CreateSuccessObjectiveInput,
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

    // Uniqueness check for objectiveNumber in workspace
    const existing = await prisma.customerSuccessObjective.findUnique({
      where: {
        workspaceId_objectiveNumber: {
          workspaceId,
          objectiveNumber: input.objectiveNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Objective with number '${input.objectiveNumber}' already exists in workspace.`);
    }

    const targetDate = new Date(input.targetDate);
    const baselineValue = input.baselineValue !== undefined && input.baselineValue !== null ? input.baselineValue : 0;
    const targetValue = input.targetValue !== undefined ? input.targetValue : null;

    const objective = await prisma.customerSuccessObjective.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        accountPlanId: input.accountPlanId || null,
        objectiveNumber: input.objectiveNumber,
        title: input.title,
        description: input.description || null,
        businessRationale: input.businessRationale || null,
        priority: input.priority || "MEDIUM",
        category: input.category || "ADOPTION_SCALE",
        status: "DRAFT",
        targetDate,
        ownerUserId: input.ownerUserId || account.ownerUserId || null,
        successCriteria: input.successCriteria || null,
        measurementMethod: input.measurementMethod || null,
        baselineValue,
        targetValue,
        currentValue: baselineValue,
        unit: input.unit || null,
        progressPercent: 0,
      },
    });

    await strategicAccountService.calculatePortfolioPriority(workspaceId, input.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_OBJECTIVE_CREATED",
      entityType: "CustomerSuccessObjective",
      entityId: objective.id,
      metadata: { customerAccountId: input.customerAccountId, title: objective.title },
    });

    return objective;
  }

  /**
   * Retrieves an objective with its evidence and blockers.
   */
  public async getObjective(workspaceId: string, objectiveId: string) {
    const objective = await prisma.customerSuccessObjective.findFirst({
      where: { id: objectiveId, workspaceId },
      include: {
        customerAccount: {
          select: { id: true, name: true, tier: true },
        },
        accountPlan: {
          select: { id: true, title: true, status: true },
        },
        evidence: {
          orderBy: { observationTimestamp: "desc" },
        },
        blockers: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!objective) {
      throw new HttpError(404, `Objective '${objectiveId}' not found in workspace.`);
    }

    return objective;
  }

  /**
   * Lists customer objectives with filters.
   */
  public async listObjectives(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      accountPlanId?: string;
      status?: ObjectiveStatus;
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

    return prisma.customerSuccessObjective.findMany({
      where,
      include: {
        customerAccount: {
          select: { id: true, name: true, tier: true },
        },
        _count: {
          select: {
            evidence: true,
            blockers: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { targetDate: "asc" },
      ],
    });
  }

  /**
   * Updates an objective.
   */
  public async updateObjective(
    workspaceId: string,
    objectiveId: string,
    input: UpdateSuccessObjectiveInput,
    actorId?: string
  ) {
    const objective = await prisma.customerSuccessObjective.findFirst({
      where: { id: objectiveId, workspaceId },
    });
    if (!objective) {
      throw new HttpError(404, `Objective '${objectiveId}' not found in workspace.`);
    }

    // Status transition validation
    if (input.status && input.status !== objective.status) {
      const allowed = PERMITTED_OBJECTIVE_STATUS_TRANSITIONS[objective.status as ObjectiveStatus] || [];
      if (!allowed.includes(input.status)) {
        throw new HttpError(
          400,
          `Invalid objective status transition from '${objective.status}' to '${input.status}'. Permitted: [${allowed.join(", ")}]`
        );
      }
    }

    const currentValue = input.currentValue !== undefined ? input.currentValue : objective.currentValue;
    let progressPercent = objective.progressPercent;

    if (input.progressPercent !== undefined) {
      progressPercent = input.progressPercent;
    } else if (
      objective.targetValue !== null &&
      objective.baselineValue !== null &&
      objective.targetValue > objective.baselineValue &&
      currentValue !== null
    ) {
      progressPercent = Math.min(
        100,
        Math.max(0, Math.round(((currentValue - objective.baselineValue) / (objective.targetValue - objective.baselineValue)) * 100))
      );
    }

    const achievedAt = input.status === "ACHIEVED" && !objective.achievedAt
      ? new Date()
      : objective.achievedAt;

    const updated = await prisma.customerSuccessObjective.update({
      where: { id: objectiveId },
      data: {
        title: input.title !== undefined ? input.title : objective.title,
        description: input.description !== undefined ? input.description : objective.description,
        businessRationale: input.businessRationale !== undefined ? input.businessRationale : objective.businessRationale,
        priority: input.priority !== undefined ? input.priority : objective.priority,
        status: input.status !== undefined ? input.status : objective.status,
        targetDate: input.targetDate ? new Date(input.targetDate) : objective.targetDate,
        ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : objective.ownerUserId,
        successCriteria: input.successCriteria !== undefined ? input.successCriteria : objective.successCriteria,
        measurementMethod: input.measurementMethod !== undefined ? input.measurementMethod : objective.measurementMethod,
        currentValue,
        progressPercent,
        achievedAt,
      },
    });

    await strategicAccountService.calculatePortfolioPriority(workspaceId, objective.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_OBJECTIVE_UPDATED",
      entityType: "CustomerSuccessObjective",
      entityId: objectiveId,
      metadata: { previousStatus: objective.status, newStatus: updated.status },
    });

    return updated;
  }

  /**
   * Records verified evidence toward an objective.
   */
  public async recordEvidence(
    workspaceId: string,
    objectiveId: string,
    input: RecordObjectiveEvidenceInput,
    actorId?: string
  ) {
    const objective = await prisma.customerSuccessObjective.findFirst({
      where: { id: objectiveId, workspaceId },
    });
    if (!objective) {
      throw new HttpError(404, `Objective '${objectiveId}' not found in workspace.`);
    }

    const observationTimestamp = input.observationTimestamp ? new Date(input.observationTimestamp) : new Date();

    const evidence = await prisma.customerObjectiveEvidence.create({
      data: {
        workspaceId,
        objectiveId,
        evidenceType: input.evidenceType,
        observedValue: input.observedValue !== undefined ? input.observedValue : null,
        observationTimestamp,
        description: input.description,
        sourceRef: input.sourceRef || null,
        recordedById: actorId || null,
      },
    });

    // Update objective currentValue and progress if observedValue provided
    if (input.observedValue !== undefined && input.observedValue !== null) {
      const newCurrentValue = input.observedValue;
      let progressPercent = objective.progressPercent;

      if (objective.targetValue !== null && objective.baselineValue !== null && objective.targetValue > objective.baselineValue) {
        progressPercent = Math.min(
          100,
          Math.max(0, Math.round(((newCurrentValue - objective.baselineValue) / (objective.targetValue - objective.baselineValue)) * 100))
        );
      }

      await prisma.customerSuccessObjective.update({
        where: { id: objectiveId },
        data: {
          currentValue: newCurrentValue,
          progressPercent,
          status: progressPercent >= 100 ? "ACHIEVED" : objective.status === "DRAFT" ? "ACTIVE" : objective.status,
          achievedAt: progressPercent >= 100 ? new Date() : objective.achievedAt,
        },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_OBJECTIVE_EVIDENCE_RECORDED",
      entityType: "CustomerObjectiveEvidence",
      entityId: evidence.id,
      metadata: { objectiveId, evidenceType: input.evidenceType },
    });

    return evidence;
  }

  /**
   * Records an operational blocker impeding an objective.
   */
  public async recordBlocker(
    workspaceId: string,
    objectiveId: string,
    input: RecordObjectiveBlockerInput,
    _actorId?: string
  ) {
    const objective = await prisma.customerSuccessObjective.findFirst({
      where: { id: objectiveId, workspaceId },
    });
    if (!objective) {
      throw new HttpError(404, `Objective '${objectiveId}' not found in workspace.`);
    }

    const blocker = await prisma.customerObjectiveBlocker.create({
      data: {
        workspaceId,
        objectiveId,
        title: input.title,
        description: input.description || null,
        severity: input.severity || "MEDIUM",
        status: "OPEN",
        expectedResolutionDate: input.expectedResolutionDate ? new Date(input.expectedResolutionDate) : null,
      },
    });

    // Flag objective if blocker is critical or high
    if ((input.severity === "CRITICAL" || input.severity === "HIGH") && objective.status === "ACTIVE") {
      await prisma.customerSuccessObjective.update({
        where: { id: objectiveId },
        data: { status: "AT_RISK" },
      });
    }

    await strategicAccountService.calculatePortfolioPriority(workspaceId, objective.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: _actorId,
      action: "CUSTOMER_OBJECTIVE_BLOCKER_RECORDED",
      entityType: "CustomerObjectiveBlocker",
      entityId: blocker.id,
      metadata: { objectiveId, severity: input.severity, title: input.title },
    });

    return blocker;
  }

  /**
   * Resolves an objective blocker.
   */
  public async resolveBlocker(
    workspaceId: string,
    blockerId: string,
    input: ResolveObjectiveBlockerInput,
    actorId?: string
  ) {
    const blocker = await prisma.customerObjectiveBlocker.findFirst({
      where: { id: blockerId, workspaceId },
      include: {
        objective: true,
      },
    });
    if (!blocker) {
      throw new HttpError(404, `Objective blocker '${blockerId}' not found in workspace.`);
    }

    const resolved = await prisma.customerObjectiveBlocker.update({
      where: { id: blockerId },
      data: {
        status: "RESOLVED",
        resolutionNotes: input.resolutionNotes,
        resolvedAt: new Date(),
      },
    });

    // If no remaining open blockers, restore objective status if it was AT_RISK
    const remainingOpen = await prisma.customerObjectiveBlocker.count({
      where: {
        objectiveId: blocker.objectiveId,
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
    });

    if (remainingOpen === 0 && blocker.objective?.status === "AT_RISK") {
      await prisma.customerSuccessObjective.update({
        where: { id: blocker.objectiveId },
        data: { status: "ACTIVE" },
      });
    }

    await strategicAccountService.calculatePortfolioPriority(workspaceId, blocker.objective.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_OBJECTIVE_BLOCKER_RESOLVED",
      entityType: "CustomerObjectiveBlocker",
      entityId: blockerId,
      metadata: { objectiveId: blocker.objectiveId },
    });

    return resolved;
  }
}

export const customerObjectiveService = new CustomerObjectiveService();
