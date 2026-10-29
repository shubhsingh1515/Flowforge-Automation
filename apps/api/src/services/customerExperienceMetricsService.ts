import { prisma } from "@flowforge/database";
import { ExperienceMetricQuery, MetricType } from "@flowforge/shared";

export class CustomerExperienceMetricsService {
  /**
   * Resolves date bounds for the evaluation window.
   */
  private getWindowDates(window: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    if (window === "LAST_30_DAYS") {
      startDate.setDate(endDate.getDate() - 30);
    } else if (window === "LAST_90_DAYS") {
      startDate.setDate(endDate.getDate() - 90);
    } else {
      startDate.setFullYear(endDate.getFullYear() - 5);
    }

    return { startDate, endDate };
  }

  /**
   * Deterministically calculates customer experience metrics.
   */
  public async evaluateMetrics(workspaceId: string, query: ExperienceMetricQuery) {
    const { startDate, endDate } = this.getWindowDates(query.evaluationWindow);

    const where: any = {
      workspaceId,
      submittedAt: { gte: startDate, lte: endDate },
    };

    if (query.customerAccountId) {
      where.customerAccountId = query.customerAccountId;
    }

    if (query.metricType === "NPS") {
      where.surveyDefinition = { surveyType: "NPS" };
    } else if (query.metricType === "CSAT") {
      where.surveyDefinition = { surveyType: "CSAT" };
    } else if (query.metricType === "CES") {
      where.surveyDefinition = { surveyType: "CES" };
    }

    const responses = await prisma.customerSurveyResponse.findMany({
      where,
      select: {
        id: true,
        primaryScore: true,
        scoreClassification: true,
        submittedAt: true,
      },
    });

    const sampleCount = responses.filter((r) => r.primaryScore !== null).length;
    const MINIMUM_SAMPLE_SIZE = 5;

    // Check sample size constraint
    if (sampleCount < MINIMUM_SAMPLE_SIZE) {
      const evaluation = await prisma.customerExperienceMetricEvaluation.create({
        data: {
          workspaceId,
          metricType: query.metricType,
          evaluationWindow: query.evaluationWindow,
          startDate,
          endDate,
          sampleCount,
          score: null,
          status: sampleCount === 0 ? "NO_DATA" : "INSUFFICIENT_DATA",
          breakdownJson: {
            reason: sampleCount === 0 ? "No responses recorded." : `Sample size (${sampleCount}) is below minimum threshold (${MINIMUM_SAMPLE_SIZE}).`,
            sampleCount,
            minRequired: MINIMUM_SAMPLE_SIZE,
          },
          customerAccountId: query.customerAccountId,
        },
      });

      return {
        metricType: query.metricType,
        evaluationWindow: query.evaluationWindow,
        status: evaluation.status,
        sampleCount,
        score: null,
        breakdown: evaluation.breakdownJson,
        startDate,
        endDate,
      };
    }

    // Deterministic Calculation based on Metric Type
    let calculatedScore: number | null = null;
    let breakdown: any = {};

    if (query.metricType === "NPS") {
      let promoters = 0;
      let passives = 0;
      let detractors = 0;

      for (const r of responses) {
        if (r.primaryScore !== null) {
          if (r.primaryScore >= 9) promoters++;
          else if (r.primaryScore >= 7) passives++;
          else detractors++;
        }
      }

      const promoterPct = (promoters / sampleCount) * 100;
      const detractorPct = (detractors / sampleCount) * 100;
      calculatedScore = Math.round(promoterPct - detractorPct);

      breakdown = {
        promoters,
        passives,
        detractors,
        promoterPct: Math.round(promoterPct * 10) / 10,
        detractorPct: Math.round(detractorPct * 10) / 10,
        passivePct: Math.round(((passives / sampleCount) * 100) * 10) / 10,
        totalResponses: sampleCount,
      };
    } else if (query.metricType === "CSAT") {
      let satisfied = 0;
      let neutral = 0;
      let dissatisfied = 0;

      for (const r of responses) {
        if (r.primaryScore !== null) {
          if (r.primaryScore >= 4) satisfied++;
          else if (r.primaryScore === 3) neutral++;
          else dissatisfied++;
        }
      }

      calculatedScore = Math.round((satisfied / sampleCount) * 100);
      breakdown = {
        satisfied,
        neutral,
        dissatisfied,
        satisfactionRate: calculatedScore,
        totalResponses: sampleCount,
      };
    } else if (query.metricType === "CES") {
      let lowEffortCount = 0;
      let sum = 0;

      for (const r of responses) {
        if (r.primaryScore !== null) {
          sum += r.primaryScore;
          if (r.primaryScore >= 5) lowEffortCount++;
        }
      }

      calculatedScore = Math.round((sum / sampleCount) * 10) / 10;
      breakdown = {
        averageRating: calculatedScore,
        lowEffortCount,
        lowEffortPct: Math.round((lowEffortCount / sampleCount) * 100),
        totalResponses: sampleCount,
      };
    } else {
      // General feedback
      calculatedScore = sampleCount;
      breakdown = { totalResponses: sampleCount };
    }

    const evaluation = await prisma.customerExperienceMetricEvaluation.create({
      data: {
        workspaceId,
        metricType: query.metricType,
        evaluationWindow: query.evaluationWindow,
        startDate,
        endDate,
        sampleCount,
        score: calculatedScore,
        status: "VALID",
        breakdownJson: breakdown,
        customerAccountId: query.customerAccountId,
      },
    });

    return {
      metricType: query.metricType,
      evaluationWindow: query.evaluationWindow,
      status: "VALID",
      sampleCount,
      score: calculatedScore,
      breakdown,
      startDate,
      endDate,
    };
  }

  /**
   * Retrieves historical evaluations.
   */
  public async getHistory(workspaceId: string, metricType?: string) {
    const where: any = { workspaceId };
    if (metricType) where.metricType = metricType;

    return prisma.customerExperienceMetricEvaluation.findMany({
      where,
      orderBy: { evaluatedAt: "desc" },
      take: 20,
    });
  }
}

export const customerExperienceMetricsService = new CustomerExperienceMetricsService();
