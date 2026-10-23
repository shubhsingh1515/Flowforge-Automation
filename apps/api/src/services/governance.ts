import { prisma } from "@flowforge/database";
import { UpdateGovernancePolicyInput } from "@flowforge/shared";

export class GovernanceService {
  /**
   * Retrieves the active governance policy for a workspace or initializes standard defaults.
   */
  async getEffectivePolicy(workspaceId: string) {
    let policy = await prisma.workspaceGovernancePolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = await prisma.workspaceGovernancePolicy.create({
        data: {
          workspaceId,
          allowCustomIntegrations: true,
          allowMarketplacePublishing: false,
          allowCommunityTemplates: true,
          requireHttpsWebhooks: true,
          maxApiKeyLifetimeDays: 365,
          restrictIntegrationsToAdmin: false,
        },
      });
    }

    return policy;
  }

  /**
   * Updates governance policies for a workspace. Enforces ADMIN or OWNER privileges.
   */
  async updatePolicy(
    workspaceId: string,
    userId: string,
    userRole: string,
    input: UpdateGovernancePolicyInput
  ) {
    if (userRole !== "ADMIN" && userRole !== "OWNER") {
      const error: any = new Error("Only workspace Administrators or Owners can modify governance policies.");
      error.statusCode = 403;
      throw error;
    }

    const current = await this.getEffectivePolicy(workspaceId);

    const updated = await prisma.workspaceGovernancePolicy.update({
      where: { workspaceId },
      data: {
        allowCustomIntegrations: input.allowCustomIntegrations !== undefined ? input.allowCustomIntegrations : current.allowCustomIntegrations,
        allowMarketplacePublishing: input.allowMarketplacePublishing !== undefined ? input.allowMarketplacePublishing : current.allowMarketplacePublishing,
        allowCommunityTemplates: input.allowCommunityTemplates !== undefined ? input.allowCommunityTemplates : current.allowCommunityTemplates,
        requireHttpsWebhooks: input.requireHttpsWebhooks !== undefined ? input.requireHttpsWebhooks : current.requireHttpsWebhooks,
        maxApiKeyLifetimeDays: input.maxApiKeyLifetimeDays !== undefined ? input.maxApiKeyLifetimeDays : current.maxApiKeyLifetimeDays,
        restrictIntegrationsToAdmin: input.restrictIntegrationsToAdmin !== undefined ? input.restrictIntegrationsToAdmin : current.restrictIntegrationsToAdmin,
      },
    });

    // Record audit event
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "GOVERNANCE_POLICY_UPDATED",
        targetType: "WORKSPACE_GOVERNANCE_POLICY",
        targetId: updated.id,
        metadata: input,
      },
    });

    return updated;
  }

  /**
   * Queries paginated audit logs for a workspace.
   */
  async queryAuditLogs(
    workspaceId: string,
    query: { page?: number; limit?: number; action?: string } = {}
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };
    if (query.action) {
      where.action = query.action;
    }

    const [total, items] = await Promise.all([
      prisma.workspaceAuditLog.count({ where }),
      prisma.workspaceAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const governanceService = new GovernanceService();
