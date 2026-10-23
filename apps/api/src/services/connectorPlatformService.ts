import { prisma } from "@flowforge/database";
import {
  ConnectorManifestSchema,
  ConnectorManifestDTO,
  UpgradePreflightResult,
  canonicalJson,
} from "@flowforge/shared";
import { createHash } from "crypto";
import { connectorCertificationService } from "./connectorCertificationService.js";

export function computeArtifactHashSha256(manifest: unknown): string {
  const canonical = canonicalJson(manifest);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export class ConnectorPlatformService {
  /**
   * Validates a raw connector manifest against the schema specification.
   */
  validateManifest(manifestInput: unknown) {
    const parseResult = ConnectorManifestSchema.safeParse(manifestInput);
    if (!parseResult.success) {
      return {
        valid: false,
        errors: parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      };
    }
    return {
      valid: true,
      manifest: parseResult.data,
      hash: computeArtifactHashSha256(parseResult.data),
    };
  }

  /**
   * Registers or updates a draft connector release artifact in a workspace.
   */
  async createDraft(workspaceId: string, authorId: string, manifestInput: unknown) {
    const validation = this.validateManifest(manifestInput);
    if (!validation.valid || !validation.manifest) {
      const err: any = new Error(`Invalid connector manifest: ${validation.errors?.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    const manifest = validation.manifest;
    const connectorKey = manifest.id;
    const version = manifest.version;
    const artifactHashSha256 = validation.hash!;

    // Check if release already exists
    const existing = await prisma.connectorReleaseArtifact.findUnique({
      where: {
        connectorKey_version: {
          connectorKey,
          version,
        },
      },
    });

    if (existing) {
      if (existing.status === "PUBLISHED" || existing.status === "CERTIFIED") {
        const err: any = new Error(
          `Connector release ${connectorKey}@${version} already exists and is immutable.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Update existing draft
      return prisma.connectorReleaseArtifact.update({
        where: { id: existing.id },
        data: {
          manifest: manifest as any,
          artifactHashSha256,
          status: "DRAFT",
          certificationStatus: "PENDING",
          rejectionReason: null,
          publisherWorkspaceId: workspaceId,
        },
      });
    }

    // Create draft release artifact
    const artifact = await prisma.connectorReleaseArtifact.create({
      data: {
        connectorKey,
        version,
        manifest: manifest as any,
        artifactHashSha256,
        status: "DRAFT",
        certificationStatus: "PENDING",
        publisherWorkspaceId: workspaceId,
      },
    });

    return artifact;
  }

  /**
   * Submits a release artifact to the automated certification pipeline.
   */
  async submitForCertification(artifactId: string, workspaceId: string) {
    const artifact = await prisma.connectorReleaseArtifact.findFirst({
      where: { id: artifactId, publisherWorkspaceId: workspaceId },
    });

    if (!artifact) {
      const err: any = new Error(`Connector release artifact '${artifactId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    // Set status to certifying
    await prisma.connectorReleaseArtifact.update({
      where: { id: artifactId },
      data: { status: "CERTIFYING" },
    });

    // Run certification pipeline
    const certificationRecord = await connectorCertificationService.runAutomatedCertification(artifactId);
    return certificationRecord;
  }

  /**
   * Submits human reviewer decision for a certified/in-review artifact.
   */
  async reviewCertification(
    artifactId: string,
    reviewerId: string,
    decision: "APPROVE" | "REJECT",
    reviewNotes?: string
  ) {
    const artifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: artifactId },
      include: { certifications: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!artifact) {
      const err: any = new Error(`Connector release artifact '${artifactId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const overallResult = decision === "APPROVE" ? "PASSED" : "FAILED";
    const status = decision === "APPROVE" ? "CERTIFIED" : "DRAFT";

    await prisma.connectorReleaseArtifact.update({
      where: { id: artifactId },
      data: {
        certificationStatus: overallResult,
        status,
        rejectionReason: decision === "REJECT" ? reviewNotes || "Rejected during security review." : null,
      },
    });

    const latestRecord = artifact.certifications[0];
    if (latestRecord) {
      await prisma.connectorCertificationRecord.update({
        where: { id: latestRecord.id },
        data: {
          overallResult,
          reviewedByUserId: reviewerId,
          reviewNotes: reviewNotes || (decision === "APPROVE" ? "Approved by reviewer." : "Rejected by reviewer."),
          reviewedAt: new Date(),
        },
      });
    }

    return { success: true, artifactId, decision, status };
  }

  /**
   * Publishes a certified connector release artifact to the marketplace.
   * Cryptographically verifies artifact provenance hash before publishing.
   */
  async publishRelease(artifactId: string, publisherId: string, expectedHash?: string) {
    const artifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact) {
      const err: any = new Error(`Connector release artifact '${artifactId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (artifact.certificationStatus !== "PASSED" && artifact.status !== "CERTIFIED") {
      const err: any = new Error(
        `Artifact must be CERTIFIED with PASSED certification before publishing. Current status: ${artifact.status}`
      );
      err.statusCode = 400;
      throw err;
    }

    // Verify SHA-256 immutability
    const actualHash = artifact.artifactHashSha256;
    if (expectedHash && expectedHash.toLowerCase() !== actualHash.toLowerCase()) {
      const err: any = new Error(
        `ARTIFACT_HASH_MISMATCH: Provided hash ${expectedHash} does not match certified artifact hash ${actualHash}`
      );
      err.statusCode = 422;
      err.code = "ARTIFACT_HASH_MISMATCH";
      throw err;
    }

    // Recompute to guarantee zero tampering
    const recomputed = computeArtifactHashSha256(artifact.manifest);
    if (recomputed.toLowerCase() !== actualHash.toLowerCase()) {
      const err: any = new Error(
        `ARTIFACT_TAMPERED: Recomputed hash ${recomputed} does not match certified hash ${actualHash}`
      );
      err.statusCode = 422;
      err.code = "ARTIFACT_TAMPERED";
      throw err;
    }

    const updated = await prisma.connectorReleaseArtifact.update({
      where: { id: artifactId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedByUserId: publisherId,
      },
    });

    // Sync or create MarketplaceListing
    const manifest = artifact.manifest as any as ConnectorManifestDTO;
    const existingListing = await prisma.marketplaceListing.findUnique({
      where: { slug: artifact.connectorKey },
    });

    if (existingListing) {
      await prisma.marketplaceListing.update({
        where: { id: existingListing.id },
        data: {
          currentVersion: existingListing.currentVersion + 1,
          reviewStatus: "PUBLISHED",
          title: manifest.name,
          description: manifest.description,
        },
      });
    } else {
      await prisma.marketplaceListing.create({
        data: {
          title: manifest.name,
          slug: artifact.connectorKey,
          description: manifest.description,
          category: manifest.category || "Custom APIs",
          publisherWorkspaceId: artifact.publisherWorkspaceId,
          reviewStatus: "PUBLISHED",
          visibility: "PUBLIC",
        },
      });
    }

    return updated;
  }

  /**
   * Suspends or revokes a connector release artifact for security or maintenance.
   */
  async suspendConnector(artifactId: string, reason: string, isPermanentRevocation = false) {
    const artifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact) {
      const err: any = new Error(`Connector release artifact '${artifactId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const nextStatus = isPermanentRevocation ? "REVOKED" : "SUSPENDED";
    const updated = await prisma.connectorReleaseArtifact.update({
      where: { id: artifactId },
      data: {
        status: nextStatus,
        suspensionReason: reason,
      },
    });

    return updated;
  }

  /**
   * Computes preflight upgrade compatibility diff between two connector release artifacts.
   */
  async upgradePreflight(
    workspaceId: string,
    currentArtifactId: string,
    targetArtifactId: string
  ): Promise<UpgradePreflightResult> {
    const [current, target] = await Promise.all([
      prisma.connectorReleaseArtifact.findUnique({ where: { id: currentArtifactId } }),
      prisma.connectorReleaseArtifact.findUnique({ where: { id: targetArtifactId } }),
    ]);

    if (!current || !target) {
      const err: any = new Error("One or both connector release artifacts could not be found.");
      err.statusCode = 404;
      throw err;
    }

    const currentM = current.manifest as any as ConnectorManifestDTO;
    const targetM = target.manifest as any as ConnectorManifestDTO;

    const breakingChanges: string[] = [];
    const warnings: string[] = [];

    // 1. Actions diff
    const currentActionMap = new Map((currentM.actions || []).map((a) => [a.id, a]));
    const targetActionMap = new Map((targetM.actions || []).map((a) => [a.id, a]));

    const actionsAdded: string[] = [];
    const actionsRemoved: string[] = [];
    const actionsModified: { actionId: string; changes: string[] }[] = [];

    for (const [id, a] of targetActionMap) {
      if (!currentActionMap.has(id)) {
        actionsAdded.push(id);
      } else {
        const oldA = currentActionMap.get(id)!;
        const changes: string[] = [];
        // Check new required inputs
        const oldInputs = (oldA.inputSchema as any) || {};
        const newInputs = (a.inputSchema as any) || {};
        for (const [paramKey, paramDef] of Object.entries(newInputs)) {
          if ((paramDef as any)?.required && !(oldInputs as any)[paramKey]?.required) {
            changes.push(`New required input field '${paramKey}'`);
            breakingChanges.push(`Action '${id}' added a new required parameter '${paramKey}'`);
          }
        }
        if (changes.length > 0) {
          actionsModified.push({ actionId: id, changes });
        }
      }
    }

    for (const [id] of currentActionMap) {
      if (!targetActionMap.has(id)) {
        actionsRemoved.push(id);
        breakingChanges.push(`Action '${id}' was removed in target version.`);
      }
    }

    // 2. Triggers diff
    const currentTriggerMap = new Map((currentM.triggers || []).map((t) => [t.id, t]));
    const targetTriggerMap = new Map((targetM.triggers || []).map((t) => [t.id, t]));

    const triggersAdded: string[] = [];
    const triggersRemoved: string[] = [];
    const triggersModified: { triggerId: string; changes: string[] }[] = [];

    for (const [id] of targetTriggerMap) {
      if (!currentTriggerMap.has(id)) {
        triggersAdded.push(id);
      }
    }
    for (const [id] of currentTriggerMap) {
      if (!targetTriggerMap.has(id)) {
        triggersRemoved.push(id);
        breakingChanges.push(`Trigger '${id}' was removed in target version.`);
      }
    }

    // 3. Permissions diff
    const currentPerms = new Set(currentM.permissions || []);
    const targetPerms = new Set(targetM.permissions || []);
    const permsAdded: string[] = [];
    const permsRemoved: string[] = [];

    for (const p of targetPerms) {
      if (!currentPerms.has(p)) {
        permsAdded.push(p);
        warnings.push(`Target version requests new permission: '${p}'`);
      }
    }
    for (const p of currentPerms) {
      if (!targetPerms.has(p)) {
        permsRemoved.push(p);
      }
    }

    const isBreaking = breakingChanges.length > 0;

    return {
      isCompatible: true,
      isBreaking,
      installedVersion: current.version,
      targetVersion: target.version,
      breakingChanges,
      warnings,
      actionsDiff: {
        added: actionsAdded,
        removed: actionsRemoved,
        modified: actionsModified,
      },
      triggersDiff: {
        added: triggersAdded,
        removed: triggersRemoved,
        modified: triggersModified,
      },
      permissionsDiff: {
        added: permsAdded,
        removed: permsRemoved,
      },
    };
  }

  /**
   * Governed installation of a published connector artifact into a workspace.
   */
  async installConnector(workspaceId: string, artifactId: string, installedById: string) {
    const artifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact) {
      const err: any = new Error(`Connector release artifact '${artifactId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    if (artifact.status !== "PUBLISHED") {
      const err: any = new Error(
        `Only PUBLISHED connectors can be installed. Current status: ${artifact.status}`
      );
      err.statusCode = 400;
      throw err;
    }

    // Find or create marketplace listing to attach installation
    let listing = await prisma.marketplaceListing.findUnique({
      where: { slug: artifact.connectorKey },
    });

    if (!listing) {
      listing = await prisma.marketplaceListing.create({
        data: {
          title: (artifact.manifest as any).name || artifact.connectorKey,
          slug: artifact.connectorKey,
          description: (artifact.manifest as any).description || "Custom connector",
          publisherWorkspaceId: artifact.publisherWorkspaceId,
          reviewStatus: "PUBLISHED",
          visibility: "PUBLIC",
        },
      });
    }

    const installation = await prisma.marketplaceInstallation.upsert({
      where: {
        workspaceId_listingId: {
          workspaceId,
          listingId: listing.id,
        },
      },
      create: {
        workspaceId,
        listingId: listing.id,
        installedVersion: 1,
        installedArtifactId: artifact.id,
        status: "ACTIVE",
        settings: {
          currentArtifactId: artifact.id,
          installedVersionStr: artifact.version,
        },
      },
      update: {
        status: "ACTIVE",
        installedArtifactId: artifact.id,
        settings: {
          currentArtifactId: artifact.id,
          installedVersionStr: artifact.version,
        },
      },
    });

    return { installation, artifact };
  }

  /**
   * Upgrades a connector installation with preflight safety and breaking-change acknowledgment.
   */
  async upgradeConnector(
    workspaceId: string,
    installationId: string,
    targetArtifactId: string,
    acknowledgeBreaking = false
  ) {
    const installation = await prisma.marketplaceInstallation.findUnique({
      where: { id: installationId },
    });

    if (!installation || installation.workspaceId !== workspaceId) {
      const err: any = new Error(`Installation '${installationId}' not found in workspace.`);
      err.statusCode = 404;
      throw err;
    }

    const settings = (installation.settings as any) || {};
    const currentArtifactId = installation.installedArtifactId || settings.currentArtifactId;

    if (currentArtifactId) {
      const preflight = await this.upgradePreflight(workspaceId, currentArtifactId, targetArtifactId);
      if (preflight.isBreaking && !acknowledgeBreaking) {
        const err: any = new Error(
          `UNACKNOWLEDGED_BREAKING_CHANGES: Target upgrade contains breaking changes: ${preflight.breakingChanges.join(", ")}`
        );
        err.statusCode = 400;
        err.code = "UNACKNOWLEDGED_BREAKING_CHANGES";
        err.preflight = preflight;
        throw err;
      }
    }

    const targetArtifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: targetArtifactId },
    });

    if (!targetArtifact || targetArtifact.status !== "PUBLISHED") {
      const err: any = new Error("Target artifact is not published or does not exist.");
      err.statusCode = 400;
      throw err;
    }

    const updated = await prisma.marketplaceInstallation.update({
      where: { id: installationId },
      data: {
        installedArtifactId: targetArtifact.id,
        settings: {
          ...settings,
          previousArtifactId: currentArtifactId || null,
          currentArtifactId: targetArtifact.id,
          installedVersionStr: targetArtifact.version,
          lastUpgradedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true, installation: updated, targetArtifact };
  }

  /**
   * Rolls back an installation to its previous artifact or specified target version.
   */
  async rollbackConnector(
    workspaceId: string,
    installationId: string,
    targetArtifactId?: string,
    reason?: string
  ) {
    const installation = await prisma.marketplaceInstallation.findUnique({
      where: { id: installationId },
    });

    if (!installation || installation.workspaceId !== workspaceId) {
      const err: any = new Error(`Installation '${installationId}' not found in workspace.`);
      err.statusCode = 404;
      throw err;
    }

    const settings = (installation.settings as any) || {};
    const rollbackTargetId = targetArtifactId || settings.previousArtifactId;

    if (!rollbackTargetId) {
      const err: any = new Error("No previous version available for rollback.");
      err.statusCode = 400;
      throw err;
    }

    const targetArtifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: rollbackTargetId },
    });

    if (!targetArtifact) {
      const err: any = new Error(`Rollback target artifact '${rollbackTargetId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.marketplaceInstallation.update({
      where: { id: installationId },
      data: {
        installedArtifactId: targetArtifact.id,
        settings: {
          ...settings,
          currentArtifactId: targetArtifact.id,
          installedVersionStr: targetArtifact.version,
          rolledBackAt: new Date().toISOString(),
          rollbackReason: reason || "User triggered rollback",
        },
      },
    });

    return { success: true, installation: updated, rolledBackTo: targetArtifact };
  }

  /**
   * Records execution telemetry metrics for a connector invocation.
   */
  async recordExecutionMetric(data: {
    connectorKey: string;
    version: string;
    workspaceId: string;
    actionId: string;
    status: "SUCCESS" | "FAILED";
    durationMs: number;
    errorCategory?: string;
    artifactId?: string;
  }) {
    return prisma.connectorExecutionMetric.create({
      data: {
        connectorKey: data.connectorKey,
        version: data.version,
        workspaceId: data.workspaceId,
        actionId: data.actionId,
        status: data.status,
        durationMs: data.durationMs,
        errorCategory: data.errorCategory || null,
        artifactId: data.artifactId || null,
      },
    });
  }

  /**
   * Queries aggregated operational metrics for developer analytics.
   */
  async getConnectorMetrics(connectorKey: string, workspaceId?: string) {
    const where: any = { connectorKey };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const [totalExecutions, failedExecutions, metrics] = await Promise.all([
      prisma.connectorExecutionMetric.count({ where }),
      prisma.connectorExecutionMetric.count({ where: { ...where, status: "FAILED" } }),
      prisma.connectorExecutionMetric.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const successRate =
      totalExecutions > 0 ? ((totalExecutions - failedExecutions) / totalExecutions) * 100 : 100;

    const durations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const p95DurationMs =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1] : 0;

    return {
      connectorKey,
      totalExecutions,
      failedExecutions,
      successRate: Math.round(successRate * 10) / 10,
      p95DurationMs,
      recentMetrics: metrics.slice(0, 20),
    };
  }
}

export const connectorPlatformService = new ConnectorPlatformService();
