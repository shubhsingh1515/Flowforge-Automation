import { prisma } from "@flowforge/database";
import {
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  SetEnvironmentVariableInput,
  SetCredentialBindingInput,
} from "@flowforge/shared";
import { encryptCredentials, decryptCredentials } from "../security/encryption.js";
import { auditLogService } from "./auditLog.js";

export class EnvironmentService {
  /**
   * Ensures default Development, Staging, and Production environments exist for a workspace.
   */
  async getOrCreateDefaultEnvironments(workspaceId: string) {
    const existing = await prisma.workflowEnvironment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: {
        variables: true,
        bindings: {
          include: {
            connectedAccount: {
              select: { id: true, name: true, integrationKey: true, status: true },
            },
          },
        },
      },
    });

    if (existing.length > 0) {
      return existing;
    }

    // Auto-provision standard environments
    const defaults = [
      {
        name: "Development",
        slug: "development",
        type: "DEVELOPMENT",
        description: "Sandbox environment for rapid prototyping, iteration, and dry-run tests.",
        isProtected: false,
        requireApproval: false,
        requirePassingTests: false,
      },
      {
        name: "Staging",
        slug: "staging",
        type: "STAGING",
        description: "Pre-production environment mirroring live configurations and test gates.",
        isProtected: false,
        requireApproval: false,
        requirePassingTests: true,
      },
      {
        name: "Production",
        slug: "production",
        type: "PRODUCTION",
        description: "Mission-critical live execution environment with strict deployment governance.",
        isProtected: true,
        requireApproval: true,
        requirePassingTests: true,
      },
    ];

    const created = await Promise.all(
      defaults.map((d) =>
        prisma.workflowEnvironment.create({
          data: {
            workspaceId,
            ...d,
            policy: {
              create: {
                workspaceId,
                requireApproval: d.requireApproval,
                requirePassingTests: d.requirePassingTests,
                preventSelfApproval: true,
                allowedPromoterRoles: ["OWNER", "ADMIN", "MEMBER"],
                allowedApproverRoles: ["OWNER", "ADMIN"],
              },
            },
          },
          include: {
            variables: true,
            bindings: {
              include: {
                connectedAccount: {
                  select: { id: true, name: true, integrationKey: true, status: true },
                },
              },
            },
          },
        })
      )
    );

    return created;
  }

  /**
   * List all environments for a workspace.
   */
  async listEnvironments(workspaceId: string) {
    await this.getOrCreateDefaultEnvironments(workspaceId);

    return prisma.workflowEnvironment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: {
        policy: true,
        _count: {
          select: {
            variables: true,
            bindings: true,
            deployments: true,
          },
        },
      },
    });
  }

  /**
   * Get a single environment by ID or slug.
   */
  async getEnvironment(workspaceId: string, environmentIdOrSlug: string) {
    await this.getOrCreateDefaultEnvironments(workspaceId);

    const env = await prisma.workflowEnvironment.findFirst({
      where: {
        workspaceId,
        OR: [{ id: environmentIdOrSlug }, { slug: environmentIdOrSlug }],
      },
      include: {
        policy: true,
        variables: {
          orderBy: { key: "asc" },
        },
        bindings: {
          include: {
            connectedAccount: {
              select: { id: true, name: true, integrationKey: true, status: true, metadata: true },
            },
          },
        },
      },
    });

    if (!env) {
      throw new Error(`Environment '${environmentIdOrSlug}' not found.`);
    }

    // Mask secret variables in response
    const sanitizedVariables = env.variables.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "[REDACTED]" : v.value,
      isSecret: v.isSecret,
      description: v.description,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    return {
      ...env,
      variables: sanitizedVariables,
    };
  }

  /**
   * Create a new custom environment.
   */
  async createEnvironment(workspaceId: string, input: CreateEnvironmentInput, userId?: string) {
    const existing = await prisma.workflowEnvironment.findFirst({
      where: {
        workspaceId,
        slug: input.slug.toLowerCase(),
      },
    });

    if (existing) {
      throw new Error(`An environment with slug '${input.slug}' already exists in this workspace.`);
    }

    const env = await prisma.workflowEnvironment.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug.toLowerCase(),
        type: input.type,
        description: input.description,
        isProtected: input.isProtected ?? false,
        requireApproval: input.requireApproval ?? false,
        requirePassingTests: input.requirePassingTests ?? false,
        policy: {
          create: {
            workspaceId,
            requireApproval: input.requireApproval ?? false,
            requirePassingTests: input.requirePassingTests ?? false,
            preventSelfApproval: true,
            allowedPromoterRoles: ["OWNER", "ADMIN", "MEMBER"],
            allowedApproverRoles: ["OWNER", "ADMIN"],
          },
        },
      },
      include: { policy: true },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "ENVIRONMENT_CREATED",
      targetType: "ENVIRONMENT",
      targetId: env.id,
      metadata: { name: env.name, slug: env.slug, type: env.type },
    });

    return env;
  }

  /**
   * Update environment settings.
   */
  async updateEnvironment(
    workspaceId: string,
    environmentId: string,
    input: UpdateEnvironmentInput,
    userId?: string
  ) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    const updated = await prisma.workflowEnvironment.update({
      where: { id: environmentId },
      data: {
        name: input.name,
        description: input.description,
        isProtected: input.isProtected,
        requireApproval: input.requireApproval,
        requirePassingTests: input.requirePassingTests,
      },
      include: { policy: true },
    });

    // Update corresponding policy if approval/testing settings changed
    if (input.requireApproval !== undefined || input.requirePassingTests !== undefined) {
      await prisma.deploymentPolicy.upsert({
        where: { environmentId },
        update: {
          requireApproval: input.requireApproval ?? env.requireApproval,
          requirePassingTests: input.requirePassingTests ?? env.requirePassingTests,
        },
        create: {
          workspaceId,
          environmentId,
          requireApproval: input.requireApproval ?? env.requireApproval,
          requirePassingTests: input.requirePassingTests ?? env.requirePassingTests,
          preventSelfApproval: true,
          allowedPromoterRoles: ["OWNER", "ADMIN", "MEMBER"],
          allowedApproverRoles: ["OWNER", "ADMIN"],
        },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "ENVIRONMENT_UPDATED",
      targetType: "ENVIRONMENT",
      targetId: env.id,
      metadata: { name: updated.name, isProtected: updated.isProtected },
    });

    return updated;
  }

  // ==========================================
  // CONFIGURATION VARIABLES
  // ==========================================

  /**
   * List environment variables (secret values strictly masked).
   */
  async listVariables(workspaceId: string, environmentId: string) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    const vars = await prisma.environmentVariable.findMany({
      where: { environmentId },
      orderBy: { key: "asc" },
    });

    return vars.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "[REDACTED]" : v.value,
      isSecret: v.isSecret,
      description: v.description,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
  }

  /**
   * Set or update an environment variable. Secrets are encrypted using AES-256-GCM.
   */
  async setVariable(
    workspaceId: string,
    environmentId: string,
    input: SetEnvironmentVariableInput,
    userId?: string
  ) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    const storedValue = input.isSecret
      ? encryptCredentials(input.value)
      : input.value;

    const record = await prisma.environmentVariable.upsert({
      where: {
        environmentId_key: {
          environmentId,
          key: input.key,
        },
      },
      update: {
        value: storedValue,
        isSecret: input.isSecret,
        description: input.description,
        updatedByUserId: userId,
      },
      create: {
        workspaceId,
        environmentId,
        key: input.key,
        value: storedValue,
        isSecret: input.isSecret,
        description: input.description,
        updatedByUserId: userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "ENVIRONMENT_VARIABLE_SET",
      targetType: "ENVIRONMENT_VARIABLE",
      targetId: record.id,
      metadata: { environmentId, key: record.key, isSecret: record.isSecret },
    });

    return {
      id: record.id,
      key: record.key,
      value: record.isSecret ? "[REDACTED]" : input.value,
      isSecret: record.isSecret,
      description: record.description,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Delete an environment variable.
   */
  async deleteVariable(workspaceId: string, environmentId: string, key: string, userId?: string) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    await prisma.environmentVariable.deleteMany({
      where: { environmentId, key },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "ENVIRONMENT_VARIABLE_DELETED",
      targetType: "ENVIRONMENT_VARIABLE",
      targetId: key,
      metadata: { environmentId, key },
    });

    return { success: true, key };
  }

  /**
   * Resolves runtime key-value dictionary for workflow execution with secrets decrypted.
   */
  async resolveRuntimeVariables(workspaceId: string, environmentId: string): Promise<Record<string, string>> {
    const vars = await prisma.environmentVariable.findMany({
      where: { workspaceId, environmentId },
    });

    const dict: Record<string, string> = {};
    for (const v of vars) {
      if (v.isSecret) {
        try {
          const decrypted = decryptCredentials<string>(v.value);
          dict[v.key] = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);
        } catch {
          dict[v.key] = "";
        }
      } else {
        dict[v.key] = v.value;
      }
    }
    return dict;
  }

  // ==========================================
  // CREDENTIAL BINDINGS
  // ==========================================

  /**
   * List credential bindings for an environment.
   */
  async listBindings(workspaceId: string, environmentId: string) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    return prisma.environmentCredentialBinding.findMany({
      where: { environmentId },
      include: {
        connectedAccount: {
          select: {
            id: true,
            name: true,
            integrationKey: true,
            status: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Bind an integration key to a specific connected account in the environment.
   */
  async setBinding(
    workspaceId: string,
    environmentId: string,
    input: SetCredentialBindingInput,
    userId?: string
  ) {
    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
    });

    if (!env) {
      throw new Error("Environment not found.");
    }

    // Verify account exists and belongs to workspace
    const account = await prisma.connectedAccount.findFirst({
      where: { id: input.connectedAccountId, workspaceId },
    });

    if (!account) {
      throw new Error("Connected account not found or access denied.");
    }

    const binding = await prisma.environmentCredentialBinding.upsert({
      where: {
        environmentId_integrationKey: {
          environmentId,
          integrationKey: input.integrationKey,
        },
      },
      update: {
        connectedAccountId: input.connectedAccountId,
      },
      create: {
        workspaceId,
        environmentId,
        integrationKey: input.integrationKey,
        connectedAccountId: input.connectedAccountId,
      },
      include: {
        connectedAccount: {
          select: { id: true, name: true, integrationKey: true, status: true },
        },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "CREDENTIAL_BINDING_UPDATED",
      targetType: "CREDENTIAL_BINDING",
      targetId: binding.id,
      metadata: {
        environmentId,
        integrationKey: input.integrationKey,
        connectedAccountId: input.connectedAccountId,
      },
    });

    return binding;
  }

  /**
   * Remove a credential binding.
   */
  async deleteBinding(workspaceId: string, environmentId: string, integrationKey: string, userId?: string) {
    await prisma.environmentCredentialBinding.deleteMany({
      where: { environmentId, integrationKey },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "CREDENTIAL_BINDING_DELETED",
      targetType: "CREDENTIAL_BINDING",
      targetId: integrationKey,
      metadata: { environmentId, integrationKey },
    });

    return { success: true, integrationKey };
  }
}

export const environmentService = new EnvironmentService();
