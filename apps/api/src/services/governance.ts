import { prisma } from "@flowforge/database";
import {
  UpdateGovernancePolicyInput,
  PolicyEvaluationResult,
  PolicyEvaluationViolation,
  UpdateWorkflowStewardshipInput,
} from "@flowforge/shared";

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
          requireWorkflowOwner: false,
          requireReviewForCritical: true,
          requirePassingTests: false,
          enforceReliabilitySlo: false,
          maxExecutionDurationMs: 300000,
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
        requireWorkflowOwner: input.requireWorkflowOwner !== undefined ? input.requireWorkflowOwner : current.requireWorkflowOwner,
        requireReviewForCritical: input.requireReviewForCritical !== undefined ? input.requireReviewForCritical : current.requireReviewForCritical,
        requirePassingTests: input.requirePassingTests !== undefined ? input.requirePassingTests : current.requirePassingTests,
        enforceReliabilitySlo: input.enforceReliabilitySlo !== undefined ? input.enforceReliabilitySlo : current.enforceReliabilitySlo,
        maxExecutionDurationMs: input.maxExecutionDurationMs !== undefined ? input.maxExecutionDurationMs : current.maxExecutionDurationMs,
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
   * Deterministic Policy Evaluator:
   * Evaluates organization/workspace policy constraints on workflow activation, release promotion, or archival.
   */
  async evaluatePolicy(
    workspaceId: string,
    context: {
      workflowId: string;
      action: "ACTIVATE" | "PROMOTE" | "ARCHIVE";
      targetEnvironmentId?: string;
      releaseArtifactId?: string;
    }
  ): Promise<PolicyEvaluationResult> {
    const policy = await this.getEffectivePolicy(workspaceId);
    const passedRules: string[] = [];
    const warnings: PolicyEvaluationViolation[] = [];
    const violations: PolicyEvaluationViolation[] = [];

    const workflow = await prisma.workflow.findFirst({
      where: { id: context.workflowId, workspaceId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!workflow) {
      violations.push({
        rule: "WORKFLOW_EXISTS",
        severity: "BLOCKING",
        message: "Workflow not found in this workspace.",
        remediation: "Verify the workflow ID.",
      });
      return {
        compliant: false,
        passedRules,
        warnings,
        violations,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // 1. RULE: REQUIRE_WORKFLOW_OWNER
    if (policy.requireWorkflowOwner) {
      if (!workflow.ownerUserId && !workflow.owningTeamId) {
        violations.push({
          rule: "REQUIRE_WORKFLOW_OWNER",
          severity: "BLOCKING",
          message: "Governance policy requires a named primary owner or owning team before activation or promotion.",
          remediation: "Assign an owner user or team steward in the Workflow Governance panel.",
        });
      } else {
        passedRules.push("REQUIRE_WORKFLOW_OWNER");
      }
    }

    // 2. RULE: REQUIRE_REVIEW_FOR_CRITICAL
    if (
      policy.requireReviewForCritical &&
      (workflow.criticality === "CRITICAL" || workflow.criticality === "TIER_1_CRITICAL")
    ) {
      const hasApprovedReview = workflow.reviews.length > 0;
      if (!hasApprovedReview) {
        violations.push({
          rule: "REQUIRE_REVIEW_FOR_CRITICAL",
          severity: "BLOCKING",
          message: "TIER_1_CRITICAL automations require an APPROVED collaborative review before deployment.",
          remediation: "Submit workflow for review in the Collaborative Change Center and obtain approval.",
        });
      } else {
        passedRules.push("REQUIRE_REVIEW_FOR_CRITICAL");
      }
    }

    // 3. RULE: REQUIRE_PASSING_TESTS (when promoting to environment)
    if (policy.requirePassingTests && context.action === "PROMOTE") {
      const latestTestRun = await prisma.workflowTestRun.findFirst({
        where: { workflowId: context.workflowId },
        orderBy: { createdAt: "desc" },
      });
      if (!latestTestRun || latestTestRun.status !== "PASSED") {
        violations.push({
          rule: "REQUIRE_PASSING_TESTS",
          severity: "BLOCKING",
          message: "Governance policy mandates passing automated pre-deployment tests prior to release promotion.",
          remediation: "Execute test suite in DRY_RUN mode in the Pre-Deployment Test Center and verify all assertions pass.",
        });
      } else {
        passedRules.push("REQUIRE_PASSING_TESTS");
      }
    }

    // 4. RULE: REQUIRE_HTTPS_WEBHOOKS
    if (policy.requireHttpsWebhooks) {
      const latestVersion = workflow.versions[0];
      const nodes = Array.isArray(latestVersion?.nodes) ? (latestVersion.nodes as any[]) : [];
      const insecureHttpNodes = nodes.filter(
        (n) => n.data?.nodeType === "HTTP_REQUEST" && n.data?.config?.url && !n.data.config.url.startsWith("https://")
      );
      if (insecureHttpNodes.length > 0) {
        violations.push({
          rule: "REQUIRE_HTTPS_WEBHOOKS",
          severity: "BLOCKING",
          message: `Insecure HTTP endpoints detected in ${insecureHttpNodes.length} node(s). Production workflows must use HTTPS.`,
          remediation: "Update all outbound URL targets to use secure HTTPS endpoints.",
        });
      } else {
        passedRules.push("REQUIRE_HTTPS_WEBHOOKS");
      }
    }

    // 5. RULE: ENFORCE_RELIABILITY_SLO
    if (policy.enforceReliabilitySlo) {
      const breachedSlo = await prisma.reliabilityObjective.findFirst({
        where: {
          workspaceId,
          OR: [{ workflowId: context.workflowId }, { workflowId: null }],
          status: "BREACHED",
        },
      });
      if (breachedSlo) {
        warnings.push({
          rule: "ENFORCE_RELIABILITY_SLO",
          severity: "WARNING",
          message: `Active reliability objective '${breachedSlo.name}' is currently BREACHED for this workflow.`,
          remediation: "Review execution error logs and resolve operational bottlenecks before proceeding.",
        });
      } else {
        passedRules.push("ENFORCE_RELIABILITY_SLO");
      }
    }

    const compliant = violations.length === 0;

    return {
      compliant,
      passedRules,
      warnings,
      violations,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates workflow stewardship metadata.
   */
  async updateWorkflowStewardship(
    workspaceId: string,
    workflowId: string,
    actorUserId: string,
    input: UpdateWorkflowStewardshipInput
  ) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
    });
    if (!workflow) {
      const error: any = new Error("Workflow not found.");
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : workflow.ownerUserId,
        owningTeamId: input.owningTeamId !== undefined ? input.owningTeamId : workflow.owningTeamId,
        stewardUserId: input.stewardUserId !== undefined ? input.stewardUserId : workflow.stewardUserId,
        criticality: input.criticality || workflow.criticality,
        businessDomain: input.businessDomain !== undefined ? input.businessDomain : workflow.businessDomain,
        lifecycleStatus: input.lifecycleStatus || workflow.lifecycleStatus,
        nextReviewDate: input.nextReviewDate ? new Date(input.nextReviewDate) : workflow.nextReviewDate,
        escalationContact: input.escalationContact !== undefined ? input.escalationContact : workflow.escalationContact,
      },
      include: {
        owningTeam: { select: { id: true, name: true, slug: true } },
      },
    });

    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: actorUserId,
        actorType: "USER",
        action: "WORKFLOW_STEWARDSHIP_UPDATED",
        targetType: "WORKFLOW",
        targetId: workflowId,
        metadata: input,
      },
    });

    return updated;
  }

  /**
   * Ownership Intelligence:
   * Aggregates unmanaged, orphan, approaching review, and deprecated automations.
   */
  async getOwnershipIntelligence(workspaceId: string) {
    const workflows = await prisma.workflow.findMany({
      where: { workspaceId },
      include: {
        owningTeam: { select: { id: true, name: true, status: true } },
      },
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000);

    const orphanWorkflows = workflows.filter((w) => !w.ownerUserId && !w.owningTeamId);
    const archivedTeamWorkflows = workflows.filter((w) => w.owningTeam && w.owningTeam.status === "ARCHIVED");
    const criticalWithoutSteward = workflows.filter(
      (w) => w.criticality === "TIER_1_CRITICAL" && !w.stewardUserId
    );
    const approachingReview = workflows.filter(
      (w) => w.nextReviewDate && new Date(w.nextReviewDate) <= thirtyDaysFromNow
    );
    const deprecatedWorkflows = workflows.filter((w) => w.lifecycleStatus === "DEPRECATED");

    return {
      totalWorkflows: workflows.length,
      orphanedWorkflows: orphanWorkflows.length,
      criticalWorkflows: workflows.filter(
        (w) => w.criticality === "CRITICAL" || w.criticality === "TIER_1_CRITICAL"
      ).length,
      overdueReviews: workflows.filter((w) => w.nextReviewDate && new Date(w.nextReviewDate) < now).length,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        criticality: w.criticality,
        businessDomain: w.businessDomain,
        ownerUserId: w.ownerUserId,
        owner: (w as any).ownerUser || null,
        owningTeamId: w.owningTeamId,
        owningTeam: w.owningTeam,
        stewardUserId: w.stewardUserId,
        nextReviewDate: w.nextReviewDate,
        escalationContact: w.escalationContact,
        lifecycleStatus: w.lifecycleStatus,
      })),
      summary: {
        totalWorkflows: workflows.length,
        orphanCount: orphanWorkflows.length,
        archivedTeamCount: archivedTeamWorkflows.length,
        criticalWithoutStewardCount: criticalWithoutSteward.length,
        approachingReviewCount: approachingReview.length,
        deprecatedCount: deprecatedWorkflows.length,
      },
      orphanWorkflows: orphanWorkflows.map((w) => ({
        id: w.id,
        name: w.name,
        criticality: w.criticality,
        status: w.status,
      })),
      archivedTeamWorkflows: archivedTeamWorkflows.map((w) => ({
        id: w.id,
        name: w.name,
        teamName: w.owningTeam?.name,
      })),
      criticalWithoutSteward: criticalWithoutSteward.map((w) => ({
        id: w.id,
        name: w.name,
        criticality: w.criticality,
      })),
      approachingReview: approachingReview.map((w) => ({
        id: w.id,
        name: w.name,
        nextReviewDate: w.nextReviewDate,
      })),
      deprecatedWorkflows: deprecatedWorkflows.map((w) => ({
        id: w.id,
        name: w.name,
        lifecycleStatus: w.lifecycleStatus,
      })),
    };
  }

  /**
   * Queries paginated audit logs for a workspace.
   */
  async queryAuditLogs(
    workspaceId: string,
    query: { page?: number; limit?: number; action?: string; targetType?: string; actorId?: string } = {}
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;
    if (query.actorId) where.actorId = query.actorId;

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
