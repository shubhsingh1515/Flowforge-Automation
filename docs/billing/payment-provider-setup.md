# FlowForge Automation SaaS — Payment Provider Setup & Configuration

## 1. Overview
FlowForge integrates with Stripe as the primary payment and billing gateway.

To maximize developer experience and automated CI reliability:
- **Production / Staging**: Connects to live or test mode Stripe API via `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- **Local Development / CI Tests**: Seamlessly falls back to an embedded `MockBillingService` when no Stripe keys are provided. All checkout URLs, portal sessions, and webhook processing operate out of the box with zero external dependencies.

---

## 2. Environment Variables Configuration

| Variable | Required in Prod | Description | Example |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key (starts with `sk_live_` or `sk_test_`). | `sk_test_51...` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret from Stripe Dashboard (starts with `whsec_`). | `whsec_...` |
| `STRIPE_PRICE_PRO` | Yes | Stripe Recurring Price ID for the Pro Monthly Plan ($29/mo). | `price_1P...` |
| `STRIPE_PRICE_BUSINESS` | Yes | Stripe Recurring Price ID for the Business Monthly Plan ($99/mo). | `price_1P...` |

---

## 3. Step-by-Step Stripe Setup Guide

### Step 1: Create Stripe Products & Recurring Prices
1. In the Stripe Dashboard (Test Mode or Live), navigate to **Products**.
2. Create Product 1:
   - Name: `FlowForge Automation — Pro Plan`
   - Description: `Advanced workflow automation, branching, loops, and 10,000 monthly executions`
   - Price: `$29.00 USD / month` (Recurring)
   - Copy the generated Price ID (e.g. `price_pro_monthly`) to `STRIPE_PRICE_PRO`.
3. Create Product 2:
   - Name: `FlowForge Automation — Business Plan`
   - Description: `Enterprise automation, human-in-the-loop approvals, and 100,000 monthly executions`
   - Price: `$99.00 USD / month` (Recurring)
   - Copy the generated Price ID to `STRIPE_PRICE_BUSINESS`.

### Step 2: Configure Stripe Customer Portal
1. Navigate to **Settings > Billing > Customer portal** in the Stripe Dashboard.
2. Enable:
   - Update payment methods.
   - Cancel subscriptions (select "Cancel at end of billing period").
   - View invoice history and download PDF receipts.
3. Save changes.

### Step 3: Register Webhook Endpoint
1. Navigate to **Developers > Webhooks > Add endpoint**.
2. Endpoint URL: `https://your-domain.com/api/v1/billing/webhook`
3. Listen to events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) and assign to `STRIPE_WEBHOOK_SECRET`.
