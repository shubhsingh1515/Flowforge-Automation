# FlowForge Automation SaaS — Billing Webhook Operations & Idempotency

## 1. Overview
FlowForge processes asynchronous billing events from payment gateways (Stripe) to synchronize subscription states, upgrade/downgrade tiers, record customer payment health, and maintain workspace entitlements.

Because webhook events can be delivered out of order or retried multiple times by the payment provider, FlowForge enforces strict **cryptographic signature verification** and **durable database idempotency**.

---

## 2. Webhook Ingestion Architecture

```
Stripe Event (e.g. checkout.session.completed)
                      │
                      ▼
[POST /api/v1/billing/webhook]
                      │
                      ├─▶ 1. Fastify Raw Body Verification (Stripe HMAC-SHA256)
                      │      (Uses STRIPE_WEBHOOK_SECRET)
                      │
                      ├─▶ 2. Idempotency Check in `BillingWebhookEvent`
                      │      ┌───────────────────────────────────┐
                      │      │ If stripeEventId exists:          │
                      │      │   return { received: true,        │
                      │      │            duplicate: true }      │
                      │      └───────────────────────────────────┘
                      │
                      ├─▶ 3. Handle Event State Machine:
                      │      - checkout.session.completed  ──▶ Activate tier & store stripeCustomerId
                      │      - customer.subscription.updated ──▶ Update tier, status & period
                      │      - customer.subscription.deleted ──▶ Downgrade workspace to FREE tier
                      │      - invoice.payment_succeeded   ──▶ Mark status ACTIVE & extend period
                      │      - invoice.payment_failed      ──▶ Mark status PAST_DUE (7-day grace)
                      │
                      └─▶ 4. Commit `BillingWebhookEvent` Record
                             (status: "PROCESSED", processedAt: now)
```

---

## 3. Supported Stripe Webhook Events

| Event Type | Trigger | FlowForge System Action |
|---|---|---|
| `checkout.session.completed` | Customer completes Stripe Checkout hosted flow | Extracts `client_reference_id` (workspaceId), metadata `planTier`, connects `stripeCustomerId` and `stripeSubscriptionId`, activates tier, and sets status `ACTIVE`. |
| `customer.subscription.created` | New recurring subscription registered | Links subscription ID to workspace and synchronizes period boundaries (`currentPeriodStart`, `currentPeriodEnd`). |
| `customer.subscription.updated` | Plan upgrade/downgrade, renewal, or cancellation toggle | Updates `planTier`, `status`, and `cancelAtPeriodEnd` flag. Resolves tier from price ID. |
| `customer.subscription.deleted` | Subscription canceled or terminated | Reverts workspace tier to `FREE`, sets status `CANCELED`, clears active subscription ID. Existing workflows and logs are preserved. |
| `invoice.payment_succeeded` | Monthly invoice paid successfully | Resets any past due status to `ACTIVE`, updates `currentPeriodStart` and `currentPeriodEnd`. |
| `invoice.payment_failed` | Recurring charge failed | Transitions workspace subscription status to `PAST_DUE`. Workspace enters 7-day grace period with administrative warning banner. |

---

## 4. Idempotency & Concurrency Guarantees

### Durable Webhook Ledger
Each inbound webhook event is verified against the `BillingWebhookEvent` table:
```prisma
model BillingWebhookEvent {
  id              String   @id @default(uuid())
  stripeEventId   String   @unique
  eventType       String
  payload         Json
  status          String   @default("PROCESSED")
  processedAt     DateTime @default(now())
  createdAt       DateTime @default(now())

  @@index([stripeEventId])
  @@index([eventType])
}
```

### Ingestion Flow:
1. When a webhook arrives with `id: evt_12345`, the system queries `findUnique({ where: { stripeEventId: 'evt_12345' } })`.
2. If the record exists, the server immediately logs:
   ```
   Billing webhook event evt_12345 was already processed. Skipping duplicate.
   ```
   and returns HTTP 200 `{ received: true, duplicate: true }`.
3. If not found, the mutation runs inside a Prisma transaction or structured pipeline, followed by recording `stripeEventId` in `BillingWebhookEvent`.

---

## 5. Failure Handling and Retries

- **Signature Verification Failures**: HTTP 400 Bad Request is returned immediately with error code `WEBHOOK_SIGNATURE_VERIFICATION_FAILED`. Stripe will retry according to exponential backoff until signed correctly.
- **Missing Workspace**: If a webhook arrives with an unknown workspace reference, the error is logged with structured context and HTTP 200 is returned to prevent infinite retry loops on deleted or orphaned test data.
- **Database Interruption**: If the database is unreachable, HTTP 500 is returned, prompting Stripe to retry according to standard retry schedule (up to 3 days).

---

## 6. Testing Webhooks Locally

Using Stripe CLI to test event ingestion against local FlowForge:
```bash
# 1. Start Stripe CLI listening on API webhook route
stripe listen --forward-to localhost:4000/api/v1/billing/webhook

# 2. Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```
All events are validated by Vitest suite `apps/api/test/billing.test.ts`.
