import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  CreateProcessDefinitionInput,
  UpdateProcessDefinitionInput,
  ProcessMilestone,
  ProcessCorrelationRule,
  ProcessOutcomeMapping,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export function computeProcessContentHash(data: {
  milestones: ProcessMilestone[];
  correlationRules: ProcessCorrelationRule[];
  outcomeMappings: ProcessOutcomeMapping[];
  targetSlaDurationMs?: number;
}): string {
  const normalized = {
    milestones: (data.milestones || []).map((m) => ({
      id: m.id,
      name: m.name,
      workflowId: m.workflowId,
      releaseArtifactId: m.releaseArtifactId || null,
      order: m.order,
      isEntry: !!m.isEntry,
      isTerminal: !!m.isTerminal,
      expectedDurationMs: m.expectedDurationMs || null,
      requiredApprovals: m.requiredApprovals || 0,
    })).sort((a, b) => a.order - b.order),
    correlationRules: (data.correlationRules || []).map((c) => ({
      milestoneId: c.milestoneId,
      correlationField: c.correlationField,
      sourceType: c.sourceType,
      nodeId: c.nodeId || null,
    })).sort((a, b) => a.milestoneId.localeCompare(b.milestoneId)),
    outcomeMappings: (data.outcomeMappings || []).map((o) => ({
      name: o.name,
      milestoneId: o.milestoneId,
      condition: o.condition,
      isSuccess: !!o.isSuccess,
    })).sort((a, b) => a.name.localeCompare(b.name)),
    targetSlaDurationMs: data.targetSlaDurationMs || null,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export class ProcessDefinitionService {
  /**
   * Validates milestone graph topology and references
   */
  private validateMilestones(milestones: ProcessMilestone[]) {
    if (!milestones || milestones.length === 0) {
      throw new Error("A business process requires at least one milestone");
    }

    const seenIds = new Set<string>();
    const seenOrders = new Set<number>();

    for (const m of milestones) {
      if (seenIds.has(m.id)) {
        throw new Error(`Duplicate milestone ID: ${m.id}`);
      }
      seenIds.add(m.id);

      if (seenOrders.has(m.order)) {
        throw new Error(`Duplicate milestone order: ${m.order}`);
      }
      seenOrders.add(m.order);
    }

    // Ensure at least one entry point
    const hasEntry = milestones.some((m) => m.isEntry);
    if (!hasEntry) {
      // Mark lowest order as entry
      const lowest = [...milestones].sort((a, b) => a.order - b.order)[0];
      lowest.isEntry = true;
    }
  }

  /**
   * Creates a business process definition and initial version
   */
  async createProcessDefinition(
    workspaceId: string,
    userId: string,
    input: CreateProcessDefinitionInput
  ) {
    const existing = await prisma.businessProcessDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new Error(`A process definition with slug '${input.slug}' already exists in this workspace.`);
    }

    // Verify workflows exist in workspace
    const workflowIds = [...new Set(input.milestones.map((m) => m.workflowId))];
    const foundWorkflows = await prisma.workflow.findMany({
      where: {
        id: { in: workflowIds },
        workspaceId,
      },
      select: { id: true },
    });

    if (foundWorkflows.length !== workflowIds.length) {
      throw new Error("One or more referenced workflows do not exist in this workspace.");
    }

    this.validateMilestones(input.milestones);

    const contentHash = computeProcessContentHash({
      milestones: input.milestones,
      correlationRules: input.correlationRules || [],
      outcomeMappings: input.outcomeMappings || [],
      targetSlaDurationMs: input.targetSlaDurationMs,
    });

    const definition = await prisma.$transaction(async (tx) => {
      const def = await tx.businessProcessDefinition.create({
        data: {
          workspaceId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          businessDomain: input.businessDomain || "OPERATIONS",
          criticality: input.criticality || "MEDIUM",
          ownerUserId: input.ownerUserId || userId,
          owningTeamId: input.owningTeamId,
          escalationContact: input.escalationContact,
          activeVersionNumber: 1,
          contentHash,
        },
      });

      const ver = await tx.businessProcessVersion.create({
        data: {
          processDefinitionId: def.id,
          versionNumber: 1,
          contentHash,
          milestones: (input.milestones as any) || [],
          correlationRules: (input.correlationRules as any) || [],
          outcomeMappings: (input.outcomeMappings as any) || [],
          targetSlaDurationMs: input.targetSlaDurationMs,
          createdById: userId,
        },
      });

      if (input.targetSlaDurationMs) {
        await tx.processSlaPolicy.create({
          data: {
            workspaceId,
            processDefinitionId: def.id,
            name: `${input.name} Default SLA`,
            targetDurationMs: input.targetSlaDurationMs,
            warningThresholdMs: Math.round(input.targetSlaDurationMs * 0.8),
            status: "ACTIVE",
          },
        });
      }

      return { ...def, activeVersion: ver };
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "PROCESS_DEFINITION_CREATED",
      targetType: "BUSINESS_PROCESS",
      targetId: definition.id,
      metadata: { slug: definition.slug, version: 1, contentHash },
    });

    return definition;
  }

  /**
   * Create a new immutable version for an existing process definition
   */
  async createProcessVersion(
    workspaceId: string,
    processDefinitionId: string,
    userId: string,
    input: {
      milestones: ProcessMilestone[];
      correlationRules?: ProcessCorrelationRule[];
      outcomeMappings?: ProcessOutcomeMapping[];
      targetSlaDurationMs?: number;
    }
  ) {
    const definition = await prisma.businessProcessDefinition.findFirst({
      where: { id: processDefinitionId, workspaceId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (!definition) {
      throw new Error("Business process definition not found.");
    }

    this.validateMilestones(input.milestones);

    // Verify workflows
    const workflowIds = [...new Set(input.milestones.map((m) => m.workflowId))];
    const foundWorkflows = await prisma.workflow.findMany({
      where: {
        id: { in: workflowIds },
        workspaceId,
      },
      select: { id: true },
    });

    if (foundWorkflows.length !== workflowIds.length) {
      throw new Error("One or more referenced workflows do not exist in this workspace.");
    }

    const latestVersion = definition.versions[0]?.versionNumber || 0;
    const newVersionNumber = latestVersion + 1;

    const contentHash = computeProcessContentHash({
      milestones: input.milestones,
      correlationRules: input.correlationRules || [],
      outcomeMappings: input.outcomeMappings || [],
      targetSlaDurationMs: input.targetSlaDurationMs,
    });

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.businessProcessVersion.create({
        data: {
          processDefinitionId,
          versionNumber: newVersionNumber,
          contentHash,
          milestones: (input.milestones as any) || [],
          correlationRules: (input.correlationRules as any) || [],
          outcomeMappings: (input.outcomeMappings as any) || [],
          targetSlaDurationMs: input.targetSlaDurationMs,
          createdById: userId,
        },
      });

      const updatedDef = await tx.businessProcessDefinition.update({
        where: { id: processDefinitionId },
        data: {
          activeVersionNumber: newVersionNumber,
          contentHash,
          updatedAt: new Date(),
        },
      });

      return { definition: updatedDef, version };
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "PROCESS_VERSION_CREATED",
      targetType: "BUSINESS_PROCESS",
      targetId: processDefinitionId,
      metadata: { versionNumber: newVersionNumber, contentHash },
    });

    return result;
  }

  /**
   * Retrieves process definition by ID or slug with active version and SLA policy
   */
  async getProcessDefinition(workspaceId: string, idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const definition = await prisma.businessProcessDefinition.findFirst({
      where: {
        workspaceId,
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
        },
        slaPolicies: {
          where: { status: "ACTIVE" },
        },
        _count: {
          select: {
            instances: true,
            versions: true,
          },
        },
      },
    });

    if (!definition) {
      throw new Error("Business process definition not found.");
    }

    const activeVersion =
      definition.versions.find((v) => v.versionNumber === definition.activeVersionNumber) ||
      definition.versions[0];

    return {
      ...definition,
      activeVersion,
    };
  }

  /**
   * Lists process definitions in a workspace with optional filters
   */
  async listProcessDefinitions(
    workspaceId: string,
    filter?: {
      businessDomain?: string;
      criticality?: string;
      lifecycleStatus?: string;
    }
  ) {
    const definitions = await prisma.businessProcessDefinition.findMany({
      where: {
        workspaceId,
        ...(filter?.businessDomain ? { businessDomain: filter.businessDomain } : {}),
        ...(filter?.criticality ? { criticality: filter.criticality } : {}),
        ...(filter?.lifecycleStatus ? { lifecycleStatus: filter.lifecycleStatus } : {}),
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
        slaPolicies: {
          where: { status: "ACTIVE" },
          take: 1,
        },
        _count: {
          select: {
            instances: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return definitions.map((def) => ({
      ...def,
      activeVersion: def.versions[0] || null,
      slaPolicy: def.slaPolicies[0] || null,
      instanceCount: def._count.instances,
    }));
  }

  /**
   * Updates definition metadata, lifecycle status, contacts
   */
  async updateProcessDefinition(
    workspaceId: string,
    id: string,
    userId: string,
    input: UpdateProcessDefinitionInput
  ) {
    const existing = await prisma.businessProcessDefinition.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new Error("Business process definition not found.");
    }

    const updated = await prisma.businessProcessDefinition.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.businessDomain ? { businessDomain: input.businessDomain } : {}),
        ...(input.criticality ? { criticality: input.criticality } : {}),
        ...(input.lifecycleStatus ? { lifecycleStatus: input.lifecycleStatus } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.owningTeamId !== undefined ? { owningTeamId: input.owningTeamId } : {}),
        ...(input.escalationContact !== undefined ? { escalationContact: input.escalationContact } : {}),
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "PROCESS_DEFINITION_UPDATED",
      targetType: "BUSINESS_PROCESS",
      targetId: id,
      metadata: input,
    });

    return updated;
  }

  /**
   * Computes structural differences between two versions of a process definition
   */
  async diffVersions(workspaceId: string, processDefinitionId: string, v1: number, v2: number) {
    const def = await prisma.businessProcessDefinition.findFirst({
      where: { id: processDefinitionId, workspaceId },
    });

    if (!def) {
      throw new Error("Business process definition not found.");
    }

    const versions = await prisma.businessProcessVersion.findMany({
      where: {
        processDefinitionId,
        versionNumber: { in: [v1, v2] },
      },
    });

    const ver1 = versions.find((v) => v.versionNumber === v1);
    const ver2 = versions.find((v) => v.versionNumber === v2);

    if (!ver1 || !ver2) {
      throw new Error("One or both specified versions do not exist.");
    }

    const m1 = (ver1.milestones as unknown as ProcessMilestone[]) || [];
    const m2 = (ver2.milestones as unknown as ProcessMilestone[]) || [];

    const m1Map = new Map(m1.map((m) => [m.id, m]));
    const m2Map = new Map(m2.map((m) => [m.id, m]));

    const addedMilestones = m2.filter((m) => !m1Map.has(m.id));
    const removedMilestones = m1.filter((m) => !m2Map.has(m.id));
    const modifiedMilestones = m2
      .filter((m) => {
        const prev = m1Map.get(m.id);
        return prev && JSON.stringify(prev) !== JSON.stringify(m);
      })
      .map((m) => ({
        milestoneId: m.id,
        before: m1Map.get(m.id),
        after: m,
      }));

    return {
      processDefinitionId,
      version1: v1,
      version2: v2,
      hash1: ver1.contentHash,
      hash2: ver2.contentHash,
      hasChanged: ver1.contentHash !== ver2.contentHash,
      milestones: {
        added: addedMilestones,
        removed: removedMilestones,
        modified: modifiedMilestones,
      },
      slaChanged: ver1.targetSlaDurationMs !== ver2.targetSlaDurationMs,
      targetSlaDurationMs: {
        before: ver1.targetSlaDurationMs,
        after: ver2.targetSlaDurationMs,
      },
    };
  }
}

export const processDefinitionService = new ProcessDefinitionService();
