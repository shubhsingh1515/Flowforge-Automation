import { prisma, WorkflowStatus } from "@flowforge/database";
import { validateWorkflowGraph } from "@flowforge/shared";
import { templateService } from "./templates.js";

export const EXPORT_SCHEMA_VERSION = "flowforge/v1";

export interface WorkflowExportPayload {
  $schema: string;
  schemaVersion: string;
  exportedAt: string;
  workflow: {
    name: string;
    description: string | null;
    triggerType: string | null;
    nodes: any[];
    edges: any[];
    viewport?: any;
  };
}

export class WorkflowVersioningService {
  /**
   * Export workflow into portable, sanitized, versioned JSON definition.
   */
  async exportWorkflow(workflowId: string, workspaceId: string): Promise<WorkflowExportPayload> {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow || workflow.versions.length === 0) {
      throw new Error("Workflow not found or has no version snapshot.");
    }

    const latest = workflow.versions[0];
    const rawNodes = (latest.nodes as any[]) || [];
    const rawEdges = (latest.edges as any[]) || [];

    // Strict sanitization: remove all credentials, connection IDs, live webhook secrets, private tokens
    const sanitizedNodes = rawNodes.map((node) => {
      const nodeCopy = { ...node, data: { ...node.data } };
      delete nodeCopy.data.connectionId;
      delete nodeCopy.data.webhookSlug;
      delete nodeCopy.data.webhookSecret;
      if (nodeCopy.data.config) {
        const configCopy = { ...nodeCopy.data.config };
        delete configCopy.apiKey;
        delete configCopy.secret;
        delete configCopy.password;
        delete configCopy.accessToken;
        delete configCopy.refreshToken;
        nodeCopy.data.config = configCopy;
      }
      return nodeCopy;
    });

    return {
      $schema: "https://flowforge.io/schemas/workflow-export-v1.json",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      workflow: {
        name: workflow.name,
        description: workflow.description,
        triggerType: workflow.triggerType,
        nodes: sanitizedNodes,
        edges: rawEdges,
        viewport: latest.viewport,
      },
    };
  }

  /**
   * Import workflow from validated portable JSON definition.
   */
  async importWorkflow(
    workspaceId: string,
    userId: string,
    payload: any,
    overrideName?: string
  ) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload: expected JSON object.");
    }

    if (payload.schemaVersion !== EXPORT_SCHEMA_VERSION) {
      throw new Error(`Unsupported schemaVersion '${payload.schemaVersion}'. Supported version is '${EXPORT_SCHEMA_VERSION}'.`);
    }

    const workflowData = payload.workflow;
    if (!workflowData || typeof workflowData !== "object") {
      throw new Error("Invalid import: missing 'workflow' object.");
    }

    const name = overrideName || workflowData.name;
    if (!name || typeof name !== "string") {
      throw new Error("Workflow name is required in import payload.");
    }

    const rawNodes = Array.isArray(workflowData.nodes) ? workflowData.nodes : [];
    const rawEdges = Array.isArray(workflowData.edges) ? workflowData.edges : [];

    // Remap all node and edge IDs to fresh unique IDs to prevent collisions
    const { nodes: remappedNodes, edges: remappedEdges } = templateService.remapGraph(rawNodes, rawEdges);

    // Validate graph structure
    const validation = validateWorkflowGraph(remappedNodes as any, remappedEdges as any);
    if (!validation.isValid && validation.errors.length > 0) {
      throw new Error(`Import validation failed: ${validation.errors[0].message}`);
    }

    // Determine triggerType
    const triggerNode = remappedNodes.find((n) => n.data?.nodeType === "TRIGGER");
    const triggerType = triggerNode?.data?.label || workflowData.triggerType || "Manual";

    // Mark missing connections
    const existingConnections = await prisma.connectedAccount.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { integrationKey: true, id: true },
    });
    const connectionMap = new Map<string, string>();
    for (const c of existingConnections) {
      if (!connectionMap.has(c.integrationKey)) connectionMap.set(c.integrationKey, c.id);
    }

    const preparedNodes = remappedNodes.map((n) => {
      const key = n.data?.integrationKey;
      if (key && !["webhook", "schedule", "http-request", "approval"].includes(key)) {
        const found = connectionMap.get(key);
        if (found) {
          n.data.connectionId = found;
          n.data.needsConnection = false;
        } else {
          n.data.needsConnection = true;
        }
      }
      return n;
    });

    const created = await prisma.workflow.create({
      data: {
        workspaceId,
        name: `[Imported] ${name}`,
        description: workflowData.description || null,
        status: WorkflowStatus.DRAFT,
        triggerType,
        versions: {
          create: {
            version: 1,
            changeSummary: "Initial version imported from file",
            createdById: userId,
            nodes: preparedNodes,
            edges: remappedEdges,
            viewport: workflowData.viewport || { x: 100, y: 100, zoom: 0.9 },
            isValid: validation.isValid,
          },
        },
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    await prisma.workspaceOnboarding.upsert({
      where: { workspaceId },
      update: { hasCreatedWorkflow: true },
      create: { workspaceId, hasCreatedWorkflow: true },
    });

    return {
      workflow: created,
      summary: {
        name: created.name,
        nodeCount: preparedNodes.length,
        edgeCount: remappedEdges.length,
        requiredIntegrations: Array.from(new Set(preparedNodes.map((n) => n.data?.integrationKey).filter(Boolean))),
      },
    };
  }

  /**
   * List all immutable version history snapshots for a workflow.
   */
  async listVersions(workflowId: string, workspaceId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            changeSummary: true,
            createdById: true,
            isValid: true,
            createdAt: true,
            nodes: true,
          },
        },
      },
    });

    if (!workflow) {
      throw new Error("Workflow not found or access denied.");
    }

    return {
      workflowId,
      currentVersion: workflow.versions[0]?.version || 1,
      versions: workflow.versions.map((v) => ({
        id: v.id,
        version: v.version,
        changeSummary: v.changeSummary || `Version ${v.version}`,
        createdById: v.createdById,
        isValid: v.isValid,
        nodeCount: Array.isArray(v.nodes) ? v.nodes.length : 0,
        createdAt: v.createdAt,
      })),
    };
  }

  /**
   * Get specific version snapshot.
   */
  async getVersion(workflowId: string, versionNumber: number, workspaceId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
    });

    if (!workflow) {
      throw new Error("Workflow not found or access denied.");
    }

    const versionSnapshot = await prisma.workflowVersion.findUnique({
      where: {
        workflowId_version: {
          workflowId,
          version: versionNumber,
        },
      },
    });

    if (!versionSnapshot) {
      throw new Error(`Version ${versionNumber} not found for workflow.`);
    }

    return versionSnapshot;
  }

  /**
   * Compare two versions and produce structural diff.
   */
  async compareVersions(workflowId: string, fromVerNum: number, toVerNum: number, workspaceId: string) {
    const [fromVer, toVer] = await Promise.all([
      this.getVersion(workflowId, fromVerNum, workspaceId),
      this.getVersion(workflowId, toVerNum, workspaceId),
    ]);

    const fromNodes = (fromVer.nodes as any[]) || [];
    const toNodes = (toVer.nodes as any[]) || [];
    const fromEdges = (fromVer.edges as any[]) || [];
    const toEdges = (toVer.edges as any[]) || [];

    const fromNodeLabels = new Map(fromNodes.map((n) => [n.data?.label || n.id, n]));
    const toNodeLabels = new Map(toNodes.map((n) => [n.data?.label || n.id, n]));

    const addedNodes = toNodes.filter((n) => !fromNodeLabels.has(n.data?.label || n.id));
    const removedNodes = fromNodes.filter((n) => !toNodeLabels.has(n.data?.label || n.id));
    const modifiedNodes = toNodes.filter((n) => {
      const existing = fromNodeLabels.get(n.data?.label || n.id);
      if (!existing) return false;
      return JSON.stringify(existing.data?.config) !== JSON.stringify(n.data?.config);
    });

    return {
      workflowId,
      fromVersion: fromVerNum,
      toVersion: toVerNum,
      diff: {
        addedNodeCount: addedNodes.length,
        removedNodeCount: removedNodes.length,
        modifiedNodeCount: modifiedNodes.length,
        addedNodes: addedNodes.map((n) => ({ id: n.id, label: n.data?.label, type: n.data?.nodeType })),
        removedNodes: removedNodes.map((n) => ({ id: n.id, label: n.data?.label, type: n.data?.nodeType })),
        modifiedNodes: modifiedNodes.map((n) => ({ id: n.id, label: n.data?.label, type: n.data?.nodeType })),
        edgeCountDelta: toEdges.length - fromEdges.length,
      },
    };
  }

  /**
   * Safe rollback: restores a previous version snapshot as a NEW sequential version.
   * Preserves historical version logs, approval records, and execution history.
   */
  async rollbackToVersion(workflowId: string, targetVersionNum: number, workspaceId: string, userId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow || workflow.versions.length === 0) {
      throw new Error("Workflow not found or access denied.");
    }

    const targetVersion = await prisma.workflowVersion.findUnique({
      where: {
        workflowId_version: {
          workflowId,
          version: targetVersionNum,
        },
      },
    });

    if (!targetVersion) {
      throw new Error(`Target rollback version ${targetVersionNum} does not exist.`);
    }

    const currentLatestVerNum = workflow.versions[0].version;
    const newVersionNum = currentLatestVerNum + 1;

    // Create new version snapshot containing the historical definition
    const restoredVersion = await prisma.workflowVersion.create({
      data: {
        workflowId,
        version: newVersionNum,
        changeSummary: `Rollback to Version ${targetVersionNum}`,
        createdById: userId,
        nodes: targetVersion.nodes as any,
        edges: targetVersion.edges as any,
        viewport: targetVersion.viewport as any,
        isValid: targetVersion.isValid,
      },
    });

    // Revert status to DRAFT so user can verify before reactivating
    const updatedWorkflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: WorkflowStatus.DRAFT,
      },
    });

    return {
      success: true,
      workflow: updatedWorkflow,
      restoredVersion: {
        version: restoredVersion.version,
        changeSummary: restoredVersion.changeSummary,
        rolledBackFromVersion: targetVersionNum,
        createdAt: restoredVersion.createdAt,
      },
    };
  }
}

export const workflowVersioningService = new WorkflowVersioningService();
