import { prisma } from "@flowforge/database";
import { UsageAlertConfigInput, UsageForecastDto } from "@flowforge/shared";
import { entitlementService } from "./entitlements.js";
import { notificationService } from "./notifications.js";

export class UsageAlertsService {
  async getUsageForecast(workspaceId: string): Promise<UsageForecastDto> {
    const entitlements = await entitlementService.getWorkspaceEntitlements(workspaceId);
    const planAllowance = entitlements.plan.maxExecutionsPerMonth;

    // Determine current billing period
    const sub = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
    });

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
      periodStart = new Date(sub.currentPeriodStart);
      periodEnd = new Date(sub.currentPeriodEnd);
    } else {
      // Calendar month fallback
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const totalPeriodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
    const elapsedPeriodMs = Math.max(1, now.getTime() - periodStart.getTime());

    const daysTotal = Math.max(1, Math.round(totalPeriodMs / (24 * 60 * 60 * 1000)));
    const daysElapsed = Math.min(daysTotal, Math.max(1, Math.round(elapsedPeriodMs / (24 * 60 * 60 * 1000))));
    const daysRemaining = Math.max(0, daysTotal - daysElapsed);

    // Fetch usage records in this period
    const usageRecords = await prisma.usageRecord.findMany({
      where: {
        workspaceId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        quantity: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    // Group daily usage
    const dailyMap = new Map<string, number>();
    let currentConsumption = 0;

    for (const rec of usageRecords) {
      const d = rec.createdAt;
      const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + rec.quantity);
      currentConsumption += rec.quantity;
    }

    const dailyUsageHistory = Array.from(dailyMap.entries()).map(([date, quantity]) => ({
      date,
      quantity,
    }));

    const percentUsed = planAllowance > 0 ? Math.round((currentConsumption / planAllowance) * 100) : 0;
    const burnRatePerDay = Math.round((currentConsumption / daysElapsed) * 10) / 10;
    const projectedAdditional = Math.round(burnRatePerDay * daysRemaining);
    const projectedPeriodEndTotal = currentConsumption + projectedAdditional;
    const projectedPercentOfAllowance = planAllowance > 0 ? Math.round((projectedPeriodEndTotal / planAllowance) * 100) : 0;
    const isProjectedToExceed = projectedPercentOfAllowance > 100 ? projectedPercentOfAllowance - 100 : 0;

    let forecastConfidence: "HIGH" | "MEDIUM" | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA";
    if (daysElapsed >= 7 && currentConsumption >= 10) {
      forecastConfidence = "HIGH";
    } else if (daysElapsed >= 2) {
      forecastConfidence = "MEDIUM";
    }

    const explanation =
      daysElapsed < 2
        ? "Early in billing period; projection reflects current run rate and will stabilize as more workflow runs occur."
        : `Based on your average rate of ${burnRatePerDay} executions/day over the last ${daysElapsed} days, you are projected to reach ~${projectedPeriodEndTotal} executions by ${periodEnd.toLocaleDateString()}.`;

    return {
      billingPeriodStart: periodStart.toISOString(),
      billingPeriodEnd: periodEnd.toISOString(),
      daysElapsed,
      daysTotal,
      currentConsumption,
      planAllowance,
      percentUsed,
      burnRatePerDay,
      projectedPeriodEndTotal,
      projectedPercentOfAllowance,
      isProjectedToExceed,
      forecastConfidence,
      explanation,
      dailyUsageHistory,
    };
  }

  async getAlertConfig(workspaceId: string) {
    let config = await prisma.workspaceUsageAlertConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      config = await prisma.workspaceUsageAlertConfig.create({
        data: {
          workspaceId,
          threshold50: true,
          threshold80: true,
          threshold90: true,
          threshold100: true,
          notifyEmail: true,
          notifyInApp: true,
        },
      });
    }

    const triggeredEvents = await prisma.workspaceUsageAlertEvent.findMany({
      where: { workspaceId },
      orderBy: { triggeredAt: "desc" },
      take: 10,
    });

    return { config, triggeredEvents };
  }

  async updateAlertConfig(workspaceId: string, input: UsageAlertConfigInput) {
    return prisma.workspaceUsageAlertConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...input,
      },
      update: {
        ...input,
      },
    });
  }

  async evaluateUsageThresholds(workspaceId: string): Promise<{ triggeredAlerts: number[] }> {
    const { config } = await this.getAlertConfig(workspaceId);
    const entitlements = await entitlementService.getWorkspaceEntitlements(workspaceId);
    const allowance = entitlements.plan.maxExecutionsPerMonth;
    const consumed = entitlements.quotas.executions.current;

    if (allowance <= 0) return { triggeredAlerts: [] };

    const percentUsed = Math.round((consumed / allowance) * 100);
    const now = new Date();
    const billingCycleKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const thresholdsToCheck = [
      { pct: 50, enabled: config.threshold50 },
      { pct: 80, enabled: config.threshold80 },
      { pct: 90, enabled: config.threshold90 },
      { pct: 100, enabled: config.threshold100 },
    ];

    const triggeredAlerts: number[] = [];

    for (const t of thresholdsToCheck) {
      if (t.enabled && percentUsed >= t.pct) {
        // Try creating deduplicated alert event
        try {
          await prisma.workspaceUsageAlertEvent.create({
            data: {
              workspaceId,
              billingCycleKey,
              thresholdPercent: t.pct,
              executionsCount: consumed,
              quotaLimit: allowance,
            },
          });

          triggeredAlerts.push(t.pct);

          // Dispatch in-app notification
          if (config.notifyInApp) {
            const isExhausted = t.pct >= 100;
            await notificationService.createNotification({
              workspaceId,
              type: "USAGE_ALERT",
              category: isExhausted ? "error" : t.pct >= 80 ? "warning" : "info",
              title: `Monthly Usage Alert: ${t.pct}% of Quota Reached`,
              message: isExhausted
                ? `You have reached 100% of your plan allowance (${consumed}/${allowance} runs). Upgrade your subscription to avoid workflow execution pauses.`
                : `Your workspace has consumed ${consumed} of ${allowance} executions (${percentUsed}%).`,
              link: "/settings?tab=billing",
              metadata: { threshold: t.pct, consumed, allowance, percentUsed },
            });
          }
        } catch (err: any) {
          // Unique constraint violation (P2002) means this threshold was already triggered this cycle
          if (err.code !== "P2002") {
            console.error(`Error recording usage alert event for workspace ${workspaceId}:`, err);
          }
        }
      }
    }

    return { triggeredAlerts };
  }
}

export const usageAlertsService = new UsageAlertsService();
