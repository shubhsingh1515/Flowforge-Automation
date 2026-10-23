import { prisma, PlanTier, SubscriptionStatus, ExecutionStatus } from "@flowforge/database";
import { getPlan, PlanDefinition, PlanFeatures } from "@flowforge/shared";

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  reason?: string;
}

export interface WorkspaceEntitlements {
  workspaceId: string;
  plan: PlanDefinition;
  subscription: {
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  };
  quotas: {
    executions: QuotaCheckResult;
    activeWorkflows: QuotaCheckResult;
    members: QuotaCheckResult;
    connectedAccounts: QuotaCheckResult;
  };
  features: PlanFeatures;
}

export class EntitlementService {
  /**
   * Retrieves or creates a default FREE subscription record for the workspace.
   */
  async getOrCreateSubscription(workspaceId: string) {
    let sub = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
    });

    if (!sub) {
      sub = await prisma.workspaceSubscription.create({
        data: {
          workspaceId,
          planTier: PlanTier.FREE,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    }

    return sub;
  }

  /**
   * Resolves the effective plan tier for a workspace, accounting for canceled or past-due state.
   */
  async getEffectivePlan(workspaceId: string): Promise<{ plan: PlanDefinition; subscription: any }> {
    const sub = await this.getOrCreateSubscription(workspaceId);

    // If subscription is canceled and past period end, fall back to Free tier
    if (sub.status === SubscriptionStatus.CANCELED) {
      if (sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd) {
        return { plan: getPlan("FREE"), subscription: sub };
      }
    }

    // If subscription is incomplete or unpaid past grace period, fall back to Free tier
    if (sub.status === SubscriptionStatus.UNPAID || sub.status === SubscriptionStatus.INCOMPLETE) {
      return { plan: getPlan("FREE"), subscription: sub };
    }

    const plan = getPlan(sub.planTier);
    return { plan, subscription: sub };
  }

  /**
   * Calculates execution usage for the current billing period.
   */
  async getCurrentExecutionUsage(workspaceId: string, periodStart: Date): Promise<number> {
    const result = await prisma.usageRecord.aggregate({
      where: {
        workspaceId,
        metricType: "WORKFLOW_EXECUTION",
        createdAt: { gte: periodStart },
      },
      _sum: {
        quantity: true,
      },
    });

    return result._sum.quantity || 0;
  }

  /**
   * Checks whether a new workflow execution is permitted under the workspace plan quota.
   */
  async canExecuteWorkflow(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan, subscription } = await this.getEffectivePlan(workspaceId);
    const periodStart = subscription.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const currentUsage = await this.getCurrentExecutionUsage(workspaceId, periodStart);
    const limit = plan.maxExecutionsPerMonth;
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return {
      allowed,
      current: currentUsage,
      limit,
      remaining,
      reason: allowed ? undefined : `Monthly execution quota of ${limit} runs reached for plan ${plan.name}. Please upgrade to continue running workflows.`,
    };
  }

  /**
   * Checks whether the workspace can create or save an active workflow.
   */

  /**
   * Checks whether workspace has reached its maximum concurrent active executions (resource isolation).
   */
  async canExecuteConcurrentWorkflow(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);
    const limit = plan.tier === "BUSINESS" ? 50 : plan.tier === "PRO" ? 15 : 3;

    const currentActive = await prisma.workflowExecution.count({
      where: {
        status: ExecutionStatus.RUNNING,
        workflow: { workspaceId },
      },
    });

    const allowed = currentActive < limit;
    return {
      allowed,
      current: currentActive,
      limit,
      remaining: Math.max(0, limit - currentActive),
      reason: allowed ? undefined : `Workspace active execution concurrency limit of ${limit} reached for ${plan.name} plan. Backpressure active.`,
    };
  }

  async canActivateWorkflow(workspaceId: string, currentWorkflowId?: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);

    // Count currently active workflows excluding the one being edited if already active
    const activeCount = await prisma.workflow.count({
      where: {
        workspaceId,
        status: "ACTIVE",
        ...(currentWorkflowId ? { id: { not: currentWorkflowId } } : {}),
      },
    });

    const limit = plan.maxActiveWorkflows;
    const remaining = Math.max(0, limit - activeCount);
    const allowed = activeCount < limit;

    return {
      allowed,
      current: activeCount,
      limit,
      remaining,
      reason: allowed ? undefined : `Active workflow limit of ${limit} reached for plan ${plan.name}. Please upgrade or deactivate another workflow.`,
    };
  }

  /**
   * Checks whether a new workspace member or invitation can be added.
   */
  async canAddWorkspaceMember(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);

    const [memberCount, pendingInvites] = await Promise.all([
      prisma.workspaceMembership.count({ where: { workspaceId } }),
      prisma.workspaceInvitation.count({
        where: {
          workspaceId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const totalMembers = memberCount + pendingInvites;
    const limit = plan.maxWorkspaceMembers;
    const remaining = Math.max(0, limit - totalMembers);
    const allowed = totalMembers < limit;

    return {
      allowed,
      current: totalMembers,
      limit,
      remaining,
      reason: allowed ? undefined : `Workspace member limit of ${limit} reached for plan ${plan.name}. Please upgrade your plan to add more team members.`,
    };
  }

  /**
   * Checks whether the workspace can connect an additional external account.
   */
  async canConnectAccount(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);

    const connectedCount = await prisma.connectedAccount.count({
      where: { workspaceId },
    });

    const limit = plan.maxConnectedAccounts;
    const remaining = Math.max(0, limit - connectedCount);
    const allowed = connectedCount < limit;

    return {
      allowed,
      current: connectedCount,
      limit,
      remaining,
      reason: allowed ? undefined : `Connected account limit of ${limit} reached for plan ${plan.name}. Please upgrade to connect more accounts.`,
    };
  }

  /**
   * Checks whether the workspace can create another active API key under its current plan.
   */
  async checkApiKeyQuota(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);
    const activeCount = await prisma.apiKey.count({
      where: { workspaceId, revokedAt: null },
    });

    const limit = plan.maxApiKeys ?? 2;
    const remaining = Math.max(0, limit - activeCount);
    const allowed = activeCount < limit;

    return {
      allowed,
      current: activeCount,
      limit,
      remaining,
      reason: allowed ? undefined : `API key limit of ${limit} reached for plan ${plan.name}. Please upgrade to create more keys.`,
    };
  }

  /**
   * Checks whether the workspace can register another outbound webhook endpoint under its plan.
   */
  async checkOutboundWebhookQuota(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);
    const count = await prisma.outboundWebhook.count({
      where: { workspaceId },
    });

    const limit = plan.maxOutboundWebhooks ?? 2;
    const remaining = Math.max(0, limit - count);
    const allowed = count < limit;

    return {
      allowed,
      current: count,
      limit,
      remaining,
      reason: allowed ? undefined : `Outbound webhook limit of ${limit} reached for plan ${plan.name}. Please upgrade to register more endpoints.`,
    };
  }

  /**
   * Checks whether the workspace can create another custom integration under its plan.
   */
  async checkCustomIntegrationQuota(workspaceId: string): Promise<QuotaCheckResult> {
    const { plan } = await this.getEffectivePlan(workspaceId);
    const count = await prisma.customIntegration.count({
      where: { workspaceId },
    });

    const limit = plan.maxCustomIntegrations ?? 1;
    const remaining = Math.max(0, limit - count);
    const allowed = count < limit;

    return {
      allowed,
      current: count,
      limit,
      remaining,
      reason: allowed ? undefined : `Custom integration limit of ${limit} reached for plan ${plan.name}. Please upgrade to build more custom integrations.`,
    };
  }

  /**
   * Checks whether a plan-gated feature is enabled for the workspace.
   */
  async canUseFeature(workspaceId: string, feature: keyof PlanFeatures): Promise<{ allowed: boolean; reason?: string }> {
    const { plan } = await this.getEffectivePlan(workspaceId);
    const allowed = Boolean(plan.features[feature]);

    return {
      allowed,
      reason: allowed ? undefined : `Feature '${String(feature)}' requires an upgrade to a higher tier plan (currently on ${plan.name}).`,
    };
  }

  /**
   * Generates a comprehensive entitlements and usage report for the workspace dashboard.
   */
  async getWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
    const { plan, subscription } = await this.getEffectivePlan(workspaceId);
    const periodStart = subscription.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [executionQuota, activeWorkflows, members, connectedAccounts] = await Promise.all([
      this.canExecuteWorkflow(workspaceId),
      this.canActivateWorkflow(workspaceId),
      this.canAddWorkspaceMember(workspaceId),
      this.canConnectAccount(workspaceId),
    ]);

    return {
      workspaceId,
      plan,
      subscription: {
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      quotas: {
        executions: executionQuota,
        activeWorkflows,
        members,
        connectedAccounts,
      },
      features: plan.features,
    };
  }
}

export const entitlementService = new EntitlementService();
