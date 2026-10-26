import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  ConfigureStrategicProfileInput,
  AccountSegment,
  StrategicTier,
  PortfolioPriorityLevel,
  StakeholderCoverageSummary,
  RelationshipCoverageStatus,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class StrategicAccountService {
  /**
   * Retrieves strategic profile for a customer account.
   */
  public async getProfile(workspaceId: string, customerAccountId: string) {
    const profile = await prisma.customerStrategicAccountProfile.findFirst({
      where: {
        workspaceId,
        customerAccountId,
      },
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
            slug: true,
            domain: true,
            tier: true,
            lifecycleState: true,
            annualContractValue: true,
          },
        },
      },
    });

    return profile;
  }

  /**
   * Lists strategic account profiles in a workspace.
   */
  public async listProfiles(
    workspaceId: string,
    filters?: {
      tier?: StrategicTier;
      segment?: AccountSegment;
      search?: string;
    }
  ) {
    const whereClause: any = { workspaceId };

    if (filters?.tier) {
      whereClause.strategicTier = filters.tier;
    }
    if (filters?.segment) {
      whereClause.accountSegment = filters.segment;
    }
    if (filters?.search) {
      whereClause.customerAccount = {
        name: { contains: filters.search, mode: "insensitive" },
      };
    }

    return prisma.customerStrategicAccountProfile.findMany({
      where: whereClause,
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            lifecycleState: true,
            annualContractValue: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Configures or updates a customer account's strategic profile.
   */
  public async configureProfile(
    workspaceId: string,
    customerAccountId: string,
    input: ConfigureStrategicProfileInput,
    actorId?: string
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${customerAccountId}' not found in workspace.`);
    }

    const existingProfile = await prisma.customerStrategicAccountProfile.findFirst({
      where: { workspaceId, customerAccountId },
    });

    const profile = existingProfile
      ? await prisma.customerStrategicAccountProfile.update({
          where: { id: existingProfile.id },
          data: {
            accountSegment: input.accountSegment,
            strategicTier: input.strategicTier,
            primaryAccountOwnerId: input.primaryAccountOwnerId !== undefined ? input.primaryAccountOwnerId : existingProfile.primaryAccountOwnerId,
            customerSuccessOwnerId: input.customerSuccessOwnerId !== undefined ? input.customerSuccessOwnerId : existingProfile.customerSuccessOwnerId,
            executiveSponsorId: input.executiveSponsorId !== undefined ? input.executiveSponsorId : existingProfile.executiveSponsorId,
            technicalOwnerId: input.technicalOwnerId !== undefined ? input.technicalOwnerId : existingProfile.technicalOwnerId,
            reviewCadence: input.reviewCadence,
            industry: input.industry !== undefined ? input.industry : existingProfile.industry,
            businessDomain: input.businessDomain !== undefined ? input.businessDomain : existingProfile.businessDomain,
            targetOutcomes: input.targetOutcomes || existingProfile.targetOutcomes,
            internalStrategicNotes: input.internalStrategicNotes !== undefined ? input.internalStrategicNotes : existingProfile.internalStrategicNotes,
          },
        })
      : await prisma.customerStrategicAccountProfile.create({
          data: {
            workspaceId,
            customerAccountId,
            accountSegment: input.accountSegment,
            strategicTier: input.strategicTier,
            primaryAccountOwnerId: input.primaryAccountOwnerId || null,
            customerSuccessOwnerId: input.customerSuccessOwnerId || null,
            executiveSponsorId: input.executiveSponsorId || null,
            technicalOwnerId: input.technicalOwnerId || null,
            reviewCadence: input.reviewCadence,
            industry: input.industry || null,
            businessDomain: input.businessDomain || null,
            targetOutcomes: input.targetOutcomes || [],
            internalStrategicNotes: input.internalStrategicNotes || null,
          },
        });

    // Re-evaluate coverage and priority
    await this.calculateCoverage(workspaceId, customerAccountId);
    await this.calculatePortfolioPriority(workspaceId, customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_STRATEGIC_PROFILE_CONFIGURED",
      entityType: "CustomerStrategicAccountProfile",
      entityId: profile.id,
      metadata: { customerAccountId, tier: input.strategicTier, segment: input.accountSegment },
    });

    return profile;
  }

  /**
   * Deterministically calculates stakeholder coverage and single-thread risk.
   */
  public async calculateCoverage(
    workspaceId: string,
    customerAccountId: string
  ): Promise<StakeholderCoverageSummary> {
    const contacts = await prisma.customerContact.findMany({
      where: { workspaceId, customerAccountId },
      select: { id: true },
    });

    const relationships = await prisma.customerStakeholderRelationship.findMany({
      where: { workspaceId, customerAccountId, status: "ACTIVE" },
      include: { contact: true },
    });

    const rolesBreakdown: Record<string, number> = {};
    let hasExecutiveSponsor = false;
    let hasBusinessDecisionMaker = false;
    let hasTechnicalDecisionMaker = false;
    let hasChampion = false;
    let isRecentlyVerified = false;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    for (const rel of relationships) {
      rolesBreakdown[rel.role] = (rolesBreakdown[rel.role] || 0) + 1;
      if (rel.role === "EXECUTIVE_SPONSOR") hasExecutiveSponsor = true;
      if (rel.role === "BUSINESS_DECISION_MAKER") hasBusinessDecisionMaker = true;
      if (rel.role === "TECHNICAL_DECISION_MAKER") hasTechnicalDecisionMaker = true;
      if (rel.role === "DAY_TO_DAY_CHAMPION") hasChampion = true;

      if (rel.verifiedAt && rel.verifiedAt >= ninetyDaysAgo) {
        isRecentlyVerified = true;
      }
    }

    const totalContacts = contacts.length;
    const mappedRolesCount = relationships.length;

    let coverageStatus: RelationshipCoverageStatus;
    let isSingleThreaded = false;

    if (mappedRolesCount === 0) {
      coverageStatus = "INSUFFICIENT_DATA";
      isSingleThreaded = true;
    } else if (mappedRolesCount === 1 || (!hasExecutiveSponsor && !hasBusinessDecisionMaker)) {
      coverageStatus = "SINGLE_THREADED_RISK";
      isSingleThreaded = true;
    } else if (hasExecutiveSponsor && hasBusinessDecisionMaker && hasTechnicalDecisionMaker && hasChampion) {
      coverageStatus = "COMPREHENSIVE";
    } else if ((hasExecutiveSponsor || hasBusinessDecisionMaker) && hasChampion) {
      coverageStatus = "ADEQUATE";
    } else {
      coverageStatus = "PARTIAL";
      isSingleThreaded = true;
    }

    await prisma.customerStrategicAccountProfile.updateMany({
      where: { workspaceId, customerAccountId },
      data: { relationshipCoverageStatus: coverageStatus },
    });

    return {
      customerAccountId,
      totalContacts,
      mappedRolesCount,
      hasExecutiveSponsor,
      hasBusinessDecisionMaker,
      hasTechnicalDecisionMaker,
      hasChampion,
      isRecentlyVerified,
      isSingleThreaded,
      coverageStatus,
      rolesBreakdown,
    };
  }

  /**
   * Deterministically calculates priority score, priority level, and explanation factors.
   */
  public async calculatePortfolioPriority(workspaceId: string, customerAccountId: string) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
      include: {
        strategicProfile: true,
      },
    });

    if (!account) {
      throw new HttpError(404, `Customer account '${customerAccountId}' not found in workspace.`);
    }

    const coverage = await this.calculateCoverage(workspaceId, customerAccountId);

    const openBlockers = await prisma.customerObjectiveBlocker.findMany({
      where: {
        workspaceId,
        objective: { customerAccountId },
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
    });

    const activeContracts = await prisma.customerContract.findMany({
      where: {
        workspaceId,
        customerAccountId,
        status: "ACTIVE",
      },
    });

    let priorityScore = 15;
    const contributingFactors: string[] = [];
    const recommendedActions: string[] = [];

    // 1. Tier weighting
    const tier = account.strategicProfile?.strategicTier || "TIER_4_FOUNDATIONAL";
    if (tier === "TIER_1_CORE") {
      priorityScore += 35;
      contributingFactors.push("Tier 1 Core Strategic relationship requiring executive governance.");
    } else if (tier === "TIER_2_EXPANSION") {
      priorityScore += 25;
      contributingFactors.push("Tier 2 Expansion account with high ARR potential.");
    } else if (tier === "TIER_3_SCALE") {
      priorityScore += 15;
      contributingFactors.push("Tier 3 Scale account targeted for programmatic adoption.");
    }

    // 2. Single-thread coverage risk
    if (coverage.isSingleThreaded) {
      priorityScore += 25;
      contributingFactors.push(`Stakeholder coverage vulnerability: ${coverage.coverageStatus} (single-thread risk).`);
      recommendedActions.push("Map executive sponsor and technical decision-makers to expand contact surface.");
    }

    // 3. Open objective blockers
    const criticalBlockers = openBlockers.filter(b => b.severity === "CRITICAL" || b.severity === "HIGH");
    if (criticalBlockers.length > 0) {
      priorityScore += 20;
      contributingFactors.push(`${criticalBlockers.length} critical/high objective blocker(s) impeding business outcomes.`);
      recommendedActions.push("Initiate cross-functional escalation to clear customer objective blockers.");
    } else if (openBlockers.length > 0) {
      priorityScore += 10;
      contributingFactors.push(`${openBlockers.length} open blocker(s) require remediation.`);
    }

    // 4. Renewal proximity (within 90 days)
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const upcomingRenewals = activeContracts.filter(c => c.renewalDate <= in90Days && c.renewalDate >= now);
    if (upcomingRenewals.length > 0) {
      priorityScore += 15;
      contributingFactors.push(`Contract renewal upcoming within 90 days for ${upcomingRenewals.length} active contract(s).`);
      recommendedActions.push("Schedule Executive Business Review (EBR) to align on renewal terms.");
    }

    // Clamp score
    priorityScore = Math.max(0, Math.min(100, priorityScore));

    // Priority level
    let priorityLevel: PortfolioPriorityLevel;
    if (priorityScore >= 75) {
      priorityLevel = "CRITICAL_ATTENTION";
    } else if (priorityScore >= 50) {
      priorityLevel = "HIGH_PRIORITY";
    } else if (priorityScore >= 25) {
      priorityLevel = "ROUTINE_MANAGEMENT";
    } else {
      priorityLevel = "HEALTHY_STRATEGIC";
    }

    if (recommendedActions.length === 0) {
      recommendedActions.push("Maintain scheduled quarterly governance cadence.");
    }

    const explanation = contributingFactors.join(" ");

    // Update profile with priority fields
    await prisma.customerStrategicAccountProfile.updateMany({
      where: { workspaceId, customerAccountId },
      data: {
        priorityLevel,
        priorityScore,
        priorityFactors: contributingFactors,
      },
    });

    // Mark previous evaluations as not latest and create new evaluation
    await prisma.customerPortfolioPriorityEvaluation.updateMany({
      where: { workspaceId, customerAccountId, isLatest: true },
      data: { isLatest: false },
    });

    const evaluation = await prisma.customerPortfolioPriorityEvaluation.create({
      data: {
        workspaceId,
        customerAccountId,
        policyVersion: "1.0",
        priorityLevel,
        priorityScore,
        evaluationTimestamp: new Date(),
        contributingFactors,
        recommendedActions,
        explanation,
        isLatest: true,
      },
    });

    return evaluation;
  }
}

export const strategicAccountService = new StrategicAccountService();
