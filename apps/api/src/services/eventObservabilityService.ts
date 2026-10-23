import { prisma } from "@flowforge/database";
import { EventMetricsSummaryDto } from "@flowforge/shared";
import { incidentService } from "./incidentService.js";

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export class EventObservabilityService {
  /**
   * Retrieves aggregated event metrics and pipeline health for a workspace
   */
  async getMetrics(workspaceId: string, timeRangeHours = 24): Promise<EventMetricsSummaryDto> {
    const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

    const [
      totalEvents,
      activeSubsCount,
      deliveredCount,
      deadLetterCount,
      retriedCount,
      attempts,
    ] = await Promise.all([
      prisma.platformEvent.count({
        where: { workspaceId, recordedAt: { gte: cutoff } },
      }),
      prisma.eventSubscription.count({
        where: { workspaceId, status: "ACTIVE" },
      }),
      prisma.eventDelivery.count({
        where: { workspaceId, status: "DELIVERED", createdAt: { gte: cutoff } },
      }),
      prisma.eventDelivery.count({
        where: { workspaceId, status: "DEAD_LETTER", createdAt: { gte: cutoff } },
      }),
      prisma.eventDelivery.count({
        where: { workspaceId, attemptCount: { gt: 1 }, createdAt: { gte: cutoff } },
      }),
      prisma.eventDeliveryAttempt.findMany({
        where: {
          delivery: { workspaceId, createdAt: { gte: cutoff } },
          durationMs: { not: null },
        },
        select: { durationMs: true },
        take: 500,
      }),
    ]);

    const durations = attempts
      .map((a) => a.durationMs)
      .filter((d): d is number => d !== null && d !== undefined);

    const medianLatencyMs = calculatePercentile(durations, 50);
    const p95LatencyMs = calculatePercentile(durations, 95);

    // Operational Incident deduplication check
    if (deadLetterCount >= 10) {
      try {
        await incidentService.reportIncident({
          workspaceId,
          title: `Event Fabric Alert: Elevated Dead-Letter Volume (${deadLetterCount} events)`,
          severity: "HIGH",
          category: "QUEUE_SATURATION",
          sourceService: "EventFabric",
          correlationKey: `event_dead_letter_${workspaceId}`,
          rootCauseSummary: `High volume of event deliveries exceeded max retry attempts and entered DEAD_LETTER state within past ${timeRangeHours}h.`,
          candidateCauses: [
            "Downstream webhook endpoint outage or 5xx responses",
            "SSRF block on destination targets",
            "Connector action suspension or authentication revocation",
          ],
          suggestedAction: "DRAIN_UNHEALTHY_WORKERS",
          metadata: { deadLetterCount, totalEvents, timeRangeHours },
        });
      } catch (_err) {
        // Non-blocking
      }
    }

    return {
      ingestedCount: totalEvents,
      acceptedCount: totalEvents,
      duplicateCount: 0,
      rejectedCount: 0,
      deliveredCount,
      retriedCount,
      deadLetterCount,
      activeSubscriptions: activeSubsCount,
      medianLatencyMs,
      p95LatencyMs,
      timeRangeHours,
    };
  }
}

export const eventObservabilityService = new EventObservabilityService();
