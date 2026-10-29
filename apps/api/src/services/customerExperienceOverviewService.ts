import { prisma } from "@flowforge/database";
import { customerExperienceMetricsService } from "./customerExperienceMetricsService.js";
import { voiceOfCustomerService } from "./voiceOfCustomerService.js";

export class CustomerExperienceOverviewService {
  /**
   * Retrieves a consolidated executive portfolio overview of customer experience.
   */
  public async getOverview(workspaceId: string, customerAccountId?: string) {
    const feedbackWhere: any = { workspaceId };
    const issueWhere: any = {
      workspaceId,
      status: { notIn: ["RESOLVED", "CLOSED", "WONT_FIX"] },
      severity: { in: ["CRITICAL", "HIGH"] },
    };
    const actionPlanWhere: any = {
      workspaceId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      dueDate: { lt: new Date() },
    };

    if (customerAccountId) {
      feedbackWhere.customerAccountId = customerAccountId;
      issueWhere.customerAccountId = customerAccountId;
      actionPlanWhere.issue = { customerAccountId };
    }

    const [
      totalFeedbackCount,
      unreviewedFeedbackCount,
      openHighSeverityIssuesCount,
      overdueActionPlansCount,
      recentFeedback,
      npsResult,
      csatResult,
      themeAnalytics,
    ] = await Promise.all([
      prisma.customerFeedbackRecord.count({ where: feedbackWhere }),
      prisma.customerFeedbackRecord.count({
        where: {
          ...feedbackWhere,
          status: { in: ["RECEIVED", "REVIEW_REQUIRED"] },
        },
      }),
      prisma.customerExperienceIssue.count({ where: issueWhere }),
      prisma.customerExperienceActionPlan.count({ where: actionPlanWhere }),
      prisma.customerFeedbackRecord.findMany({
        where: feedbackWhere,
        orderBy: { submissionTimestamp: "desc" },
        take: 5,
        include: {
          customerAccount: { select: { id: true, name: true, slug: true } },
          classifications: { take: 1, orderBy: { createdAt: "desc" } },
        },
      }),
      customerExperienceMetricsService.evaluateMetrics(workspaceId, {
        metricType: "NPS",
        evaluationWindow: "LAST_30_DAYS",
        customerAccountId,
      }),
      customerExperienceMetricsService.evaluateMetrics(workspaceId, {
        metricType: "CSAT",
        evaluationWindow: "LAST_30_DAYS",
        customerAccountId,
      }),
      voiceOfCustomerService.getThemeAnalytics(workspaceId, 30),
    ]);

    return {
      totalFeedbackCount,
      unreviewedFeedbackCount,
      openHighSeverityIssuesCount,
      overdueActionPlansCount,
      nps: {
        score: npsResult.score,
        status: npsResult.status,
        sampleCount: npsResult.sampleCount,
        breakdown: npsResult.breakdown,
      },
      csat: {
        score: csatResult.score,
        status: csatResult.status,
        sampleCount: csatResult.sampleCount,
        breakdown: csatResult.breakdown,
      },
      recentFeedback,
      topThemes: themeAnalytics.themes.slice(0, 5),
    };
  }
}

export const customerExperienceOverviewService = new CustomerExperienceOverviewService();
