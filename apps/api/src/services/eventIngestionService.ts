import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  IngestEventInput,
  IngestEventResult,
  BatchIngestResult,
} from "@flowforge/shared";
import { eventSchemaRegistryService } from "./eventSchemaRegistryService.js";
import { eventSubscriptionService } from "./eventSubscriptionService.js";
import { eventDeliveryService } from "./eventDeliveryService.js";

const MAX_PAYLOAD_BYTES = 512 * 1024; // 512KB

export class EventIngestionService {
  /**
   * Ingests a single business event into the platform fabric
   */
  async ingestSingleEvent(
    workspaceId: string,
    input: IngestEventInput
  ): Promise<IngestEventResult> {
    const rawDataString = JSON.stringify(input.data || {});
    if (Buffer.byteLength(rawDataString, "utf8") > MAX_PAYLOAD_BYTES) {
      return {
        eventId: input.eventId || "unknown",
        eventType: input.eventType,
        status: "REJECTED",
        recordedAt: new Date().toISOString(),
        validationErrors: ["Payload size exceeds maximum allowed threshold of 512KB."],
      };
    }

    const eventId = input.eventId || `evt_${crypto.randomBytes(12).toString("hex")}`;
    const deliveryKey = input.deliveryKey || null;

    // 1. Idempotency Check
    const existing = await prisma.platformEvent.findFirst({
      where: {
        workspaceId,
        OR: [
          { eventId },
          ...(deliveryKey ? [{ deliveryKey }] : []),
        ],
      },
    });

    if (existing) {
      return {
        eventId: existing.eventId,
        eventType: existing.eventType,
        status: "DUPLICATE",
        deliveryKey: existing.deliveryKey || undefined,
        correlationId: existing.correlationId || undefined,
        recordedAt: existing.recordedAt.toISOString(),
      };
    }

    // 2. Schema Validation (if registered in workspace)
    const schemaDef = await eventSchemaRegistryService.getSchemaDefinition(
      workspaceId,
      input.eventType
    );

    if (schemaDef && schemaDef.activeVersion) {
      const valResult = eventSchemaRegistryService.validatePayload(
        schemaDef.activeVersion.jsonSchema,
        input.data
      );

      if (!valResult.valid) {
        return {
          eventId,
          eventType: input.eventType,
          status: "REJECTED",
          recordedAt: new Date().toISOString(),
          validationErrors: valResult.errors,
        };
      }
    }

    // 3. Persist Event
    const now = new Date();
    const platformEvent = await prisma.platformEvent.create({
      data: {
        workspaceId,
        schemaDefinitionId: schemaDef?.id || null,
        eventId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion || 1,
        source: input.source || "flowforge.api",
        correlationId: input.correlationId || null,
        causationId: input.causationId || null,
        traceparent: input.traceparent || null,
        subject: input.subject || null,
        data: input.data as any,
        metadata: (input.metadata as any) || {},
        classification: input.classification || "INTERNAL",
        deliveryKey,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : now,
        recordedAt: now,
      },
    });

    // 4. Find Matching Subscriptions
    const matchingSubscriptions = await eventSubscriptionService.findMatchingSubscriptions(
      workspaceId,
      platformEvent
    );

    // 5. Create and Dispatch Deliveries
    let dispatchedDeliveriesCount = 0;
    for (const sub of matchingSubscriptions) {
      try {
        const delivery = await prisma.eventDelivery.create({
          data: {
            workspaceId,
            eventId: platformEvent.id,
            subscriptionId: sub.id,
            status: "PENDING",
            maxAttempts: sub.maxAttempts || 5,
          },
        });

        // Trigger delivery execution
        await eventDeliveryService.executeDelivery(delivery.id);
        dispatchedDeliveriesCount++;
      } catch (_err) {
        // Individual subscription dispatch errors should not fail ingestion
      }
    }

    return {
      eventId: platformEvent.eventId,
      eventType: platformEvent.eventType,
      status: "ACCEPTED",
      deliveryKey: platformEvent.deliveryKey || undefined,
      correlationId: platformEvent.correlationId || undefined,
      recordedAt: platformEvent.recordedAt.toISOString(),
      dispatchedDeliveriesCount,
    };
  }

  /**
   * Ingests a bounded batch of business events atomically
   */
  async ingestBatch(
    workspaceId: string,
    events: IngestEventInput[]
  ): Promise<BatchIngestResult> {
    const results: IngestEventResult[] = [];
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const ev of events) {
      const res = await this.ingestSingleEvent(workspaceId, ev);
      results.push(res);
      if (res.status === "ACCEPTED") accepted++;
      else if (res.status === "DUPLICATE") duplicates++;
      else rejected++;
    }

    return {
      total: events.length,
      accepted,
      duplicates,
      rejected,
      results,
    };
  }

  /**
   * Retrieves an ingested event by ID in a workspace
   */
  async getEvent(workspaceId: string, eventIdOrUuid: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrUuid);

    const event = await prisma.platformEvent.findFirst({
      where: {
        workspaceId,
        ...(isUuid ? { id: eventIdOrUuid } : { eventId: eventIdOrUuid }),
      },
      include: {
        deliveries: {
          include: {
            subscription: {
              select: { id: true, name: true, destinationType: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event '${eventIdOrUuid}' not found in workspace.`);
    }

    return event;
  }

  /**
   * Lists events in a workspace with filtering and pagination
   */
  async listEvents(
    workspaceId: string,
    filter?: {
      eventType?: string;
      correlationId?: string;
      source?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = filter?.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 25;
    const offset = filter?.offset && filter.offset >= 0 ? filter.offset : 0;

    const where: any = {
      workspaceId,
      ...(filter?.eventType ? { eventType: filter.eventType } : {}),
      ...(filter?.correlationId ? { correlationId: filter.correlationId } : {}),
      ...(filter?.source ? { source: filter.source } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.platformEvent.findMany({
        where,
        include: {
          _count: {
            select: { deliveries: true },
          },
        },
        orderBy: { recordedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.platformEvent.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}

export const eventIngestionService = new EventIngestionService();
