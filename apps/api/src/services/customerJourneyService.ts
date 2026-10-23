import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateCustomerJourneyDefinitionInput,
  CreateCustomerJourneyVersionInput,
  StartCustomerJourneyInstanceInput,
  ProgressJourneyMilestoneInput,
} from "@flowforge/shared";

export class CustomerJourneyService {
  /**
   * Creates a journey definition.
   */
  public async createDefinition(workspaceId: string, input: CreateCustomerJourneyDefinitionInput) {
    const existing = await prisma.customerJourneyDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Journey definition with slug '${input.slug}' already exists.`);
    }

    return prisma.customerJourneyDefinition.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        journeyType: input.journeyType,
        targetSegment: input.targetSegment,
      },
    });
  }

  /**
   * Creates a version for a journey definition.
   */
  public async createVersion(
    workspaceId: string,
    definitionId: string,
    input: CreateCustomerJourneyVersionInput
  ) {
    const definition = await prisma.customerJourneyDefinition.findFirst({
      where: { id: definitionId, workspaceId },
    });
    if (!definition) throw new HttpError(404, `Journey definition '${definitionId}' not found.`);

    const highestVersion = await prisma.customerJourneyVersion.findFirst({
      where: { definitionId: definition.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextVersionNumber = (highestVersion?.versionNumber || 0) + 1;

    return prisma.customerJourneyVersion.create({
      data: {
        definitionId: definition.id,
        versionNumber: nextVersionNumber,
        isPublished: false,
        entryConditions: input.entryConditions,
        milestones: input.milestones,
        exitConditions: input.exitConditions,
        targetDurationHours: input.targetDurationHours,
        slaPolicy: input.slaPolicy,
      },
    });
  }

  /**
   * Publishes an immutable journey version.
   */
  public async publishVersion(workspaceId: string, definitionId: string, versionNumber: number) {
    const version = await prisma.customerJourneyVersion.findFirst({
      where: {
        definitionId,
        versionNumber,
        definition: { workspaceId },
      },
    });
    if (!version) throw new HttpError(404, `Journey version ${versionNumber} not found.`);

    const updatedVersion = await prisma.customerJourneyVersion.update({
      where: { id: version.id },
      data: { isPublished: true },
    });

    await prisma.customerJourneyDefinition.update({
      where: { id: definitionId },
      data: { publishedVersionId: version.id },
    });

    return updatedVersion;
  }

  /**
   * Starts a journey instance with idempotency key deduplication.
   */
  public async startJourneyInstance(workspaceId: string, input: StartCustomerJourneyInstanceInput) {
    // Check account exists
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await prisma.customerJourneyInstance.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return existing;
      }
    }

    // Resolve journey version
    const definition = await prisma.customerJourneyDefinition.findFirst({
      where: { id: input.journeyDefinitionId, workspaceId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    if (!definition) throw new HttpError(404, `Journey definition '${input.journeyDefinitionId}' not found.`);

    let targetVersion = definition.versions.find((v) => v.id === input.journeyVersionId);
    if (!targetVersion) {
      targetVersion = definition.versions.find((v) => v.id === definition.publishedVersionId) || definition.versions[0];
    }

    if (!targetVersion) {
      throw new HttpError(400, "Journey definition has no configured versions.");
    }

    const milestones = (targetVersion.milestones as any[]) || [];
    const firstMilestone = milestones[0];

    const initialHistory = firstMilestone
      ? [
          {
            milestoneId: firstMilestone.id,
            name: firstMilestone.name,
            status: "IN_PROGRESS",
            startedAt: new Date().toISOString(),
          },
        ]
      : [];

    return prisma.customerJourneyInstance.create({
      data: {
        workspaceId,
        journeyDefinitionId: definition.id,
        journeyVersionId: targetVersion.id,
        customerAccountId: account.id,
        status: "IN_PROGRESS",
        currentMilestoneId: firstMilestone?.id || null,
        currentMilestoneName: firstMilestone?.name || null,
        milestoneHistory: initialHistory,
        relatedProcessInstanceId: input.relatedProcessInstanceId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
    });
  }

  /**
   * Progresses milestone in an active journey instance.
   */
  public async progressMilestone(
    workspaceId: string,
    instanceId: string,
    input: ProgressJourneyMilestoneInput
  ) {
    const instance = await prisma.customerJourneyInstance.findFirst({
      where: { id: instanceId, workspaceId },
      include: { journeyVersion: true },
    });
    if (!instance) throw new HttpError(404, `Journey instance '${instanceId}' not found.`);

    if (instance.status === "COMPLETED" || instance.status === "FAILED") {
      throw new HttpError(400, `Cannot progress milestone on a '${instance.status}' journey.`);
    }

    const milestones = (instance.journeyVersion.milestones as any[]) || [];
    const currentIndex = milestones.findIndex((m) => m.id === input.milestoneId);
    if (currentIndex === -1) {
      throw new HttpError(400, `Milestone '${input.milestoneId}' is not part of this journey version.`);
    }

    const history: any[] = (instance.milestoneHistory as any[]) || [];
    const now = new Date();

    // Mark current milestone
    const existingIdx = history.findIndex((h) => h.milestoneId === input.milestoneId);
    if (existingIdx >= 0) {
      history[existingIdx].status = input.status;
      history[existingIdx].completedAt = now.toISOString();
      history[existingIdx].notes = input.notes;
    } else {
      history.push({
        milestoneId: input.milestoneId,
        name: milestones[currentIndex].name,
        status: input.status,
        completedAt: now.toISOString(),
        notes: input.notes,
      });
    }

    let nextMilestone = milestones[currentIndex + 1];
    let nextStatus = instance.status;
    let completedAt: Date | null = null;
    let durationMs: number | null = null;

    if (input.status === "FAILED") {
      nextStatus = "FAILED";
      completedAt = now;
      durationMs = now.getTime() - instance.startedAt.getTime();
    } else if (input.status === "BLOCKED") {
      nextStatus = "BLOCKED";
    } else if (!nextMilestone || currentIndex === milestones.length - 1) {
      // Completed all milestones
      nextStatus = "COMPLETED";
      completedAt = now;
      durationMs = now.getTime() - instance.startedAt.getTime();
      nextMilestone = null;
    } else {
      nextStatus = "IN_PROGRESS";
      if (!history.some((h) => h.milestoneId === nextMilestone.id)) {
        history.push({
          milestoneId: nextMilestone.id,
          name: nextMilestone.name,
          status: "IN_PROGRESS",
          startedAt: now.toISOString(),
        });
      }
    }

    return prisma.customerJourneyInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus,
        currentMilestoneId: nextMilestone ? nextMilestone.id : null,
        currentMilestoneName: nextMilestone ? nextMilestone.name : null,
        milestoneHistory: history,
        completedAt,
        durationMs,
      },
    });
  }

  /**
   * Retrieves journey instance details.
   */
  public async getJourneyInstance(workspaceId: string, instanceId: string) {
    const instance = await prisma.customerJourneyInstance.findFirst({
      where: { id: instanceId, workspaceId },
      include: {
        customerAccount: { select: { id: true, name: true, slug: true } },
        journeyDefinition: true,
        journeyVersion: true,
        tasks: true,
      },
    });
    if (!instance) throw new HttpError(404, `Journey instance '${instanceId}' not found.`);
    return instance;
  }

  /**
   * Lists journey instances for an account or workspace.
   */
  public async listJourneyInstances(
    workspaceId: string,
    filters?: { customerAccountId?: string; status?: string; journeyType?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters?.status) where.status = filters.status;
    if (filters?.journeyType) where.journeyDefinition = { journeyType: filters.journeyType };

    return prisma.customerJourneyInstance.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        customerAccount: { select: { id: true, name: true, slug: true } },
        journeyDefinition: { select: { name: true, journeyType: true } },
      },
    });
  }

  /**
   * Calculates journey analytics (completion rate, median duration, SLA attainment).
   */
  public async getJourneyAnalytics(workspaceId: string, definitionId?: string) {
    const where: any = { workspaceId };
    if (definitionId) where.journeyDefinitionId = definitionId;

    const instances = await prisma.customerJourneyInstance.findMany({
      where,
      select: {
        status: true,
        durationMs: true,
        slaStatus: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const total = instances.length;
    if (total === 0) {
      return {
        totalInstances: 0,
        completedCount: 0,
        completionRate: 0,
        medianDurationMs: 0,
        slaAttainmentRate: 1.0,
      };
    }

    const completed = instances.filter((i) => i.status === "COMPLETED");
    const completionRate = completed.length / total;

    const durations = completed
      .map((i) => i.durationMs)
      .filter((d): d is number => d !== null && d > 0)
      .sort((a, b) => a - b);

    const medianDurationMs =
      durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;

    const slaMetCount = instances.filter((i) => i.slaStatus === "MET").length;
    const slaAttainmentRate = slaMetCount / total;

    return {
      totalInstances: total,
      completedCount: completed.length,
      completionRate,
      medianDurationMs,
      slaAttainmentRate,
    };
  }
}

export const customerJourneyService = new CustomerJourneyService();
