import { prisma } from "@flowforge/database";
import {
  IngestProcessEventInput,
  BusinessProcessInstanceStatus,
  ProcessMilestone,
  ProcessOutcomeMapping,
} from "@flowforge/shared";
import { processSlaService } from "./processSlaService.js";
import { auditLogService } from "./auditLog.js";

export class ProcessInstanceService {
  /**
   * Retrieves an existing process instance or creates a new one deterministically
   */
  async getOrCreateInstance(
    workspaceId: string,
    processDefinitionId: string,
    correlationKey: string
  ) {
    const existing = await prisma.businessProcessInstance.findUnique({
      where: {
        workspaceId_processDefinitionId_correlationKey: {
          workspaceId,
          processDefinitionId,
          correlationKey,
        },
      },
      include: {
        processVersion: true,
      },
    });

    if (existing) {
      return existing;
    }

    const definition = await prisma.businessProcessDefinition.findFirst({
      where: { id: processDefinitionId, workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!definition) {
      throw new Error(`Business process definition '${processDefinitionId}' not found.`);
    }

    const activeVersion =
      definition.versions.find((v) => v.versionNumber === definition.activeVersionNumber) ||
      definition.versions[0];

    if (!activeVersion) {
      throw new Error(`Process definition '${processDefinitionId}' has no published versions.`);
    }

    return await prisma.businessProcessInstance.create({
      data: {
        workspaceId,
        processDefinitionId,
        processVersionId: activeVersion.id,
        correlationKey,
        status: "CREATED",
        metadata: {},
      },
      include: {
        processVersion: true,
      },
    });
  }

  /**
   * Ingests a milestone or outcome event into a business process instance idempotently
   */
  async ingestEvent(workspaceId: string, input: IngestProcessEventInput) {
    const instance = await this.getOrCreateInstance(
      workspaceId,
      input.processDefinitionId,
      input.correlationKey
    );

    const idempotencyKey =
      input.idempotencyKey ||
      `evt_${instance.id}_${input.milestoneId}_${input.eventType}_${input.stepId || input.executionId || "direct"}`;

    // Check for duplicate event
    const existingEvent = await prisma.businessProcessEvent.findUnique({
      where: {
        instanceId_idempotencyKey: {
          instanceId: instance.id,
          idempotencyKey,
        },
      },
    });

    if (existingEvent) {
      return {
        event: existingEvent,
        instance,
        deduplicated: true,
      };
    }

    const milestones = (instance.processVersion?.milestones as unknown as ProcessMilestone[]) || [];
    const outcomeMappings =
      (instance.processVersion?.outcomeMappings as unknown as ProcessOutcomeMapping[]) || [];

    const currentMilestone = milestones.find((m) => m.id === input.milestoneId);
    const milestoneName = currentMilestone?.name || input.milestoneId;

    // Persist event
    const event = await prisma.businessProcessEvent.create({
      data: {
        instanceId: instance.id,
        workspaceId,
        milestoneId: input.milestoneId,
        milestoneName,
        eventType: input.eventType,
        workflowId: input.workflowId || currentMilestone?.workflowId,
        executionId: input.executionId,
        stepId: input.stepId,
        durationMs: input.durationMs,
        errorCategory: input.errorCategory,
        idempotencyKey,
        details: (input.details as any) || {},
      },
    });

    // Determine state transition
    let nextStatus: BusinessProcessInstanceStatus = instance.status as BusinessProcessInstanceStatus;
    let completedAt: Date | null = instance.completedAt;
    let durationMs: number | null = instance.durationMs;
    let terminalOutcome: string | null = instance.terminalOutcome;
    let outcomeDetails: any = instance.outcomeDetails;

    // 1. Advance CREATED to IN_PROGRESS on start
    if (input.eventType === "MILESTONE_STARTED") {
      if (nextStatus === "CREATED") {
        nextStatus = "IN_PROGRESS";
      }
    } else if (input.eventType === "APPROVAL_WAITING") {
      nextStatus = "WAITING";
    } else if (input.eventType === "MILESTONE_FAILED") {
      if (currentMilestone?.isTerminal) {
        nextStatus = "FAILED";
        completedAt = new Date();
        durationMs = completedAt.getTime() - new Date(instance.startedAt).getTime();
      }
    } else if (input.eventType === "MILESTONE_COMPLETED") {
      if (nextStatus === "WAITING") {
        nextStatus = "IN_PROGRESS";
      }
      if (currentMilestone?.isTerminal) {
        nextStatus = "COMPLETED";
        completedAt = new Date();
        durationMs = completedAt.getTime() - new Date(instance.startedAt).getTime();
      }
    }

    // 2. Evaluate Outcome Mappings if details provided
    if (input.details) {
      for (const mapping of outcomeMappings) {
        if (mapping.milestoneId === input.milestoneId) {
          const actualVal = (input.details as any)[mapping.condition.field];
          let matches = false;

          if (mapping.condition.operator === "EQUALS") {
            matches = actualVal === mapping.condition.value;
          } else if (mapping.condition.operator === "EXISTS") {
            matches = actualVal !== undefined && actualVal !== null;
          } else if (mapping.condition.operator === "NOT_EQUALS") {
            matches = actualVal !== mapping.condition.value;
          }

          if (matches) {
            terminalOutcome = mapping.name;
            outcomeDetails = input.details;
            if (mapping.isSuccess) {
              nextStatus = "COMPLETED";
            } else {
              nextStatus = "FAILED";
            }
            completedAt = new Date();
            durationMs = completedAt.getTime() - new Date(instance.startedAt).getTime();
            break;
          }
        }
      }
    }

    if (input.eventType === "OUTCOME_RECORDED") {
      terminalOutcome = (input.details as any)?.outcome || "RECORDED";
      outcomeDetails = input.details;
    }

    const updatedInstance = await prisma.businessProcessInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus,
        currentMilestoneId: input.milestoneId,
        currentMilestoneName: milestoneName,
        completedAt,
        durationMs,
        terminalOutcome,
        outcomeDetails,
        updatedAt: new Date(),
      },
      include: {
        processVersion: true,
      },
    });

    // Run SLA check
    let slaEvaluation = null;
    try {
      slaEvaluation = await processSlaService.evaluateInstance(instance.id);
    } catch (_err) {
      // SLA failure should not fail event ingestion
    }

    return {
      event,
      instance: updatedInstance,
      slaEvaluation,
      deduplicated: false,
    };
  }

  /**
   * Retrieves process instance with all events ordered chronologically
   */
  async getInstance(workspaceId: string, instanceId: string) {
    const instance = await prisma.businessProcessInstance.findFirst({
      where: { id: instanceId, workspaceId },
      include: {
        processDefinition: true,
        processVersion: true,
        events: {
          orderBy: { createdAt: "asc" },
        },
        slaEvaluations: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!instance) {
      throw new Error(`Process instance '${instanceId}' not found.`);
    }

    return instance;
  }

  /**
   * Lists process instances in a workspace with filtering and pagination
   */
  async listInstances(
    workspaceId: string,
    processDefinitionId?: string,
    query?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = query?.limit && query.limit > 0 ? Math.min(query.limit, 100) : 25;
    const offset = query?.offset && query.offset >= 0 ? query.offset : 0;

    const where: any = {
      workspaceId,
      ...(processDefinitionId ? { processDefinitionId } : {}),
      ...(query?.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.businessProcessInstance.findMany({
        where,
        include: {
          processDefinition: {
            select: { id: true, name: true, slug: true, businessDomain: true },
          },
          _count: {
            select: { events: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.businessProcessInstance.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Explicitly cancels an in-progress process instance
   */
  async cancelInstance(workspaceId: string, instanceId: string, userId: string, reason?: string) {
    const instance = await prisma.businessProcessInstance.findFirst({
      where: { id: instanceId, workspaceId },
    });

    if (!instance) {
      throw new Error(`Process instance '${instanceId}' not found.`);
    }

    if (["COMPLETED", "FAILED", "CANCELLED"].includes(instance.status)) {
      throw new Error(`Cannot cancel instance in terminal state '${instance.status}'.`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - new Date(instance.startedAt).getTime();

    const updated = await prisma.businessProcessInstance.update({
      where: { id: instanceId },
      data: {
        status: "CANCELLED",
        completedAt,
        durationMs,
        terminalOutcome: "MANUAL_CANCELLATION",
        outcomeDetails: { reason: reason || "Cancelled by user" },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "PROCESS_INSTANCE_CANCELLED",
      targetType: "PROCESS_INSTANCE",
      targetId: instanceId,
      metadata: { reason },
    });

    return updated;
  }
}

export const processInstanceService = new ProcessInstanceService();
