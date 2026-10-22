import crypto from "crypto";
import { prisma } from "@flowforge/database";
import { WebhookEvent, CreateOutboundWebhookInput, UpdateOutboundWebhookInput } from "@flowforge/shared";
import { enqueueOutboundWebhook } from "../worker/outboundWebhookQueue.js";
import { entitlementService } from "./entitlements.js";

export class OutboundWebhookService {
  /**
   * Generates a cryptographically random webhook signing secret.
   */
  generateSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString("hex")}`;
  }

  /**
   * Registers a new outbound webhook endpoint for a workspace.
   */
  async createWebhook(workspaceId: string, input: CreateOutboundWebhookInput) {
    const quota = await entitlementService.checkOutboundWebhookQuota(workspaceId);
    if (!quota.allowed) {
      const error: any = new Error(quota.reason || "Outbound webhook endpoint quota reached for your workspace plan.");
      error.statusCode = 403;
      throw error;
    }

    const secret = this.generateSecret();

    const webhook = await prisma.outboundWebhook.create({
      data: {
        workspaceId,
        name: input.name,
        url: input.url,
        secret,
        events: input.events,
        active: true,
      },
    });

    return {
      webhook: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        createdAt: webhook.createdAt,
      },
      secret, // Disclosed only once upon creation
    };
  }

  /**
   * Lists all outbound webhooks for a workspace.
   */
  async listWebhooks(workspaceId: string) {
    return prisma.outboundWebhook.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { deliveries: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a single webhook endpoint.
   */
  async getWebhook(id: string, workspaceId: string) {
    const webhook = await prisma.outboundWebhook.findFirst({
      where: { id, workspaceId },
      include: {
        deliveries: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!webhook) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    return webhook;
  }

  /**
   * Updates an existing webhook endpoint.
   */
  async updateWebhook(id: string, workspaceId: string, input: UpdateOutboundWebhookInput) {
    const existing = await prisma.outboundWebhook.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    return prisma.outboundWebhook.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        url: input.url ?? existing.url,
        events: input.events ?? existing.events,
        active: input.active ?? existing.active,
      },
    });
  }

  /**
   * Deletes a webhook endpoint.
   */
  async deleteWebhook(id: string, workspaceId: string) {
    const existing = await prisma.outboundWebhook.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    await prisma.outboundWebhook.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Rotates a webhook's signing secret.
   */
  async rotateSecret(id: string, workspaceId: string) {
    const existing = await prisma.outboundWebhook.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    const newSecret = this.generateSecret();
    await prisma.outboundWebhook.update({
      where: { id },
      data: { secret: newSecret },
    });

    return { secret: newSecret };
  }

  /**
   * Dispatches a real platform event to all subscribed active webhooks for a workspace.
   */
  async emitEvent(workspaceId: string, eventType: WebhookEvent, payload: any) {
    try {
      const webhooks = await prisma.outboundWebhook.findMany({
        where: {
          workspaceId,
          active: true,
        },
      });

      // Filter endpoints that subscribed to this specific event
      const matching = webhooks.filter((wh) => wh.events.includes(eventType));
      if (matching.length === 0) return [];

      const deliveries = [];
      const eventId = `evt_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

      for (const webhook of matching) {
        const delivery = await prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            workspaceId,
            eventId,
            eventType,
            payload: payload || {},
            status: "PENDING",
            attempt: 1,
            maxAttempts: 3,
          },
        });

        await enqueueOutboundWebhook({
          deliveryId: delivery.id,
          webhookId: webhook.id,
          workspaceId,
          eventType,
          payload,
          attempt: 1,
        });

        deliveries.push(delivery);
      }

      return deliveries;
    } catch (err: any) {
      console.warn(`Failed to emit outbound webhook event ${eventType}: ${err.message}`);
      return [];
    }
  }

  /**
   * Lists delivery records for a webhook endpoint.
   */
  async getDeliveries(webhookId: string, workspaceId: string, limit = 20) {
    const webhook = await prisma.outboundWebhook.findFirst({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
  }

  /**
   * Retries a delivery attempt.
   */
  async redeliver(deliveryId: string, workspaceId: string) {
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, workspaceId },
      include: { webhook: true },
    });

    if (!delivery) {
      const error: any = new Error("Delivery record not found.");
      error.statusCode = 404;
      throw error;
    }

    // Reset status to PENDING and re-enqueue
    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        errorMessage: null,
      },
    });

    await enqueueOutboundWebhook({
      deliveryId: updated.id,
      webhookId: delivery.webhookId,
      workspaceId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      attempt: delivery.attempt + 1,
    });

    return updated;
  }

  /**
   * Sends a test ping event to verify connectivity and signature handling.
   */
  async sendTestPing(webhookId: string, workspaceId: string) {
    const webhook = await prisma.outboundWebhook.findFirst({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      const error: any = new Error("Webhook endpoint not found.");
      error.statusCode = 404;
      throw error;
    }

    const testPayload = {
      event: "ping",
      message: "Test ping notification from FlowForge Automation",
      timestamp: new Date().toISOString(),
      workspaceId,
    };

    const eventId = `evt_ping_${Date.now()}`;
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        workspaceId,
        eventId,
        eventType: "ping",
        payload: testPayload,
        status: "PENDING",
        attempt: 1,
        maxAttempts: 3,
      },
    });

    await enqueueOutboundWebhook({
      deliveryId: delivery.id,
      webhookId: webhook.id,
      workspaceId,
      eventType: "ping",
      payload: testPayload,
      attempt: 1,
    });

    return delivery;
  }
}

export const outboundWebhookService = new OutboundWebhookService();
