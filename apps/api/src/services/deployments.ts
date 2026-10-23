import { prisma } from "@flowforge/database";
import {
  PromoteReleaseInput,
  RollbackDeploymentInput,
  StructuralDiff,
  ValidationResult,
} from "@flowforge/shared";
import { releaseService } from "./releases.js";
import { environmentService } from "./environments.js";
import { auditLogService } from "./auditLog.js";
import { outboundWebhookService } from "./outboundWebhooks.js";
import { governanceService } from "./governance.js";

export class DeploymentService {
  /**
   * Computes structural diff between two release artifacts or between active deployment and new release.
   */
  computeStructuralDiff(currentDef: any, newDef: any): StructuralDiff {
    const currentNodes = (currentDef?.nodes as any[]) || [];
    const newNodes = (newDef?.nodes as any[]) || [];
    const currentEdges = (currentDef?.edges as any[]) || [];
    const newEdges = (newDef?.edges as any[]) || [];

    const currentNodeMap = new Map<string, any>(currentNodes.map((n) => [n.id, n]));
    const newNodeMap = new Map<string, any>(newNodes.map((n) => [n.id, n]));

    const addedNodes: any[] = [];
    const removedNodes: any[] = [];
    const modifiedNodes: any[] = [];

    // Find added & modified nodes
    for (const [id, newNode] of newNodeMap.entries()) {
      const oldNode = currentNodeMap.get(id);
      if (!oldNode) {
        addedNodes.push({
          id: newNode.id,
          name: newNode.data?.label || newNode.id,
          type: newNode.type,
        });
      } else {
        const changes: any[] = [];
        if (oldNode.type !== newNode.type) {
          changes.push({ field: "type", oldValue: oldNode.type, newValue: newNode.type });
        }
        if (oldNode.data?.label !== newNode.data?.label) {
          changes.push({
            field: "label",
            oldValue: oldNode.data?.label,
            newValue: newNode.data?.label,
          });
        }
        // Config comparison
        const oldConfig = JSON.stringify(oldNode.data?.config || {});
        const newConfig = JSON.stringify(newNode.data?.config || {});
        if (oldConfig !== newConfig) {
          changes.push({ field: "config", oldValue: "modified", newValue: "modified" });
        }

        if (changes.length > 0) {
          modifiedNodes.push({
            nodeId: id,
            nodeName: newNode.data?.label || id,
            nodeType: newNode.type,
            changes,
          });
        }
      }
    }

    // Find removed nodes
    for (const [id, oldNode] of currentNodeMap.entries()) {
      if (!newNodeMap.has(id)) {
        removedNodes.push({
          id: oldNode.id,
          name: oldNode.data?.label || oldNode.id,
          type: oldNode.type,
        });
      }
    }

    // Edge diffs
    const currentEdgeKeys = new Set(currentEdges.map((e) => `${e.source}->${e.target}`));
    const newEdgeKeys = new Set(newEdges.map((e) => `${e.source}->${e.target}`));

    const addedEdges = newEdges.filter((e) => !currentEdgeKeys.has(`${e.source}->${e.target}`));
    const removedEdges = currentEdges.filter((e) => !newEdgeKeys.has(`${e.source}->${e.target}`));

    const hasChanges =
      addedNodes.length > 0 ||
      removedNodes.length > 0 ||
      modifiedNodes.length > 0 ||
      addedEdges.length > 0 ||
      removedEdges.length > 0;

    return {
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedEdges,
      removedEdges,
      hasChanges,
    };
  }

  /**
   * Pre-flight validation of release artifact for deployment into target environment.
   */
  async validateReleaseForEnvironment(
    workspaceId: string,
    releaseArtifactId: string,
    environmentId: string
  ): Promise<ValidationResult> {
    const artifact = await prisma.workflowReleaseArtifact.findFirst({
      where: { id: releaseArtifactId, workspaceId },
    });

    if (!artifact) {
      throw new Error("Release artifact not found.");
    }

    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
      include: {
        variables: true,
        bindings: {
          include: {
            connectedAccount: true,
          },
        },
        policy: true,
      },
    });

    if (!env) {
      throw new Error("Target environment not found.");
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Verify artifact integrity (tamper detection)
    const computedHash = releaseService.calculateContentHash(artifact.canonicalDefinition);
    if (computedHash !== artifact.contentHash) {
      errors.push("Release artifact integrity check failed: Content hash mismatch (possible tampering).");
    }

    // 2. Check required environment variables
    const definition = artifact.canonicalDefinition as any;
    const requiredVariables: string[] = definition.requiredVariables || [];
    const presentVariableKeys = new Set(env.variables.map((v) => v.key));
    const missingVariables: string[] = [];

    for (const reqVar of requiredVariables) {
      if (!presentVariableKeys.has(reqVar)) {
        missingVariables.push(reqVar);
        errors.push(`Missing required environment variable '${reqVar}' in target environment '${env.name}'.`);
      }
    }

    // 3. Check required integration credential bindings
    const requiredIntegrations: string[] = definition.requiredIntegrations || [];
    const boundIntegrationKeys = new Set(
      env.bindings
        .filter((b) => b.connectedAccount?.status === "ACTIVE")
        .map((b) => b.integrationKey)
    );
    const missingBindings: string[] = [];

    for (const reqInt of requiredIntegrations) {
      if (!boundIntegrationKeys.has(reqInt)) {
        missingBindings.push(reqInt);
        errors.push(`Missing active credential binding for integration '${reqInt}' in environment '${env.name}'.`);
      }
    }

    // 4. Check test gate requirement
    let testGatePassed = true;
    const requirePassingTests = env.policy?.requirePassingTests ?? env.requirePassingTests;
    if (requirePassingTests) {
      const passingTest = await prisma.workflowTestRun.findFirst({
        where: {
          workspaceId,
          releaseContentHash: artifact.contentHash,
          status: "PASSED",
        },
      });

      if (!passingTest) {
        testGatePassed = false;
        errors.push(`Deployment blocked by policy: Release artifact (${artifact.contentHash.slice(0, 8)}) must pass automated test suite before promotion to ${env.name}.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      requiredVariables,
      missingVariables,
      requiredIntegrations,
      missingBindings,
      testGatePassed,
    };
  }

  /**
   * Promote an immutable release artifact to a destination environment.
   */
  async promoteRelease(
    workspaceId: string,
    userId: string,
    userRole: string,
    input: PromoteReleaseInput
  ) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: input.environmentId, workspaceId },
      include: { policy: true },
    });

    if (!env) {
      throw new Error("Target environment not found.");
    }

    // 1. Role permission check
    const allowedPromoterRoles = env.policy?.allowedPromoterRoles || ["OWNER", "ADMIN", "MEMBER"];
    if (!allowedPromoterRoles.includes(userRole)) {
      throw new Error(`Your role (${userRole}) is not authorized to promote deployments to ${env.name}.`);
    }

    // 2. Optimistic concurrency check
    if (input.expectedCurrentReleaseId && env.activeReleaseArtifactId !== input.expectedCurrentReleaseId) {
      throw new Error("Deployment conflict: The active release in this environment has changed since you initiated this promotion.");
    }

    // 3. Pre-flight validation
    const validation = await this.validateReleaseForEnvironment(
      workspaceId,
      input.releaseArtifactId,
      input.environmentId
    );

    if (!validation.valid) {
      throw new Error(`Deployment pre-flight validation failed: ${validation.errors.join("; ")}`);
    }

    // 3b. Centralized Enterprise Governance Policy validation
    const policyEval = await governanceService.evaluatePolicy(workspaceId, {
      workflowId: input.workflowId,
      action: "PROMOTE",
      targetEnvironmentId: input.environmentId,
    });
    if (!policyEval.compliant) {
      const msgs = policyEval.violations.map((v) => v.message).join("; ");
      throw new Error(`Enterprise Governance Policy violation: ${msgs}`);
    }

    // 4. Compute structural diff against current active release in environment
    let diffSummary: StructuralDiff | null = null;
    let currentArtifact: any = null;
    if (env.activeReleaseArtifactId) {
      currentArtifact = await prisma.workflowReleaseArtifact.findUnique({
        where: { id: env.activeReleaseArtifactId },
      });
      if (currentArtifact) {
        const newArtifact = await prisma.workflowReleaseArtifact.findUnique({
          where: { id: input.releaseArtifactId },
        });
        if (newArtifact) {
          diffSummary = this.computeStructuralDiff(
            currentArtifact.canonicalDefinition,
            newArtifact.canonicalDefinition
          );
        }
      }
    }

    // 5. Check if approval is required
    const requireApproval = env.policy?.requireApproval ?? env.requireApproval;
    const status = requireApproval ? "PENDING_APPROVAL" : "DEPLOYED";

    // 6. Create deployment record
    const deployment = await prisma.workflowDeployment.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        releaseArtifactId: input.releaseArtifactId,
        environmentId: input.environmentId,
        status,
        previousReleaseArtifactId: env.activeReleaseArtifactId,
        diffSummary: diffSummary as any,
        validationResults: validation as any,
        initiatedByUserId: userId,
        deployedAt: requireApproval ? null : new Date(),
        completedAt: requireApproval ? null : new Date(),
      },
      include: {
        environment: { select: { id: true, name: true, type: true } },
        releaseArtifact: { select: { id: true, releaseNumber: true, contentHash: true, versionNumber: true } },
      },
    });

    // 7. If no approval needed, atomically activate release in environment
    if (!requireApproval) {
      await prisma.workflowEnvironment.update({
        where: { id: env.id },
        data: {
          activeReleaseArtifactId: input.releaseArtifactId,
          deployedAt: new Date(),
          deployedByUserId: userId,
        },
      });

      // Mark previous active deployment as SUPERSEDED
      if (env.activeReleaseArtifactId) {
        await prisma.workflowDeployment.updateMany({
          where: {
            environmentId: env.id,
            releaseArtifactId: env.activeReleaseArtifactId,
            status: "DEPLOYED",
            id: { not: deployment.id },
          },
          data: { status: "SUPERSEDED" },
        });
      }
    }

    // 8. Record audit log & dispatch webhook
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: requireApproval ? "DEPLOYMENT_REQUESTED" : "DEPLOYMENT_PROMOTED",
      targetType: "DEPLOYMENT",
      targetId: deployment.id,
      metadata: {
        environmentId: env.id,
        environmentName: env.name,
        releaseArtifactId: input.releaseArtifactId,
        status,
      },
    });

    await outboundWebhookService.emitEvent(workspaceId, "deployment.promoted", {
      deploymentId: deployment.id,
      environment: env.name,
      releaseNumber: deployment.releaseArtifact.releaseNumber,
      status,
      initiatedBy: userId,
    });

    return deployment;
  }

  /**
   * Decide a pending deployment approval (APPROVE or REJECT).
   */
  async decideDeploymentApproval(
    workspaceId: string,
    deploymentId: string,
    userId: string,
    userRole: string,
    decision: "APPROVED" | "REJECTED",
    comment?: string
  ) {
    const deployment = await prisma.workflowDeployment.findFirst({
      where: { id: deploymentId, workspaceId },
      include: {
        environment: { include: { policy: true } },
        releaseArtifact: true,
      },
    });

    if (!deployment) {
      throw new Error("Deployment record not found.");
    }

    if (deployment.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot decide deployment with status '${deployment.status}'.`);
    }

    const env = deployment.environment;

    // 1. Role permission check
    const allowedApproverRoles = env.policy?.allowedApproverRoles || ["OWNER", "ADMIN"];
    if (!allowedApproverRoles.includes(userRole)) {
      throw new Error(`Your role (${userRole}) is not authorized to approve deployments for ${env.name}.`);
    }

    // 2. Prevent self-approval check
    const preventSelfApproval = env.policy?.preventSelfApproval ?? true;
    if (preventSelfApproval && deployment.initiatedByUserId === userId) {
      throw new Error("Policy violation: Initiator cannot approve their own deployment.");
    }

    if (decision === "REJECTED") {
      const rejected = await prisma.workflowDeployment.update({
        where: { id: deploymentId },
        data: {
          status: "CANCELLED",
          approvedByUserId: userId,
          approvedAt: new Date(),
          failureReason: comment || "Deployment rejected by approver",
        },
      });

      await auditLogService.recordEvent({
        workspaceId,
        actorUserId: userId,
        action: "DEPLOYMENT_REJECTED",
        targetType: "DEPLOYMENT",
        targetId: deploymentId,
        metadata: { environmentId: env.id, comment },
      });

      return rejected;
    }

    // Re-verify validation before activating
    const validation = await this.validateReleaseForEnvironment(
      workspaceId,
      deployment.releaseArtifactId,
      env.id
    );

    if (!validation.valid) {
      throw new Error(`Deployment blocked: Pre-flight validation failed at approval time: ${validation.errors.join("; ")}`);
    }

    // Activate release atomically in environment
    const deployed = await prisma.workflowDeployment.update({
      where: { id: deploymentId },
      data: {
        status: "DEPLOYED",
        approvedByUserId: userId,
        approvedAt: new Date(),
        deployedAt: new Date(),
        completedAt: new Date(),
      },
      include: {
        environment: true,
        releaseArtifact: true,
      },
    });

    await prisma.workflowEnvironment.update({
      where: { id: env.id },
      data: {
        activeReleaseArtifactId: deployment.releaseArtifactId,
        deployedAt: new Date(),
        deployedByUserId: userId,
      },
    });

    // Mark previous active deployment as SUPERSEDED
    if (deployment.previousReleaseArtifactId) {
      await prisma.workflowDeployment.updateMany({
        where: {
          environmentId: env.id,
          releaseArtifactId: deployment.previousReleaseArtifactId,
          status: "DEPLOYED",
          id: { not: deployment.id },
        },
        data: { status: "SUPERSEDED" },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "DEPLOYMENT_APPROVED",
      targetType: "DEPLOYMENT",
      targetId: deployment.id,
      metadata: { environmentId: env.id, releaseArtifactId: deployment.releaseArtifactId },
    });

    await outboundWebhookService.emitEvent(workspaceId, "deployment.approved", {
      deploymentId: deployment.id,
      environment: env.name,
      releaseNumber: deployment.releaseArtifact.releaseNumber,
      approvedBy: userId,
    });

    return deployed;
  }

  /**
   * Rollback environment to a previous immutable release artifact.
   */
  async rollbackDeployment(
    workspaceId: string,
    userId: string,
    userRole: string,
    input: RollbackDeploymentInput
  ) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: input.environmentId, workspaceId },
      include: { policy: true },
    });

    if (!env) {
      throw new Error("Target environment not found.");
    }

    const targetArtifact = await prisma.workflowReleaseArtifact.findFirst({
      where: { id: input.targetReleaseArtifactId, workspaceId },
    });

    if (!targetArtifact) {
      throw new Error("Target release artifact for rollback not found.");
    }

    // Pre-flight check on target release
    const validation = await this.validateReleaseForEnvironment(
      workspaceId,
      targetArtifact.id,
      env.id
    );

    if (!validation.valid) {
      throw new Error(`Rollback blocked: Target release fails current environment validation: ${validation.errors.join("; ")}`);
    }

    const previousReleaseId = env.activeReleaseArtifactId;

    // Create rollback deployment record
    const rollbackRecord = await prisma.workflowDeployment.create({
      data: {
        workspaceId,
        workflowId: targetArtifact.workflowId,
        releaseArtifactId: targetArtifact.id,
        environmentId: env.id,
        status: "DEPLOYED",
        previousReleaseArtifactId: previousReleaseId,
        rollbackOfDeploymentId: previousReleaseId,
        validationResults: validation as any,
        initiatedByUserId: userId,
        deployedAt: new Date(),
        completedAt: new Date(),
      },
      include: {
        environment: true,
        releaseArtifact: true,
      },
    });

    // Reactivate prior release artifact in environment
    await prisma.workflowEnvironment.update({
      where: { id: env.id },
      data: {
        activeReleaseArtifactId: targetArtifact.id,
        deployedAt: new Date(),
        deployedByUserId: userId,
      },
    });

    // Mark previous active deployments as ROLLED_BACK
    if (previousReleaseId) {
      await prisma.workflowDeployment.updateMany({
        where: {
          environmentId: env.id,
          releaseArtifactId: previousReleaseId,
          status: "DEPLOYED",
          id: { not: rollbackRecord.id },
        },
        data: { status: "ROLLED_BACK" },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "DEPLOYMENT_ROLLED_BACK",
      targetType: "DEPLOYMENT",
      targetId: rollbackRecord.id,
      metadata: {
        environmentId: env.id,
        restoredReleaseId: targetArtifact.id,
        reason: input.reason,
      },
    });

    await outboundWebhookService.emitEvent(workspaceId, "deployment.rolled_back", {
      deploymentId: rollbackRecord.id,
      environment: env.name,
      restoredReleaseNumber: targetArtifact.releaseNumber,
      initiatedBy: userId,
    });

    return rollbackRecord;
  }

  /**
   * List deployment history.
   */
  async listDeployments(workspaceId: string, environmentId?: string, workflowId?: string) {
    const where: any = { workspaceId };
    if (environmentId) where.environmentId = environmentId;
    if (workflowId) where.workflowId = workflowId;

    return prisma.workflowDeployment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        environment: { select: { id: true, name: true, slug: true, type: true } },
        releaseArtifact: {
          select: {
            id: true,
            releaseNumber: true,
            versionNumber: true,
            contentHash: true,
            summary: true,
          },
        },
        workflow: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Get single deployment record with full details.
   */
  async getDeployment(workspaceId: string, deploymentId: string) {
    const deployment = await prisma.workflowDeployment.findFirst({
      where: { id: deploymentId, workspaceId },
      include: {
        environment: { include: { policy: true } },
        releaseArtifact: true,
        workflow: { select: { id: true, name: true } },
      },
    });

    if (!deployment) {
      throw new Error("Deployment not found.");
    }

    return deployment;
  }
}

export const deploymentService = new DeploymentService();
