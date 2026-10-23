import { prisma } from "@flowforge/database";
import {
  CreateEventSubscriptionInput,
  UpdateEventSubscriptionInput,
  DeclarativeFilterRule,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

/**
 * Safely extracts a nested property from an object using dot notation without eval
 */
export function getFieldValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null || typeof curr !== "object") {
      return undefined;
    }
    curr = curr[part];
  }
  return curr;
}

/**
 * Evaluates a declarative filter rule against a platform event
 */
export function evaluateFilterRule(event: any, rule: DeclarativeFilterRule | any): boolean {
  if (!rule || Object.keys(rule).length === 0) {
    return true; // Empty rule matches all
  }

  const op = rule.operator || (rule.conditions ? "AND" : undefined);

  if (op === "AND") {
    const conditions: any[] = rule.conditions || [];
    return conditions.every((c) => evaluateFilterRule(event, c));
  }

  if (op === "OR") {
    const conditions: any[] = rule.conditions || [];
    return conditions.some((c) => evaluateFilterRule(event, c));
  }

  const val = rule.field ? getFieldValue(event, rule.field) : undefined;

  switch (op) {
    case "EQUALS":
      return val === rule.value;
    case "NOT_EQUALS":
      return val !== rule.value;
    case "IN":
      return Array.isArray(rule.value) ? rule.value.includes(val) : false;
    case "CONTAINS":
      return typeof val === "string" && typeof rule.value === "string"
        ? val.includes(rule.value)
        : false;
    case "EXISTS":
      return val !== undefined && val !== null;
    case "GREATER_THAN":
      return typeof val === "number" && typeof rule.value === "number" ? val > rule.value : false;
    case "LESS_THAN":
      return typeof val === "number" && typeof rule.value === "number" ? val < rule.value : false;
    default:
      // If rule is simply a key-value object: { "data.status": "PENDING" }
      for (const [k, expected] of Object.entries(rule)) {
        if (k !== "operator" && k !== "conditions" && k !== "field" && k !== "value") {
          const actual = getFieldValue(event, k);
          if (actual !== expected) return false;
        }
      }
      return true;
  }
}

/**
 * Checks if a subscription's eventTypes list matches an event's eventType
 * Supports exact match, global wildcard "*", and namespace wildcards (e.g. "order.*")
 */
export function matchesEventType(subscribedTypes: string[], eventType: string): boolean {
  if (!subscribedTypes || subscribedTypes.length === 0) return false;

  for (const pattern of subscribedTypes) {
    if (pattern === "*" || pattern === eventType) {
      return true;
    }
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      if (eventType.startsWith(prefix + ".")) {
        return true;
      }
    }
  }

  return false;
}

export class EventSubscriptionService {
  /**
   * Creates a new event subscription
   */
  async createSubscription(
    workspaceId: string,
    userId: string,
    input: CreateEventSubscriptionInput
  ) {
    const subscription = await prisma.eventSubscription.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description,
        eventTypes: input.eventTypes,
        filterExpression: (input.filterExpression as any) || {},
        destinationType: input.destinationType,
        destinationConfig: (input.destinationConfig as any) || {},
        maxAttempts: input.maxAttempts || 5,
        backoffMs: input.backoffMs || 2000,
        timeoutMs: input.timeoutMs || 10000,
        concurrencyLimit: input.concurrencyLimit || 10,
        signingSecret: input.signingSecret,
        status: "ACTIVE",
        createdById: userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "EVENT_SUBSCRIPTION_CREATED",
      targetType: "EVENT_SUBSCRIPTION",
      targetId: subscription.id,
      metadata: { name: input.name, destinationType: input.destinationType },
    });

    return subscription;
  }

  /**
   * Retrieves a subscription by ID in workspace
   */
  async getSubscription(workspaceId: string, id: string) {
    const subscription = await prisma.eventSubscription.findFirst({
      where: { id, workspaceId },
      include: {
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new Error(`Event subscription '${id}' not found in workspace.`);
    }

    return {
      ...subscription,
      deliveriesCount: subscription._count.deliveries,
    };
  }

  /**
   * Lists subscriptions in workspace with optional filters
   */
  async listSubscriptions(
    workspaceId: string,
    filter?: {
      status?: string;
      destinationType?: string;
    }
  ) {
    const subscriptions = await prisma.eventSubscription.findMany({
      where: {
        workspaceId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.destinationType ? { destinationType: filter.destinationType } : {}),
      },
      include: {
        _count: {
          select: { deliveries: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return subscriptions.map((s) => ({
      ...s,
      deliveriesCount: s._count.deliveries,
    }));
  }

  /**
   * Updates a subscription
   */
  async updateSubscription(
    workspaceId: string,
    id: string,
    userId: string,
    input: UpdateEventSubscriptionInput
  ) {
    const existing = await prisma.eventSubscription.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new Error(`Event subscription '${id}' not found in workspace.`);
    }

    const updated = await prisma.eventSubscription.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.eventTypes ? { eventTypes: input.eventTypes } : {}),
        ...(input.filterExpression ? { filterExpression: input.filterExpression as any } : {}),
        ...(input.destinationType ? { destinationType: input.destinationType } : {}),
        ...(input.destinationConfig ? { destinationConfig: input.destinationConfig as any } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
        ...(input.backoffMs ? { backoffMs: input.backoffMs } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.concurrencyLimit ? { concurrencyLimit: input.concurrencyLimit } : {}),
        ...(input.signingSecret !== undefined ? { signingSecret: input.signingSecret } : {}),
        updatedAt: new Date(),
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "EVENT_SUBSCRIPTION_UPDATED",
      targetType: "EVENT_SUBSCRIPTION",
      targetId: id,
      metadata: input,
    });

    return updated;
  }

  /**
   * Pauses an active subscription
   */
  async pauseSubscription(workspaceId: string, id: string, userId: string) {
    return this.updateSubscription(workspaceId, id, userId, { status: "PAUSED" });
  }

  /**
   * Resumes a paused subscription
   */
  async resumeSubscription(workspaceId: string, id: string, userId: string) {
    return this.updateSubscription(workspaceId, id, userId, { status: "ACTIVE" });
  }

  /**
   * Finds all active subscriptions in a workspace that match a given event
   */
  async findMatchingSubscriptions(workspaceId: string, event: any) {
    const activeSubscriptions = await prisma.eventSubscription.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
      },
    });

    return activeSubscriptions.filter((sub) => {
      // 1. Event type match
      if (!matchesEventType(sub.eventTypes, event.eventType)) {
        return false;
      }

      // 2. Filter rule match
      if (!evaluateFilterRule(event, sub.filterExpression)) {
        return false;
      }

      return true;
    });
  }
}

export const eventSubscriptionService = new EventSubscriptionService();
