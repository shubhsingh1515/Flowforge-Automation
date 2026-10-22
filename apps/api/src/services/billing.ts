import Stripe from "stripe";
import { prisma, PlanTier, SubscriptionStatus } from "@flowforge/database";
import { getPlan, PLANS } from "@flowforge/shared";
import { config } from "../config.js";
import { entitlementService } from "./entitlements.js";

export class BillingService {
  private stripe: Stripe | null = null;

  constructor() {
    if (config.stripeSecretKey && !config.stripeSecretKey.startsWith("mock_")) {
      this.stripe = new Stripe(config.stripeSecretKey, {
        apiVersion: "2024-06-20" as any,
      });
    }
  }

  isLiveMode(): boolean {
    return this.stripe !== null;
  }

  /**
   * Lazily creates a customer on Stripe or generates a mock customer ID in development.
   */
  async getOrCreateCustomer(workspaceId: string, userEmail: string, userName: string): Promise<string> {
    const sub = await entitlementService.getOrCreateSubscription(workspaceId);

    if (sub.stripeCustomerId) {
      return sub.stripeCustomerId;
    }

    let customerId: string;

    if (this.stripe) {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        name: userName,
        metadata: {
          workspaceId,
        },
      });
      customerId = customer.id;
    } else {
      customerId = `cus_mock_${workspaceId.substring(0, 8)}_${Date.now().toString(36)}`;
    }

    await prisma.workspaceSubscription.update({
      where: { workspaceId },
      data: { stripeCustomerId: customerId },
    });

    return customerId;
  }

  /**
   * Creates a hosted Checkout Session for upgrading to Pro or Business.
   */
  async createCheckoutSession(params: {
    workspaceId: string;
    targetPlan: "PRO" | "BUSINESS";
    userEmail: string;
    userName: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const { workspaceId, targetPlan, userEmail, userName, successUrl, cancelUrl } = params;
    const plan = PLANS[targetPlan];

    if (!plan) {
      throw new Error(`Invalid plan tier: ${targetPlan}`);
    }

    const customerId = await this.getOrCreateCustomer(workspaceId, userEmail, userName);

    if (this.stripe) {
      const priceId = targetPlan === "PRO" ? config.stripePricePro : config.stripePriceBusiness;

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product_data: {
                name: `FlowForge Automation — ${plan.name} Plan`,
                description: plan.description,
              },
              unit_amount: plan.priceMonthlyCents,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          workspaceId,
          targetPlan,
        },
        subscription_data: {
          metadata: {
            workspaceId,
            targetPlan,
          },
        },
      });

      return {
        url: session.url || successUrl,
        sessionId: session.id,
      };
    }

    // In Mock / Test mode without Stripe credentials
    const mockSessionId = `cs_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const redirectUrl = new URL(successUrl);
    redirectUrl.searchParams.set("mock_checkout", "success");
    redirectUrl.searchParams.set("session_id", mockSessionId);
    redirectUrl.searchParams.set("plan", targetPlan);

    return {
      url: redirectUrl.toString(),
      sessionId: mockSessionId,
    };
  }

  /**
   * Creates a customer billing portal session for payment method & invoice management.
   */
  async createPortalSession(workspaceId: string, userEmail: string, userName: string, returnUrl: string): Promise<{ url: string }> {
    const customerId = await this.getOrCreateCustomer(workspaceId, userEmail, userName);

    if (this.stripe) {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    }

    // Mock Portal Redirect in dev
    const mockPortalUrl = new URL(returnUrl);
    mockPortalUrl.searchParams.set("mock_portal", "open");
    return { url: mockPortalUrl.toString() };
  }

  /**
   * Requests subscription cancellation (defaulting to cancel at period end).
   */
  async cancelSubscription(workspaceId: string, atPeriodEnd = true) {
    const sub = await entitlementService.getOrCreateSubscription(workspaceId);

    if (!sub.stripeSubscriptionId) {
      // Free plan or unlinked subscription
      await prisma.workspaceSubscription.update({
        where: { workspaceId },
        data: {
          status: SubscriptionStatus.CANCELED,
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
        },
      });

      return { success: true, effectiveDate: new Date() };
    }

    if (this.stripe) {
      if (atPeriodEnd) {
        await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } else {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      }
    }

    const effectiveDate = sub.currentPeriodEnd || new Date();

    await prisma.workspaceSubscription.update({
      where: { workspaceId },
      data: {
        status: atPeriodEnd ? sub.status : SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: atPeriodEnd,
        canceledAt: new Date(),
      },
    });

    return { success: true, effectiveDate };
  }

  /**
   * Constructs and verifies Stripe Webhook signature.
   */
  constructWebhookEvent(rawBody: string | Buffer, signature: string): any {
    if (this.stripe && config.stripeWebhookSecret) {
      return this.stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    }

    // If running in development/test without live webhook secret, parse JSON payload safely
    try {
      const payloadString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
      return JSON.parse(payloadString);
    } catch {
      throw new Error("Invalid webhook JSON payload.");
    }
  }

  /**
   * Processes a verified Stripe billing webhook event idempotently.
   */
  async handleWebhookEvent(event: any): Promise<{ handled: boolean; eventType: string }> {
    const eventId = event.id || `evt_mock_${Date.now()}`;
    const eventType = event.type || "unknown";

    // 1. Idempotency Check in DB
    const existing = await prisma.billingWebhookEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      console.log(`Billing webhook event ${eventId} (${eventType}) was already processed. Skipping duplicate.`);
      return { handled: true, eventType };
    }

    // 2. Event Dispatching
    const dataObject = event.data?.object || {};
    const metadata = dataObject.metadata || {};
    const workspaceId = metadata.workspaceId || dataObject.client_reference_id;

    switch (eventType) {
      case "checkout.session.completed": {
        const targetPlan = (metadata.targetPlan as PlanTier) || PlanTier.PRO;
        const customerId = dataObject.customer;
        const subscriptionId = dataObject.subscription;

        if (workspaceId) {
          await prisma.workspaceSubscription.upsert({
            where: { workspaceId },
            create: {
              workspaceId,
              planTier: targetPlan,
              status: SubscriptionStatus.ACTIVE,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            update: {
              planTier: targetPlan,
              status: SubscriptionStatus.ACTIVE,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              cancelAtPeriodEnd: false,
              canceledAt: null,
            },
          });
          console.log(`Activated plan ${targetPlan} for workspace ${workspaceId}`);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subId = dataObject.id;
        const status = dataObject.status;
        const cancelAtPeriodEnd = Boolean(dataObject.cancel_at_period_end);
        const periodStart = dataObject.current_period_start ? new Date(dataObject.current_period_start * 1000) : new Date();
        const periodEnd = dataObject.current_period_end ? new Date(dataObject.current_period_end * 1000) : null;
        const targetPlan = (metadata.targetPlan as PlanTier) || PlanTier.PRO;

        let dbStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE;
        if (status === "trialing") dbStatus = SubscriptionStatus.TRIALING;
        else if (status === "past_due") dbStatus = SubscriptionStatus.PAST_DUE;
        else if (status === "canceled") dbStatus = SubscriptionStatus.CANCELED;
        else if (status === "unpaid") dbStatus = SubscriptionStatus.UNPAID;
        else if (status === "incomplete") dbStatus = SubscriptionStatus.INCOMPLETE;

        if (workspaceId) {
          await prisma.workspaceSubscription.updateMany({
            where: { workspaceId },
            data: {
              status: dbStatus,
              planTier: targetPlan,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd,
              stripeSubscriptionId: subId,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (workspaceId) {
          await prisma.workspaceSubscription.updateMany({
            where: { workspaceId },
            data: {
              status: SubscriptionStatus.CANCELED,
              planTier: PlanTier.FREE,
              cancelAtPeriodEnd: false,
              canceledAt: new Date(),
            },
          });
          console.log(`Subscription deleted: Workspace ${workspaceId} reverted to FREE plan.`);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const customerId = dataObject.customer;
        if (customerId) {
          await prisma.workspaceSubscription.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              status: SubscriptionStatus.ACTIVE,
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const customerId = dataObject.customer;
        if (customerId) {
          await prisma.workspaceSubscription.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              status: SubscriptionStatus.PAST_DUE,
            },
          });
        }
        break;
      }

      default:
        console.log(`Unhandled billing webhook event type: ${eventType}`);
        break;
    }

    // 3. Record event in durable webhook ledger
    await prisma.billingWebhookEvent.create({
      data: {
        eventId,
        eventType,
        provider: "STRIPE",
        payload: event as any,
        processedAt: new Date(),
      },
    });

    return { handled: true, eventType };
  }
}

export const billingService = new BillingService();
