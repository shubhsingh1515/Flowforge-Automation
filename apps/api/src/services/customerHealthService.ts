import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { ConfigureHealthModelInput, CustomerHealthStatus } from "@flowforge/shared";
import { customerAdoptionService } from "./customerAdoptionService.js";

export class CustomerHealthService {
  /**
   * Configures or updates the health scoring model for a workspace.
   */
  public async configureModel(workspaceId: string, input: ConfigureHealthModelInput) {
    const highestModel = await prisma.customerHealthModel.findFirst({
      where: { workspaceId },
      orderBy: { version: "desc" },
    });

    const nextVersion = (highestModel?.version || 0) + 1;

    // Deactivate previous models
    await prisma.customerHealthModel.updateMany({
      where: { workspaceId, isActive: true },
      data: { isActive: false },
    });

    return prisma.customerHealthModel.create({
      data: {
        workspaceId,
        name: input.name,
        version: nextVersion,
        isActive: true,
        dimensions: input.dimensions,
        statusThresholds: input.statusThresholds,
      },
    });
  }

  /**
   * Retrieves the active health model for a workspace, creating a default if none exists.
   */
  public async getActiveModel(workspaceId: string) {
    let model = await prisma.customerHealthModel.findFirst({
      where: { workspaceId, isActive: true },
    });

    if (!model) {
      // Create default enterprise health model
      model = await prisma.customerHealthModel.create({
        data: {
          workspaceId,
          name: "Standard Enterprise Health Model v1",
          version: 1,
          isActive: true,
          dimensions: [
            {
              name: "Product Adoption",
              weight: 0.35,
              metricType: "ADOPTION",
              evaluationWindowDays: 30,
              missingDataBehavior: "FLAG_INSUFFICIENT",
              warningThreshold: 50,
              criticalThreshold: 25,
            },
            {
              name: "Onboarding Progress",
              weight: 0.25,
              metricType: "ONBOARDING",
              evaluationWindowDays: 60,
              missingDataBehavior: "ASSUME_BASELINE",
              warningThreshold: 60,
              criticalThreshold: 30,
            },
            {
              name: "SLA & Reliability",
              weight: 0.25,
              metricType: "SLA",
              evaluationWindowDays: 30,
              missingDataBehavior: "ASSUME_BASELINE",
              warningThreshold: 75,
              criticalThreshold: 50,
            },
            {
              name: "Support Burden",
              weight: 0.15,
              metricType: "SUPPORT",
              evaluationWindowDays: 30,
              missingDataBehavior: "ASSUME_BASELINE",
              warningThreshold: 60,
              criticalThreshold: 40,
            },
          ],
          statusThresholds: {
            healthyMin: 75,
            needsAttentionMin: 50,
            atRiskMin: 0,
          },
        },
      });
    }

    return model;
  }

  /**
   * Evaluates customer health deterministically based on real operational telemetry.
   */
  public async evaluateHealth(workspaceId: string, customerAccountId: string) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
      include: {
        journeys: { take: 10, orderBy: { startedAt: "desc" } },
        tasks: { take: 10, where: { status: "OPEN" } },
      },
    });
    if (!account) throw new HttpError(404, `Customer account '${customerAccountId}' not found.`);

    const model = await this.getActiveModel(workspaceId);
    const dimensions = (model.dimensions as any[]) || [];
    const thresholds = (model.statusThresholds as any) || { healthyMin: 75, needsAttentionMin: 50, atRiskMin: 0 };

    const dimensionScores: Record<string, number> = {};
    const influentialFactors: string[] = [];
    const missingDataDimensions: string[] = [];

    // 1. Evaluate Adoption
    const adoptionData = await customerAdoptionService.calculateAccountAdoption(workspaceId, account.id, 30);
    let adoptionScore = 80;
    if (adoptionData.totalActivityEvents === 0) {
      missingDataDimensions.push("Product Adoption");
      adoptionScore = 50; // Neutral baseline, not zero
      influentialFactors.push("Zero adoption telemetry events recorded in the last 30 days.");
    } else {
      adoptionScore = Math.min(100, Math.max(20, adoptionData.totalActivityEvents * 10));
      influentialFactors.push(`Recorded ${adoptionData.totalActivityEvents} product activity events.`);
    }
    dimensionScores["Product Adoption"] = adoptionScore;

    // 2. Evaluate Onboarding
    let onboardingScore = 85;
    const activeJourneys = account.journeys;
    const blockedJourneys = activeJourneys.filter((j) => j.status === "BLOCKED");
    const failedJourneys = activeJourneys.filter((j) => j.status === "FAILED");
    if (failedJourneys.length > 0) {
      onboardingScore = 25;
      influentialFactors.push(`${failedJourneys.length} customer journeys entered terminal FAILED state.`);
    } else if (blockedJourneys.length > 0) {
      onboardingScore = 45;
      influentialFactors.push(`${blockedJourneys.length} customer journeys currently BLOCKED at milestone checkpoints.`);
    } else if (account.lifecycleState === "ONBOARDING") {
      onboardingScore = 75;
      influentialFactors.push("Customer actively progressing through onboarding journey.");
    } else {
      onboardingScore = 95;
    }
    dimensionScores["Onboarding Progress"] = onboardingScore;

    // 3. Evaluate SLA & Service Reliability
    let slaScore = 90;
    const atRiskSlaJourneys = activeJourneys.filter((j) => j.slaStatus === "AT_RISK" || j.slaStatus === "BREACHED");
    if (atRiskSlaJourneys.length > 0) {
      slaScore = 40;
      influentialFactors.push(`${atRiskSlaJourneys.length} customer journey milestones breached configured SLAs.`);
    }
    dimensionScores["SLA & Reliability"] = slaScore;

    // 4. Evaluate Support Burden / Open Tasks
    let supportScore = 85;
    const urgentTasks = account.tasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH");
    if (urgentTasks.length > 2) {
      supportScore = 30;
      influentialFactors.push(`${urgentTasks.length} urgent/high priority customer success issues open.`);
    } else if (urgentTasks.length > 0) {
      supportScore = 60;
      influentialFactors.push(`${urgentTasks.length} high priority customer issue pending resolution.`);
    }
    dimensionScores["Support Burden"] = supportScore;

    // Calculate weighted total score
    let weightedSum = 0;
    let totalWeight = 0;
    for (const d of dimensions) {
      const score = dimensionScores[d.name] ?? 70;
      weightedSum += score * d.weight;
      totalWeight += d.weight;
    }

    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 75;

    // Determine status
    let healthStatus: CustomerHealthStatus = "HEALTHY";
    if (missingDataDimensions.length >= 2) {
      healthStatus = "INSUFFICIENT_DATA";
    } else if (overallScore >= thresholds.healthyMin) {
      healthStatus = "HEALTHY";
    } else if (overallScore >= thresholds.needsAttentionMin) {
      healthStatus = "NEEDS_ATTENTION";
    } else {
      healthStatus = "AT_RISK";
    }

    // Record evaluation
    const evaluation = await prisma.customerHealthEvaluation.create({
      data: {
        workspaceId,
        customerAccountId: account.id,
        healthModelId: model.id,
        score: overallScore,
        status: healthStatus,
        dimensionScores,
        influentialFactors,
        missingDataDimensions,
        confidence: missingDataDimensions.length > 0 ? 0.7 : 0.95,
      },
    });

    // Update customer account
    await prisma.customerAccount.update({
      where: { id: account.id },
      data: {
        healthStatus,
        healthScore: overallScore,
        lastHealthEvaluatedAt: new Date(),
        lifecycleState: healthStatus === "AT_RISK" ? "AT_RISK" : account.lifecycleState,
      },
    });

    return evaluation;
  }

  /**
   * Retrieves health history for a customer account.
   */
  public async getHealthHistory(workspaceId: string, customerAccountId: string, limit: number = 20) {
    return prisma.customerHealthEvaluation.findMany({
      where: { workspaceId, customerAccountId },
      orderBy: { evaluatedAt: "desc" },
      take: limit,
    });
  }
}

export const customerHealthService = new CustomerHealthService();
