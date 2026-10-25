import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  ConfigureRevenuePolicyInput,
  RevenueOverviewMetrics,
  RENEWAL_STAGES,
  RENEWAL_RISK_LEVELS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerRevenuePolicyService {
  /**
   * Retrieves the workspace revenue policy, creating a standard default if none exists.
   */
  public async getPolicy(workspaceId: string) {
    let policy = await prisma.customerRevenuePolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = await prisma.customerRevenuePolicy.create({
        data: {
          workspaceId,
          policyVersion: "1.0",
          renewalPreparationDays: 90,
          healthReviewDays: 60,
          engagementDays: 45,
          commercialReviewDays: 30,
          riskThresholds: { moderate: 30, high: 60, critical: 80 },
          alertCooldownHours: 72,
          autoTaskGeneration: true,
          expansionRules: { utilizationGrowthPercent: 25, consecutiveHighUsageDays: 14 },
        },
      });
    }

    return policy;
  }

  /**
   * Configures or updates the workspace revenue policy with audit logging.
   */
  public async configurePolicy(
    workspaceId: string,
    input: ConfigureRevenuePolicyInput,
    actorId?: string
  ) {
    const policy = await prisma.customerRevenuePolicy.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        policyVersion: input.policyVersion || "1.0",
        renewalPreparationDays: input.renewalPreparationDays ?? 90,
        healthReviewDays: input.healthReviewDays ?? 60,
        engagementDays: input.engagementDays ?? 45,
        commercialReviewDays: input.commercialReviewDays ?? 30,
        riskThresholds: input.riskThresholds || { moderate: 30, high: 60, critical: 80 },
        alertCooldownHours: input.alertCooldownHours ?? 72,
        autoTaskGeneration: input.autoTaskGeneration ?? true,
        expansionRules: input.expansionRules || { utilizationGrowthPercent: 25, consecutiveHighUsageDays: 14 },
      },
      update: {
        policyVersion: input.policyVersion,
        renewalPreparationDays: input.renewalPreparationDays,
        healthReviewDays: input.healthReviewDays,
        engagementDays: input.engagementDays,
        commercialReviewDays: input.commercialReviewDays,
        riskThresholds: input.riskThresholds,
        alertCooldownHours: input.alertCooldownHours,
        autoTaskGeneration: input.autoTaskGeneration,
        expansionRules: input.expansionRules,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.revenue_policy.updated",
      targetType: "CustomerRevenuePolicy",
      targetId: policy.id,
      metadata: {
        policyVersion: policy.policyVersion,
        renewalPreparationDays: policy.renewalPreparationDays,
        healthReviewDays: policy.healthReviewDays,
        engagementDays: policy.engagementDays,
        commercialReviewDays: policy.commercialReviewDays,
        autoTaskGeneration: policy.autoTaskGeneration,
      },
    });

    return policy;
  }

  /**
   * Evaluates active contracts against policy milestone deadlines and generates
   * deterministic, deduplicated retention governance tasks.
   */
  public async generateScheduledRenewalTasks(
    workspaceId: string,
    contractId?: string,
    actorId?: string
  ) {
    const policy = await this.getPolicy(workspaceId);
    if (!policy.autoTaskGeneration) {
      return { generated: 0, skipped: 0, message: "Auto task generation is disabled in workspace policy." };
    }

    const contracts = await prisma.customerContract.findMany({
      where: {
        workspaceId,
        status: { in: ["ACTIVE", "RENEWAL_PENDING"] },
        ...(contractId ? { id: contractId } : {}),
      },
      include: {
        customerAccount: true,
        renewalOpportunities: {
          where: { stage: { notIn: ["RENEWED", "LOST"] } },
          take: 1,
        },
      },
    });

    let generated = 0;
    let skipped = 0;
    const now = Date.now();
    const milestones = [
      policy.renewalPreparationDays,
      policy.healthReviewDays,
      policy.engagementDays,
      policy.commercialReviewDays,
    ].sort((a, b) => b - a);

    for (const contract of contracts) {
      const daysUntilRenewal = Math.ceil(
        (new Date(contract.renewalDate).getTime() - now) / (1000 * 60 * 60 * 24)
      );

      // Only evaluate if renewal is within the max preparation window and hasn't already expired
      if (daysUntilRenewal > policy.renewalPreparationDays || daysUntilRenewal < 0) {
        continue;
      }

      for (const milestone of milestones) {
        if (daysUntilRenewal <= milestone) {
          const idempotencyKey = `RENEWAL-MILESTONE-${contract.id}-${milestone}`;

          // Check if timeline event or task already created with this idempotency key
          const existingEvent = await prisma.customerRenewalTimelineEvent.findFirst({
            where: {
              workspaceId,
              idempotencyKey,
            },
          });

          if (existingEvent) {
            skipped++;
            continue;
          }

          // Create CustomerSuccessTask
          const taskPriority = milestone <= policy.commercialReviewDays ? "HIGH" : "MEDIUM";
          const task = await prisma.customerSuccessTask.create({
            data: {
              workspaceId,
              customerAccountId: contract.customerAccountId,
              taskType: "RENEWAL_CHECK",
              title: `Renewal Milestone: ${milestone} Days Before Expiration (${contract.contractNumber})`,
              description: `Automated renewal governance milestone reached for contract ${contract.contractNumber} (${contract.name}). Renewal date: ${new Date(contract.renewalDate).toISOString().split("T")[0]}. Remaining days: ${daysUntilRenewal}.`,
              priority: taskPriority,
              status: "OPEN",
              dueAt: contract.renewalNoticeDeadline || contract.renewalDate,
              assignedUserId: contract.ownerUserId || undefined,
              evidence: {
                contractId: contract.id,
                contractNumber: contract.contractNumber,
                milestoneDays: milestone,
                daysRemaining: daysUntilRenewal,
                currency: contract.currency,
                annualRecurringValue: contract.annualRecurringValue,
              },
            },
          });

          // Link to open renewal opportunity if present
          const activeOpp = contract.renewalOpportunities[0];
          if (activeOpp) {
            await prisma.customerRenewalTimelineEvent.create({
              data: {
                workspaceId,
                renewalOpportunityId: activeOpp.id,
                eventType: "TASK_GENERATED",
                eventTitle: `Renewal Milestone Task Generated (${milestone}d)`,
                description: `Created retention task #${task.id} for renewal window at ${milestone} days (${daysUntilRenewal} days remaining).`,
                idempotencyKey,
                actorId: actorId || null,
                metadata: {
                  milestoneDays: milestone,
                  daysRemaining: daysUntilRenewal,
                  taskId: task.id,
                },
              },
            });
          }

          generated++;
        }
      }
    }

    return {
      generated,
      skipped,
      evaluatedContracts: contracts.length,
      message: `Generated ${generated} renewal milestone task(s); skipped ${skipped} duplicate(s).`,
    };
  }

  /**
   * Generates comprehensive, currency-aware revenue overview metrics for the executive console.
   */
  public async getRevenueOverview(
    workspaceId: string,
    preferredCurrency = "USD"
  ): Promise<RevenueOverviewMetrics> {
    const policy = await this.getPolicy(workspaceId);
    const now = new Date();
    const upcomingCutoff = new Date(now.getTime() + policy.renewalPreparationDays * 24 * 60 * 60 * 1000);

    // 1. Contracts Query
    const contracts = await prisma.customerContract.findMany({
      where: {
        workspaceId,
        currency: preferredCurrency,
      },
    });

    const activeContracts = contracts.filter((c) => ["ACTIVE", "RENEWAL_PENDING"].includes(c.status));
    const totalContractValue = activeContracts.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    const totalAnnualRecurringRevenue = activeContracts.reduce(
      (sum, c) => sum + (c.annualRecurringValue || 0),
      0
    );

    // 2. Renewal Opportunities Query
    const opportunities = await prisma.customerRenewalOpportunity.findMany({
      where: {
        workspaceId,
        currency: preferredCurrency,
      },
      include: {
        contract: true,
      },
    });

    // Upcoming renewals: targetDate <= upcomingCutoff and not finalized
    const upcomingRenewals = opportunities.filter((o) => {
      const target = new Date(o.targetDate);
      return target >= now && target <= upcomingCutoff && !["RENEWED", "LOST"].includes(o.stage);
    });

    const upcomingRenewalsValue = upcomingRenewals.reduce((sum, o) => sum + (o.renewalAmount || 0), 0);

    // Revenue at risk: HIGH or CRITICAL risk and not finalized
    const atRiskRenewals = opportunities.filter(
      (o) => ["HIGH", "CRITICAL"].includes(o.riskClassification) && !["RENEWED", "LOST"].includes(o.stage)
    );
    const revenueAtRiskValue = atRiskRenewals.reduce((sum, o) => sum + (o.renewalAmount || 0), 0);

    // Won and Lost renewals
    const wonRenewals = opportunities.filter((o) => o.stage === "RENEWED");
    const renewalsWonValue = wonRenewals.reduce((sum, o) => sum + (o.renewalAmount || 0), 0);

    const lostRenewals = opportunities.filter((o) => o.stage === "LOST");
    const renewalsLostValue = lostRenewals.reduce((sum, o) => sum + (o.renewalAmount || 0), 0);

    // Pipeline by Stage
    const pipelineByStage: Record<string, { count: number; value: number }> = {};
    for (const stage of RENEWAL_STAGES) {
      pipelineByStage[stage] = { count: 0, value: 0 };
    }
    for (const opp of opportunities) {
      const st = opp.stage;
      if (!pipelineByStage[st]) {
        pipelineByStage[st] = { count: 0, value: 0 };
      }
      pipelineByStage[st].count++;
      pipelineByStage[st].value = Math.round((pipelineByStage[st].value + (opp.renewalAmount || 0)) * 100) / 100;
    }

    // Risk Distribution
    const riskDistribution: Record<string, { count: number; value: number }> = {};
    for (const level of RENEWAL_RISK_LEVELS) {
      riskDistribution[level] = { count: 0, value: 0 };
    }
    for (const opp of opportunities) {
      const rl = opp.riskClassification || "INSUFFICIENT_DATA";
      if (!riskDistribution[rl]) {
        riskDistribution[rl] = { count: 0, value: 0 };
      }
      riskDistribution[rl].count++;
      riskDistribution[rl].value = Math.round((riskDistribution[rl].value + (opp.renewalAmount || 0)) * 100) / 100;
    }

    // 3. Expansion Pipeline
    const expansionOpportunities = await prisma.customerExpansionOpportunity.findMany({
      where: {
        workspaceId,
        currency: preferredCurrency,
      },
    });

    const totalDetected = expansionOpportunities.filter((e) => e.stage === "DETECTED").length;
    const totalQualified = expansionOpportunities.filter((e) =>
      ["QUALIFIED", "PROPOSAL_IN_PROGRESS"].includes(e.stage)
    ).length;
    const openExpansions = expansionOpportunities.filter(
      (e) => !["WON", "LOST", "DISMISSED"].includes(e.stage)
    );
    const expansionPipelineValue = openExpansions.reduce((sum, e) => sum + (e.estimatedValue || 0), 0);

    // 4. Retention Interventions (CustomerSuccessTasks and Events)
    const activeTasksCount = await prisma.customerSuccessTask.count({
      where: {
        workspaceId,
        taskType: { in: ["RENEWAL_CHECK", "AT_RISK_REVIEW"] },
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] },
      },
    });

    const overdueTasksCount = await prisma.customerSuccessTask.count({
      where: {
        workspaceId,
        taskType: { in: ["RENEWAL_CHECK", "AT_RISK_REVIEW"] },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lt: now },
      },
    });

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentTimelineEventsCount = await prisma.customerRenewalTimelineEvent.count({
      where: {
        workspaceId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    return {
      currency: preferredCurrency,
      totalActiveContracts: activeContracts.length,
      totalContractValue: Math.round(totalContractValue * 100) / 100,
      totalAnnualRecurringRevenue: Math.round(totalAnnualRecurringRevenue * 100) / 100,
      upcomingRenewalsCount: upcomingRenewals.length,
      upcomingRenewalsValue: Math.round(upcomingRenewalsValue * 100) / 100,
      revenueAtRiskValue: Math.round(revenueAtRiskValue * 100) / 100,
      revenueAtRiskCount: atRiskRenewals.length,
      renewalsWonValue: Math.round(renewalsWonValue * 100) / 100,
      renewalsLostValue: Math.round(renewalsLostValue * 100) / 100,
      pipelineByStage,
      riskDistribution,
      expansionPipeline: {
        totalDetected,
        totalQualified,
        pipelineValue: Math.round(expansionPipelineValue * 100) / 100,
        opportunitiesCount: openExpansions.length,
      },
      retentionInterventions: {
        activeTasksCount,
        overdueTasksCount,
        recentTimelineEventsCount,
      },
    };
  }
}

export const customerRevenuePolicyService = new CustomerRevenuePolicyService();
