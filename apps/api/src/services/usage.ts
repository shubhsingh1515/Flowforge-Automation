import { prisma } from "@flowforge/database";

export interface RecordUsageOptions {
  workspaceId: string;
  executionId: string;
  metricType?: string;
  quantity?: number;
}

export class UsageService {
  /**
   * Records billable execution usage with strict idempotency to prevent duplicate charges
   * caused by BullMQ worker retries, resumes, or replays.
   */
  async recordExecutionUsage(options: RecordUsageOptions) {
    const { workspaceId, executionId, metricType = "WORKFLOW_EXECUTION", quantity = 1 } = options;
    const idempotencyKey = `usage_${executionId}_${metricType}`;

    try {
      const record = await prisma.usageRecord.upsert({
        where: { idempotencyKey },
        update: {}, // No-op if already recorded
        create: {
          workspaceId,
          executionId,
          metricType,
          quantity,
          idempotencyKey,
        },
      });

      return { recorded: true, record };
    } catch (err: any) {
      // In case of unique constraint race condition
      const existing = await prisma.usageRecord.findUnique({
        where: { idempotencyKey },
      });
      return { recorded: false, record: existing };
    }
  }

  /**
   * Retrieves usage summary for the current billing period.
   */
  async getUsageForPeriod(workspaceId: string, periodStart: Date, periodEnd?: Date) {
    const records = await prisma.usageRecord.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: periodStart,
          ...(periodEnd ? { lte: periodEnd } : {}),
        },
      },
      select: {
        metricType: true,
        quantity: true,
        createdAt: true,
      },
    });

    let totalExecutions = 0;
    let totalSteps = 0;

    for (const r of records) {
      if (r.metricType === "WORKFLOW_EXECUTION") {
        totalExecutions += r.quantity;
      } else if (r.metricType === "STEP_EXECUTION") {
        totalSteps += r.quantity;
      }
    }

    return {
      periodStart,
      periodEnd: periodEnd || new Date(),
      totalExecutions,
      totalSteps,
      recordsCount: records.length,
    };
  }

  /**
   * Returns recent usage ledger records for audit trails.
   */
  async getRecentUsageHistory(workspaceId: string, limit = 50) {
    return prisma.usageRecord.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        metricType: true,
        quantity: true,
        executionId: true,
        createdAt: true,
      },
    });
  }
}

export const usageService = new UsageService();
