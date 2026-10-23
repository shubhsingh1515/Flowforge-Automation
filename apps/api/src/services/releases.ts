import crypto from "node:crypto";
import { prisma } from "@flowforge/database";
import { CreateReleaseArtifactInput } from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export const RELEASE_FORMAT_VERSION = "flowforge.release/v1";

export class ReleaseService {
  /**
   * Deterministically orders object keys for canonical JSON serialization.
   */
  canonicalize(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.canonicalize(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = this.canonicalize(obj[key]);
    }
    return result;
  }

  /**
   * Computes deterministic SHA-256 hex content hash.
   */
  calculateContentHash(definition: any): string {
    const canonical = this.canonicalize(definition);
    const jsonString = JSON.stringify(canonical);
    return crypto.createHash("sha256").update(jsonString, "utf8").digest("hex");
  }

  /**
   * Strips all secrets, live tokens, passwords, and webhook secrets from definition.
   */
  sanitizeDefinition(nodes: any[], edges: any[], triggerType: string | null) {
    const sanitizedNodes = nodes.map((node) => {
      const copy = { ...node, data: { ...node.data } };
      delete copy.data.connectionId;
      delete copy.data.webhookSlug;
      delete copy.data.webhookSecret;

      if (copy.data.config) {
        const configCopy = { ...copy.data.config };
        delete configCopy.apiKey;
        delete configCopy.secret;
        delete configCopy.password;
        delete configCopy.accessToken;
        delete configCopy.refreshToken;
        delete configCopy.signingSecret;
        delete configCopy.clientSecret;
        copy.data.config = configCopy;
      }
      return copy;
    });

    return {
      nodes: sanitizedNodes,
      edges,
      triggerType,
    };
  }

  /**
   * Scans workflow node configs and expressions to extract required environment variable keys.
   */
  extractRequiredVariables(nodes: any[]): string[] {
    const vars = new Set<string>();
    const envRegex = /\{\{\s*env\.([A-Z0-9_]+)\s*\}\}/g;

    for (const node of nodes) {
      if (node.data?.config) {
        const str = JSON.stringify(node.data.config);
        let match;
        while ((match = envRegex.exec(str)) !== null) {
          vars.add(match[1]);
        }
      }
    }

    return Array.from(vars).sort();
  }

  /**
   * Scans workflow nodes to extract required third-party integration keys.
   */
  extractRequiredIntegrations(nodes: any[]): string[] {
    const integrations = new Set<string>();
    for (const node of nodes) {
      if (node.data?.integrationKey) {
        integrations.add(node.data.integrationKey);
      }
    }
    return Array.from(integrations).sort();
  }

  /**
   * Create an immutable release artifact for a workflow.
   */
  async createReleaseArtifact(
    workspaceId: string,
    userId: string,
    input: CreateReleaseArtifactInput
  ) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId },
      include: {
        versions: {
          where: input.workflowVersionId ? { id: input.workflowVersionId } : undefined,
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow) {
      throw new Error("Workflow not found.");
    }

    let versionSnapshot = workflow.versions[0];
    if (!versionSnapshot) {
      versionSnapshot = await prisma.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          changeSummary: "Initial release baseline",
          nodes: [],
          edges: [],
          isValid: true,
          createdById: userId,
        },
      });
    }
    const rawNodes = (versionSnapshot.nodes as any[]) || [];
    const rawEdges = (versionSnapshot.edges as any[]) || [];

    // 1. Sanitize workflow topology (no secrets)
    const sanitized = this.sanitizeDefinition(rawNodes, rawEdges, workflow.triggerType);

    // 2. Extract dependencies
    const requiredVariables = this.extractRequiredVariables(rawNodes);
    const requiredIntegrations = this.extractRequiredIntegrations(rawNodes);

    // 3. Assemble complete canonical artifact payload
    const artifactDefinition = {
      formatVersion: RELEASE_FORMAT_VERSION,
      workflowName: workflow.name,
      description: workflow.description,
      triggerType: workflow.triggerType,
      versionNumber: versionSnapshot.version,
      requiredVariables,
      requiredIntegrations,
      nodes: sanitized.nodes,
      edges: sanitized.edges,
    };

    // 4. Calculate content hash
    const contentHash = this.calculateContentHash(artifactDefinition);

    // 5. Determine next release number
    const lastRelease = await prisma.workflowReleaseArtifact.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { releaseNumber: "desc" },
      select: { releaseNumber: true },
    });
    const releaseNumber = (lastRelease?.releaseNumber || 0) + 1;

    // 6. Create immutable release artifact
    const artifact = await prisma.workflowReleaseArtifact.create({
      data: {
        workspaceId,
        workflowId: workflow.id,
        workflowVersionId: versionSnapshot.id,
        versionNumber: versionSnapshot.version,
        releaseNumber,
        formatVersion: RELEASE_FORMAT_VERSION,
        contentHash,
        canonicalDefinition: artifactDefinition as any,
        summary: input.summary || `Release v${releaseNumber} (Workflow Version ${versionSnapshot.version})`,
        createdById: userId,
        status: "READY",
      },
      include: {
        workflow: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "RELEASE_ARTIFACT_CREATED",
      targetType: "RELEASE_ARTIFACT",
      targetId: artifact.id,
      metadata: {
        workflowId: workflow.id,
        releaseNumber,
        contentHash,
        versionNumber: versionSnapshot.version,
      },
    });

    return artifact;
  }

  /**
   * List all release artifacts for a workflow.
   */
  async listReleaseArtifacts(workspaceId: string, workflowId: string) {
    return prisma.workflowReleaseArtifact.findMany({
      where: { workspaceId, workflowId },
      orderBy: { releaseNumber: "desc" },
      select: {
        id: true,
        workflowId: true,
        workflowVersionId: true,
        versionNumber: true,
        releaseNumber: true,
        formatVersion: true,
        contentHash: true,
        summary: true,
        status: true,
        createdById: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get single release artifact with definition.
   */
  async getReleaseArtifact(workspaceId: string, releaseArtifactId: string) {
    const artifact = await prisma.workflowReleaseArtifact.findFirst({
      where: { id: releaseArtifactId, workspaceId },
      include: {
        workflow: {
          select: { id: true, name: true },
        },
        deployments: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            environment: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!artifact) {
      throw new Error("Release artifact not found.");
    }

    // Verify integrity
    const computedHash = this.calculateContentHash(artifact.canonicalDefinition);
    const isTampered = computedHash !== artifact.contentHash;

    return {
      ...artifact,
      isIntegrityVerified: !isTampered,
    };
  }
}

export const releaseService = new ReleaseService();
