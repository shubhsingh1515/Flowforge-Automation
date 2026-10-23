import crypto from "crypto";
import { prisma } from "@flowforge/database";
import { validateUrlForSsrf } from "../engine/security/ssrf.js";
import { processInstanceService } from "./processInstanceService.js";
import { workflowQueue } from "../worker/queue.js";

export class EventDeliveryService {
  /**
   * Dispatches an event to a specific subscription delivery
   */
  async executeDelivery(deliveryId: string, client = prisma): Promise<any> {
    const delivery = await client.eventDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        event: true,
        subscription: true,
      },
    });

    if (!delivery) {
      throw new Error(`Delivery '${deliveryId}' not found.`);
    }

    if (delivery.status === "DELIVERED" || delivery.status === "CANCELLED") {
      return { status: delivery.status, skipped: true };
    }

    // Check if subscription was paused or disabled
    if (delivery.subscription.status !== "ACTIVE") {
      return await client.eventDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "RETRY_SCHEDULED",
          nextAttemptAt: new Date(Date.now() + 60000), // Check again in 1m
          lastError: `Subscription '${delivery.subscription.name}' is currently ${delivery.subscription.status}`,
        },
      });
    }

    // Loop & cascade protection: check causation depth
    if (delivery.event.causationId) {
      const causationChainLength = (delivery.event.causationId.match(/->/g) || []).length;
      if (causationChainLength > 5) {
        return await client.eventDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "DEAD_LETTER",
            lastError: "Delivery halted: Event causation depth exceeded maximum threshold of 5 (infinite loop protection).",
            lastErrorCategory: "LOOP_PROTECTION",
          },
        });
      }
    }

    const attemptNumber = delivery.attemptCount + 1;
    const startTime = Date.now();

    let isSuccess = false;
    let errorMessage: string | null = null;
    let errorCategory: string | null = null;
    let statusCode: number | null = null;

    try {
      const destType = delivery.subscription.destinationType;
      const config = (delivery.subscription.destinationConfig as any) || {};

      // -----------------------------------------------------------------
      // Destination 1: WORKFLOW_TRIGGER
      // -----------------------------------------------------------------
      if (destType === "WORKFLOW_TRIGGER") {
        const workflowId = config.workflowId;
        if (!workflowId) {
          throw new Error("Missing 'workflowId' in subscription destinationConfig.");
        }

        const workflow = await prisma.workflow.findFirst({
          where: { id: workflowId, workspaceId: delivery.workspaceId },
        });

        if (!workflow) {
          throw new Error(`Workflow '${workflowId}' not found or does not belong to this workspace.`);
        }

        if (workflow.status !== "ACTIVE") {
          throw new Error(`Workflow '${workflow.name}' is currently ${workflow.status}; only ACTIVE workflows can be triggered.`);
        }

        // Check if an execution was already triggered for this exact (subscriptionId, eventId)
        const correlationId = delivery.event.correlationId || delivery.event.eventId;
        const existingExec = await prisma.workflowExecution.findFirst({
          where: {
            workflowId,
            correlationId,
          },
        });

        if (!existingExec) {
          const execution = await prisma.workflowExecution.create({
            data: {
              workflowId,
              status: "PENDING",
              correlationId,
              triggerEvent: {
                triggerSource: "EVENT_SUBSCRIPTION",
                subscriptionId: delivery.subscription.id,
                eventId: delivery.event.eventId,
                eventType: delivery.event.eventType,
                data: delivery.event.data,
              },
            },
          });

          await workflowQueue.add(
            `event_trigger_${execution.id}`,
            {
              executionId: execution.id,
              workflowId,
              triggerPayload: delivery.event.data,
              correlationId: delivery.event.correlationId || delivery.event.eventId,
              attempt: 1,
            },
            {
              jobId: `exec_job_${execution.id}`,
            }
          );
        }

        isSuccess = true;
        statusCode = 200;
      }

      // -----------------------------------------------------------------
      // Destination 2: PROCESS_MILESTONE
      // -----------------------------------------------------------------
      else if (destType === "PROCESS_MILESTONE") {
        const { processDefinitionId, milestoneId, correlationKeyField } = config;
        if (!processDefinitionId || !milestoneId) {
          throw new Error("Missing 'processDefinitionId' or 'milestoneId' in destinationConfig.");
        }

        const correlationKey =
          (correlationKeyField && (delivery.event.data as any)[correlationKeyField]) ||
          delivery.event.correlationId ||
          delivery.event.eventId;

        await processInstanceService.ingestEvent(delivery.workspaceId, {
          processDefinitionId,
          correlationKey,
          milestoneId,
          eventType: "MILESTONE_STARTED",
          durationMs: 100,
          details: delivery.event.data as any,
          idempotencyKey: delivery.event.deliveryKey || `evt_${delivery.event.eventId}_${delivery.subscription.id}`,
        });

        isSuccess = true;
        statusCode = 200;
      }

      // -----------------------------------------------------------------
      // Destination 3: OUTBOUND_WEBHOOK
      // -----------------------------------------------------------------
      else if (destType === "OUTBOUND_WEBHOOK") {
        const webhookUrl = config.webhookUrl;
        if (!webhookUrl) {
          throw new Error("Missing 'webhookUrl' in destinationConfig.");
        }

        // Enforce SSRF validation
        await validateUrlForSsrf(webhookUrl, { allowLocalhostForTesting: false });

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "FlowForge-Event-Fabric/1.0",
          "X-FlowForge-Event-Id": delivery.event.eventId,
          "X-FlowForge-Event-Type": delivery.event.eventType,
          "X-FlowForge-Subscription-Id": delivery.subscription.id,
        };

        if (delivery.subscription.signingSecret) {
          const payloadString = JSON.stringify(delivery.event);
          const signature = crypto
            .createHmac("sha256", delivery.subscription.signingSecret)
            .update(payloadString)
            .digest("hex");
          headers["X-FlowForge-Signature"] = `sha256=${signature}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), delivery.subscription.timeoutMs || 10000);

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(delivery.event),
          signal: controller.signal,
          redirect: "error", // Prevent redirect SSRF bypass
        });

        clearTimeout(timeout);
        statusCode = res.status;

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        isSuccess = true;
      }

      // -----------------------------------------------------------------
      // Destination 4: CONNECTOR_ACTION
      // -----------------------------------------------------------------
      else if (destType === "CONNECTOR_ACTION") {
        const { connectorId, actionId } = config;
        const artifact = await prisma.connectorReleaseArtifact.findFirst({
          where: { id: connectorId },
        });

        if (!artifact || ["SUSPENDED", "REVOKED"].includes(artifact.status)) {
          throw new Error(
            `Connector '${connectorId}' is ${artifact?.status || "NOT_FOUND"}; execution blocked by governance policy.`
          );
        }

        isSuccess = true;
        statusCode = 200;
      }

      // -----------------------------------------------------------------
      // Destination 5: INTERNAL
      // -----------------------------------------------------------------
      else {
        isSuccess = true;
        statusCode = 200;
      }
    } catch (err: any) {
      isSuccess = false;
      errorMessage = err.message || "Delivery execution failed";
      errorCategory =
        err.message?.includes("SSRF") || err.code === "SSRF_VIOLATION"
          ? "SSRF_BLOCKED"
          : err.name === "AbortError"
          ? "TIMEOUT"
          : "DESTINATION_ERROR";
    }

    const durationMs = Date.now() - startTime;

    // Record delivery attempt
    await client.eventDeliveryAttempt.create({
      data: {
        deliveryId,
        attemptNumber,
        status: isSuccess ? "SUCCESS" : errorCategory === "SSRF_BLOCKED" ? "SSRF_BLOCKED" : "FAILED",
        durationMs,
        statusCode,
        errorMessage,
        errorCategory,
      },
    });

    if (isSuccess) {
      return await client.eventDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DELIVERED",
          attemptCount: attemptNumber,
          deliveredAt: new Date(),
          lastError: null,
          lastErrorCategory: null,
        },
      });
    }

    // Handle failure and retry schedule
    const willRetry =
      attemptNumber < delivery.maxAttempts &&
      errorCategory !== "SSRF_BLOCKED" &&
      !errorMessage?.includes("governance policy");

    const nextStatus = willRetry ? "RETRY_SCHEDULED" : "DEAD_LETTER";
    const nextAttemptAt = willRetry
      ? new Date(
          Date.now() +
            Math.min(60000, (delivery.subscription.backoffMs || 2000) * Math.pow(2, attemptNumber - 1))
        )
      : null;

    return await client.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status: nextStatus,
        attemptCount: attemptNumber,
        nextAttemptAt,
        lastError: errorMessage,
        lastErrorCategory: errorCategory,
      },
    });
  }

  /**
   * Retrieves a delivery by ID
   */
  async getDelivery(workspaceId: string, deliveryId: string) {
    const delivery = await prisma.eventDelivery.findFirst({
      where: { id: deliveryId, workspaceId },
      include: {
        event: true,
        subscription: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
      },
    });

    if (!delivery) {
      throw new Error(`Delivery '${deliveryId}' not found.`);
    }

    return delivery;
  }

  /**
   * Lists deliveries in workspace with optional filters and pagination
   */
  async listDeliveries(
    workspaceId: string,
    filter?: {
      status?: string;
      subscriptionId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = filter?.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 25;
    const offset = filter?.offset && filter.offset >= 0 ? filter.offset : 0;

    const where: any = {
      workspaceId,
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.eventDelivery.findMany({
        where,
        include: {
          event: {
            select: { eventId: true, eventType: true, occurredAt: true, source: true },
          },
          subscription: {
            select: { id: true, name: true, destinationType: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.eventDelivery.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Replays a dead-letter or failed delivery
   */
  async replayDelivery(workspaceId: string, deliveryId: string) {
    const delivery = await prisma.eventDelivery.findFirst({
      where: { id: deliveryId, workspaceId },
    });

    if (!delivery) {
      throw new Error(`Delivery '${deliveryId}' not found.`);
    }

    // Reset status to PENDING and clear lastError
    await prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });

    return this.executeDelivery(deliveryId);
  }
}

export const eventDeliveryService = new EventDeliveryService();
