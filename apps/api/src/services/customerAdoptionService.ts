import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { CreateAdoptionMetricInput } from "@flowforge/shared";

export class CustomerAdoptionService {
  /**
   * Defines an adoption metric.
   */
  public async createMetricDefinition(workspaceId: string, input: CreateAdoptionMetricInput) {
    const existing = await prisma.customerAdoptionMetricDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Adoption metric with slug '${input.slug}' already exists.`);
    }

    return prisma.customerAdoptionMetricDefinition.create({
      data: {
        workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        metricType: input.metricType,
        sourceEventType: input.sourceEventType,
        dataProductId: input.dataProductId,
        filterExpression: input.filterExpression,
        aggregationWindowDays: input.aggregationWindowDays,
        minSampleRequired: input.minSampleRequired,
      },
    });
  }

  /**
   * Lists adoption metric definitions.
   */
  public async listMetricDefinitions(workspaceId: string) {
    return prisma.customerAdoptionMetricDefinition.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Calculates adoption metrics for a specific customer account from Phase 22 platform events.
   */
  public async calculateAccountAdoption(
    workspaceId: string,
    customerAccountId: string,
    windowDays: number = 30
  ) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
    });
    if (!account) throw new HttpError(404, `Customer account '${customerAccountId}' not found.`);

    const metrics = await this.listMetricDefinitions(workspaceId);
    const windowStart = new Date(Date.now() - windowDays * 86400 * 1000);

    // Fetch account events in observation window
    const events = await prisma.platformEvent.findMany({
      where: {
        workspaceId,
        recordedAt: { gte: windowStart },
      },
      select: {
        id: true,
        eventType: true,
        data: true,
        recordedAt: true,
      },
      take: 500,
    });

    // Filter events matching customerAccountId (either in payload data or explicitly mapped)
    const accountEvents = events.filter((e) => {
      const data = e.data as any;
      return (
        data?.customerAccountId === customerAccountId ||
        data?.customerId === customerAccountId ||
        data?.accountSlug === account.slug
      );
    });

    const metricResults: Record<string, { value: number; sufficientSample: boolean; sampleCount: number }> = {};

    for (const m of metrics) {
      const matchingEvents = m.sourceEventType
        ? accountEvents.filter((e) => e.eventType === m.sourceEventType)
        : accountEvents;

      const sampleCount = matchingEvents.length;
      const sufficientSample = sampleCount >= m.minSampleRequired;

      metricResults[m.slug] = {
        value: sampleCount,
        sufficientSample,
        sampleCount,
      };
    }

    // Default adoption indicator
    const totalActivityEvents = accountEvents.length;
    const isEngaged = totalActivityEvents >= 5;

    return {
      customerAccountId: account.id,
      windowDays,
      totalActivityEvents,
      isEngaged,
      metrics: metricResults,
    };
  }
}

export const customerAdoptionService = new CustomerAdoptionService();
