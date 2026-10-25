import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { RenewalRiskLevel } from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export interface ContributingSignal {
  signalName: string;
  value: any;
  impact: number;
  description: string;
  sourceRef: string;
  timestamp: string;
}

export class RenewalRiskService {
  /**
   * Evaluates renewal risk deterministically and records the evaluation.
   */
  public async evaluateRenewalRisk(
    workspaceId: string,
    opportunityId: string,
    policyVersion: string = "1.0",
    actorId?: string
  ) {
    const opp = await prisma.customerRenewalOpportunity.findFirst({
      where: { id: opportunityId, workspaceId },
      include: {
        contract: true,
        customerAccount: {
          include: {
            healthEvaluations: {
              orderBy: { evaluatedAt: "desc" },
              take: 1,
            },
            riskAssessments: {
              where: { status: { in: ["OPEN", "INVESTIGATING", "MITIGATING"] } },
            },
            tasks: {
              where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } },
            },
            journeys: {
              where: { status: "BLOCKED" },
            },
          },
        },
      },
    });

    if (!opp) {
      throw new HttpError(404, `Renewal opportunity '${opportunityId}' not found.`);
    }

    const account = opp.customerAccount;
    const now = new Date();
    const targetDate = new Date(opp.targetDate);
    const daysUntilRenewal = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Handle Insufficient Data condition
    const latestHealth = account.healthEvaluations[0];
    const hasSufficientData = Boolean(
      account.healthStatus !== "INSUFFICIENT_DATA" ||
      account.healthScore !== null ||
      account.riskAssessments.length > 0 ||
      account.tasks.length > 0
    );

    if (!hasSufficientData) {
      const evaluation = await prisma.customerRenewalRiskEvaluation.create({
        data: {
          workspaceId,
          renewalOpportunityId: opp.id,
          policyVersion,
          riskLevel: "INSUFFICIENT_DATA",
          riskScore: 0,
          explanation: "Insufficient operational telemetry, health evaluations, or risk assessments to compute deterministic risk score.",
          contributingSignals: [],
          inputsSnapshot: {
            healthStatus: account.healthStatus,
            healthScore: account.healthScore,
            daysUntilRenewal,
            openRisksCount: account.riskAssessments.length,
          },
          isLatest: true,
        },
      });

      await prisma.customerRenewalOpportunity.update({
        where: { id: opp.id },
        data: { riskClassification: "INSUFFICIENT_DATA", riskScore: 0 },
      });

      return evaluation;
    }

    // Deterministic Rule Engine
    let totalScore = 10; // Baseline
    const signals: ContributingSignal[] = [];

    // Signal 1: Account Health Status
    if (account.healthStatus === "AT_RISK") {
      totalScore += 35;
      signals.push({
        signalName: "CUSTOMER_HEALTH_AT_RISK",
        value: account.healthStatus,
        impact: 35,
        description: "Customer account is in AT_RISK health state.",
        sourceRef: `CustomerAccount:${account.id}`,
        timestamp: (account.lastHealthEvaluatedAt || now).toISOString(),
      });
    } else if (account.healthStatus === "NEEDS_ATTENTION") {
      totalScore += 15;
      signals.push({
        signalName: "CUSTOMER_HEALTH_NEEDS_ATTENTION",
        value: account.healthStatus,
        impact: 15,
        description: "Customer account requires operational attention.",
        sourceRef: `CustomerAccount:${account.id}`,
        timestamp: (account.lastHealthEvaluatedAt || now).toISOString(),
      });
    }

    // Signal 2: Numeric Health Score
    if (account.healthScore !== null) {
      if (account.healthScore < 50) {
        totalScore += 25;
        signals.push({
          signalName: "LOW_HEALTH_SCORE",
          value: account.healthScore,
          impact: 25,
          description: `Health score is ${account.healthScore}/100 (below 50 threshold).`,
          sourceRef: latestHealth ? `CustomerHealthEvaluation:${latestHealth.id}` : `CustomerAccount:${account.id}`,
          timestamp: (latestHealth?.evaluatedAt || now).toISOString(),
        });
      } else if (account.healthScore < 70) {
        totalScore += 10;
        signals.push({
          signalName: "MODERATE_HEALTH_SCORE",
          value: account.healthScore,
          impact: 10,
          description: `Health score is ${account.healthScore}/100 (below 70 threshold).`,
          sourceRef: latestHealth ? `CustomerHealthEvaluation:${latestHealth.id}` : `CustomerAccount:${account.id}`,
          timestamp: (latestHealth?.evaluatedAt || now).toISOString(),
        });
      }
    }

    // Signal 3: Open High/Critical Customer Risks
    const highRisks = account.riskAssessments.filter(
      (r) => r.severity === "HIGH" || r.severity === "CRITICAL"
    );
    if (highRisks.length > 0) {
      const riskImpact = Math.min(30, highRisks.length * 15);
      totalScore += riskImpact;
      signals.push({
        signalName: "UNRESOLVED_CUSTOMER_RISKS",
        value: highRisks.length,
        impact: riskImpact,
        description: `${highRisks.length} open high/critical customer risk assessment(s) active.`,
        sourceRef: `CustomerRiskAssessment:${highRisks[0].id}`,
        timestamp: highRisks[0].createdAt.toISOString(),
      });
    }

    // Signal 4: Blocked Journey Instances
    if (account.journeys.length > 0) {
      totalScore += 20;
      signals.push({
        signalName: "BLOCKED_CUSTOMER_JOURNEY",
        value: account.journeys.length,
        impact: 20,
        description: `${account.journeys.length} customer journey milestone(s) are blocked.`,
        sourceRef: `CustomerJourneyInstance:${account.journeys[0].id}`,
        timestamp: account.journeys[0].updatedAt.toISOString(),
      });
    }

    // Signal 5: Renewal Proximity & Unadvanced Stage
    if (daysUntilRenewal <= 30 && (opp.stage === "UPCOMING" || opp.stage === "PREPARATION")) {
      totalScore += 20;
      signals.push({
        signalName: "RENEWAL_WINDOW_COMPRESSION",
        value: daysUntilRenewal,
        impact: 20,
        description: `Renewal is in ${daysUntilRenewal} days, but commercial stage is still '${opp.stage}'.`,
        sourceRef: `CustomerRenewalOpportunity:${opp.id}`,
        timestamp: now.toISOString(),
      });
    }

    // Signal 6: Unresolved Overdue Tasks
    const overdueTasks = account.tasks.filter((t) => t.dueAt && t.dueAt < now);
    if (overdueTasks.length > 0) {
      totalScore += 15;
      signals.push({
        signalName: "OVERDUE_SUCCESS_TASKS",
        value: overdueTasks.length,
        impact: 15,
        description: `${overdueTasks.length} customer success task(s) are overdue.`,
        sourceRef: `CustomerSuccessTask:${overdueTasks[0].id}`,
        timestamp: overdueTasks[0].dueAt?.toISOString() || now.toISOString(),
      });
    }

    // Normalized Score and Level Determination
    const finalScore = Math.min(100, Math.max(0, totalScore));
    let riskLevel: RenewalRiskLevel = "LOW";
    if (finalScore >= 80) {
      riskLevel = "CRITICAL";
    } else if (finalScore >= 60) {
      riskLevel = "HIGH";
    } else if (finalScore >= 30) {
      riskLevel = "MODERATE";
    }

    // Mark previous evaluations as not latest
    await prisma.customerRenewalRiskEvaluation.updateMany({
      where: { workspaceId, renewalOpportunityId: opp.id, isLatest: true },
      data: { isLatest: false },
    });

    const explanation = `Renewal risk evaluated as ${riskLevel} (${finalScore}/100) across ${signals.length} verified evidence signal(s).`;

    // Persist new evaluation
    const evaluation = await prisma.customerRenewalRiskEvaluation.create({
      data: {
        workspaceId,
        renewalOpportunityId: opp.id,
        policyVersion,
        riskLevel,
        riskScore: finalScore,
        explanation,
        contributingSignals: signals as any,
        inputsSnapshot: {
          healthStatus: account.healthStatus,
          healthScore: account.healthScore,
          daysUntilRenewal,
          openRisksCount: account.riskAssessments.length,
          overdueTasksCount: overdueTasks.length,
          blockedJourneysCount: account.journeys.length,
        },
        isLatest: true,
      },
    });

    // Update Opportunity risk level
    await prisma.customerRenewalOpportunity.update({
      where: { id: opp.id },
      data: {
        riskClassification: riskLevel,
        riskScore: finalScore,
        lastActivityAt: now,
      },
    });

    // Record Timeline Event
    await prisma.customerRenewalTimelineEvent.create({
      data: {
        workspaceId,
        renewalOpportunityId: opp.id,
        eventType: "RISK_EVALUATED",
        eventTitle: `Risk Evaluated: ${riskLevel} (${finalScore}/100)`,
        description: explanation,
        actorId: actorId || "SYSTEM",
        metadata: { evaluationId: evaluation.id, riskLevel, riskScore: finalScore },
      },
    });

    // If High or Critical, check cooldown and generate retention task
    if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
      await this.generateRetentionIntervention(workspaceId, opp.id, riskLevel, finalScore, signals);
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.renewal.risk_changed",
      targetType: "CustomerRenewalOpportunity",
      targetId: opp.id,
      metadata: { riskLevel, riskScore: finalScore, evaluationId: evaluation.id },
    });

    return evaluation;
  }

  /**
   * Idempotently generates a CustomerSuccessTask if risk is high/critical, respecting policy cooldown.
   */
  private async generateRetentionIntervention(
    workspaceId: string,
    opportunityId: string,
    riskLevel: string,
    riskScore: number,
    signals: ContributingSignal[]
  ) {
    const opp = await prisma.customerRenewalOpportunity.findUnique({
      where: { id: opportunityId },
    });
    if (!opp) return;

    // Check existing tasks for deduplication
    const taskTitle = `[Renewal Retention] Mitigate ${riskLevel} renewal risk for opportunity ${opp.opportunityNumber}`;
    const existing = await prisma.customerSuccessTask.findFirst({
      where: {
        workspaceId,
        customerAccountId: opp.customerAccountId,
        title: taskTitle,
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] },
      },
    });

    if (existing) {
      return; // Deduplicated, already active task exists
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (riskLevel === "CRITICAL" ? 3 : 7));

    await prisma.customerSuccessTask.create({
      data: {
        workspaceId,
        customerAccountId: opp.customerAccountId,
        title: taskTitle,
        description: `Deterministic revenue intelligence detected ${riskLevel} renewal risk (${riskScore}/100). Contributing factors: ${signals.map((s) => s.description).join("; ")}`,
        taskType: "RENEWAL_CHECK",
        priority: riskLevel === "CRITICAL" ? "URGENT" : "HIGH",
        status: "OPEN",
        assignedUserId: opp.ownerUserId,
        dueAt: dueDate,
      },
    });
  }

  /**
   * Retrieves evaluation history for an opportunity.
   */
  public async getRiskHistory(workspaceId: string, opportunityId: string) {
    return prisma.customerRenewalRiskEvaluation.findMany({
      where: { workspaceId, renewalOpportunityId: opportunityId },
      orderBy: { evaluationTimestamp: "desc" },
    });
  }
}

export const renewalRiskService = new RenewalRiskService();
