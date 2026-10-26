import { prisma } from "@flowforge/database";
import {
  PortfolioOverviewMetrics,
  PortfolioQueueItem,
  AccountSegment,
  PortfolioPriorityLevel,
} from "@flowforge/shared";
import { strategicAccountService } from "./strategicAccountService.js";

export class CustomerPortfolioService {
  /**
   * Generates portfolio-wide overview metrics.
   */
  public async getPortfolioOverview(workspaceId: string): Promise<PortfolioOverviewMetrics> {
    const profiles = await prisma.customerStrategicAccountProfile.findMany({
      where: { workspaceId },
      include: {
        customerAccount: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const segmentDistribution: Record<AccountSegment, number> = {
      STRATEGIC: 0,
      ENTERPRISE: 0,
      GROWTH: 0,
      STANDARD: 0,
    };

    const priorityDistribution: Record<PortfolioPriorityLevel, number> = {
      CRITICAL_ATTENTION: 0,
      HIGH_PRIORITY: 0,
      ROUTINE_MANAGEMENT: 0,
      HEALTHY_STRATEGIC: 0,
    };

    let singleThreadedAccountsCount = 0;
    let strategicAccountsCount = 0;

    for (const p of profiles) {
      if (segmentDistribution[p.accountSegment as AccountSegment] !== undefined) {
        segmentDistribution[p.accountSegment as AccountSegment]++;
      }
      if (priorityDistribution[p.priorityLevel as PortfolioPriorityLevel] !== undefined) {
        priorityDistribution[p.priorityLevel as PortfolioPriorityLevel]++;
      }
      if (p.accountSegment === "STRATEGIC" || p.strategicTier === "TIER_1_CORE") {
        strategicAccountsCount++;
      }
      if (p.relationshipCoverageStatus === "SINGLE_THREADED_RISK" || p.relationshipCoverageStatus === "INSUFFICIENT_DATA") {
        singleThreadedAccountsCount++;
      }
    }

    // Overdue reviews
    const overdueReviewsCount = await prisma.customerExecutiveReview.count({
      where: {
        workspaceId,
        status: { in: ["PLANNED", "PREPARATION"] },
        plannedDate: { lt: new Date() },
      },
    });

    // Blocked objectives
    const blockedObjectivesCount = await prisma.customerSuccessObjective.count({
      where: {
        workspaceId,
        status: "BLOCKED",
      },
    });

    // At risk objectives
    const atRiskObjectivesCount = await prisma.customerSuccessObjective.count({
      where: {
        workspaceId,
        status: "AT_RISK",
      },
    });

    // Active plans
    const activePlansCount = await prisma.customerAccountPlan.count({
      where: {
        workspaceId,
        status: "ACTIVE",
      },
    });

    const priorityQueue = await this.getPrioritizedQueue(workspaceId);

    return {
      totalManagedAccounts: profiles.length,
      segmentDistribution,
      priorityDistribution,
      strategicAccountsCount,
      overdueReviewsCount,
      blockedObjectivesCount,
      singleThreadedAccountsCount,
      activePlansCount,
      atRiskObjectivesCount,
      priorityQueue,
    };
  }

  /**
   * Retrieves the deterministic prioritized account queue.
   */
  public async getPrioritizedQueue(workspaceId: string): Promise<PortfolioQueueItem[]> {
    const accounts = await prisma.customerAccount.findMany({
      where: { workspaceId },
      include: {
        strategicProfile: true,
        executiveReviews: {
          where: { status: { in: ["PLANNED", "PREPARATION"] } },
          orderBy: { plannedDate: "asc" },
          take: 1,
        },
        contracts: {
          where: { status: "ACTIVE" },
          orderBy: { renewalDate: "asc" },
          take: 1,
        },
      },
    });

    const queue: PortfolioQueueItem[] = [];

    for (const acc of accounts) {
      let evaluation = await prisma.customerPortfolioPriorityEvaluation.findFirst({
        where: { workspaceId, customerAccountId: acc.id, isLatest: true },
      });

      if (!evaluation) {
        try {
          evaluation = await strategicAccountService.calculatePortfolioPriority(workspaceId, acc.id);
        } catch (_e) {
          continue;
        }
      }

      const factors = Array.isArray(evaluation.contributingFactors)
        ? (evaluation.contributingFactors as string[])
        : [];

      const recommendedActions = Array.isArray(evaluation.recommendedActions)
        ? (evaluation.recommendedActions as string[])
        : [];

      // Check tasks
      const overdueTasksCount = await prisma.customerSuccessTask.count({
        where: {
          workspaceId,
          customerAccountId: acc.id,
          status: "OPEN",
          dueAt: { lt: new Date() },
        },
      });

      const openBlockersCount = await prisma.customerObjectiveBlocker.count({
        where: {
          workspaceId,
          objective: { customerAccountId: acc.id },
          status: { in: ["OPEN", "INVESTIGATING"] },
        },
      });

      const nextAction = recommendedActions[0] || "Review strategic objectives alignment.";

      // Renewal urgency
      let renewalUrgency: string | null = null;
      if (acc.contracts.length > 0) {
        const days = Math.round((acc.contracts[0].renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        renewalUrgency = `Renewal in ${days} days`;
      }

      queue.push({
        customerAccountId: acc.id,
        accountName: acc.name,
        accountSegment: (acc.strategicProfile?.accountSegment as AccountSegment) || "STANDARD",
        priorityLevel: (evaluation.priorityLevel as PortfolioPriorityLevel) || "ROUTINE_MANAGEMENT",
        priorityScore: evaluation.priorityScore,
        reasons: factors,
        ownerUserId: acc.strategicProfile?.primaryAccountOwnerId || acc.ownerUserId,
        overdueTasksCount,
        openBlockersCount,
        healthStatus: null,
        renewalUrgency,
        nextAction,
        evidenceRef: `eval-${evaluation.id.substring(0, 8)}`,
      });
    }

    queue.sort((a, b) => b.priorityScore - a.priorityScore);

    return queue;
  }
}

export const customerPortfolioService = new CustomerPortfolioService();
