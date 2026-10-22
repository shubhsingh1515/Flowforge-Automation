# FlowForge Automation SaaS — Phase 6 Master Implementation Plan
## SaaS Monetization, Subscription Billing, Usage Metering, Plans, Workspace Management, and Entitlements

### Date: October 2026
### Author: Principal SaaS Architect, Payments Engineer & Senior Full-Stack Architect

---

## 1. Executive Summary & Objective
Phase 6 establishes the commercial monetization layer for FlowForge Automation on top of the production-hardened Phase 1–5 foundation.

The objective is to enable FlowForge to support real customers with paid subscriptions, transparent usage quotas, multi-tenant workspace governance, and billing operations, while maintaining strict server-authoritative entitlement enforcement and defense-in-depth isolation.

---

## 2. Baseline Status & Current Architecture Findings

### Baseline Verification (Phase 1–5)
- **Vitest Suite**: 101 tests passed / 0 failed across 5 suites.
- **Playwright Suite**: 24 E2E browser tests passed / 0 failed across Desktop & Mobile Chrome.
- **Next.js Production Build**: 15 routes compiled with 0 errors.
- **Load Test**: 1342 RPS on `/health/live`, 1176 RPS on `/health` (DB+Redis), 0 errors.

### Existing Models & Architecture
- **Multi-Tenant Foundation**: Workspaces already exist with `WorkspaceMembership` linking `User` and `Workspace` with `WorkspaceRole` (`OWNER`, `ADMIN`, `MEMBER`).
- **Auth & Context**: `authenticateRequest` Fastify plugin validates JWT and populates `request.authUser` with `{ id, email, name, workspaceId, workspaceRole }`.
- **Workflow & Execution Engine**: Asynchronous BullMQ processing, PostgreSQL execution traces, durable pause/resume for human approvals, cancellation handling.
- **Missing Elements to Implement in Phase 6**:
  - Central plan definitions and server-side entitlement resolution service.
  - Workspace subscription state tracking (`WorkspaceSubscription` model).
  - Stripe billing service (customer creation, checkout sessions, customer portal).
  - Billing webhook ingestion with signature verification and idempotent event ledger (`BillingWebhookEvent`).
  - Durable usage metering ledger (`UsageRecord`) with deduplication against worker retries.
  - Workspace member invitation system (`WorkspaceInvitation`).
  - User-facing pricing page, billing dashboard, usage consumption charts, and upgrade modals.

---

## 3. Subscription Plans & Entitlement Architecture

### A. Plan Tiers & Specifications
Monetary amounts are represented strictly as integer minor units (e.g. cents in USD).

| Plan Tier | Price (USD) | Included Executions / Mo | Max Active Workflows | Max Workspace Members | Max Connected Accounts | Advanced Features |
|---|---|---|---|---|---|---|
| **Free** | $0 / mo | 100 runs | 3 workflows | 2 members | 2 accounts | Basic Triggers & Actions |
| **Pro** | $29 / mo (2900¢) | 10,000 runs | 25 workflows | 10 members | 15 accounts | Branching, Loops, Transforms, Priority Queue |
| **Business** | $99 / mo (9900¢) | 100,000 runs | Unlimited (500) | 50 members | Unlimited (100) | Approvals, Custom Webhooks, SLA, Dedicated Support |

### B. Central Entitlement Service (`EntitlementService`)
A centralized server-side service resolving effective capabilities:
- `canCreateWorkflow(workspaceId)`: checks active workflow count against plan ceiling.
- `canActivateWorkflow(workspaceId)`: checks active workflows against plan limit.
- `canAddWorkspaceMember(workspaceId)`: checks membership + pending invites against member limit.
- `canConnectAccount(workspaceId)`: checks connected accounts against integration limit.
- `canExecuteWorkflow(workspaceId)`: atomic admission check verifying current-period usage < execution quota.
- `canUseFeature(workspaceId, featureKey)`: validates plan feature gates (e.g. `APPROVAL_WORKFLOWS`, `PRIORITY_EXECUTION`).

---

## 4. Payment Provider & Billing Architecture (Stripe Integration)

### A. Stripe Billing Service (`BillingService`)
- Encapsulated behind `BillingService` interface with `StripeBillingService` implementation and `MockBillingService` fallback for development/CI environments without live Stripe credentials.
- **Customer Resolution**: Lazily creates Stripe Customer on first checkout or workspace activation, storing `stripeCustomerId` in `WorkspaceSubscription`.
- **Checkout Sessions**: Initiates hosted Stripe Checkout in `subscription` mode with price IDs configured per plan.
- **Customer Portal**: Creates Stripe Billing Portal sessions allowing users to update payment methods, download PDF invoices, and manage cancellation.
- **Zero Card Data Storage**: Card numbers, CVVs, and banking details are never handled or stored by FlowForge servers (PCI DSS compliant).

### B. Subscription Lifecycle States
- `TRIALING`: Temporary access to paid tier during trial period.
- `ACTIVE`: Paid subscription in good standing.
- `PAST_DUE`: Payment failed; 7-day grace period with warning banner before downgrading to Free tier.
- `CANCELED`: Canceled at period end; maintains paid entitlements until `currentPeriodEnd`.
- `UNPAID` / `INCOMPLETE`: Restricted access; defaults to Free plan limits.

---

## 5. Billing Webhook Processing & Idempotency

### Webhook Route: `POST /api/v1/billing/webhook`
1. **Raw Body Verification**: Verify `stripe-signature` header using `stripe.webhooks.constructEvent`.
2. **Idempotency Guard**: Check `BillingWebhookEvent` table for `eventId`. If already processed, return 200 immediately.
3. **Event Dispatching**:
   - `checkout.session.completed`: Associate customer ID, record subscription, activate plan.
   - `customer.subscription.created`: Record subscription start, plan tier, status, and period dates.
   - `customer.subscription.updated`: Update status, handle cancellation at period end or plan upgrade/downgrade.
   - `customer.subscription.deleted`: Revert workspace subscription status to `CANCELED` (falls back to Free plan).
   - `invoice.payment_succeeded`: Reset billing period counters, record invoice receipt.
   - `invoice.payment_failed`: Mark subscription `PAST_DUE`, notify workspace owner.

---

## 6. Durable Usage Metering & Quota Enforcement

### Billable Metric: Workflow Executions
- **Admission Control**: When a workflow execution is triggered (via Manual run, Webhook event, or Schedule), the system atomically checks whether the workspace's monthly execution quota has been reached.
- **Ledger Model (`UsageRecord`)**:
  - `workspaceId`: Target workspace.
  - `metricType`: `WORKFLOW_EXECUTION` or `STEP_EXECUTION`.
  - `quantity`: Quantity consumed (default 1).
  - `executionId`: Execution ID.
  - `idempotencyKey`: Unique key (`usage_${executionId}`) ensuring that BullMQ worker retries, resumes, or replays **never double-count**.
  - `periodStart` / `periodEnd`: Billing period boundaries.
- **Quota Exceeded Behavior**:
  - Execution request rejected with structured error: `errorCategory: "QUOTA_EXCEEDED"`, `statusCode: 402` (Payment Required) or `403`.
  - Non-destructive: existing workflows, connections, and historical logs remain completely intact.

---

## 7. Workspace Ownership & Member Invitations

### Permissions Hierarchy
- **OWNER**: Full administrative control, billing management, subscription upgrades/cancellations, ownership transfer, delete workspace.
- **ADMIN**: Invite/remove members, create/edit workflows, view billing and usage. Cannot transfer ownership or cancel subscription.
- **MEMBER**: Create, edit, and run workflows; view execution history. Cannot access billing or invite members.

### Member Invitations Model (`WorkspaceInvitation`)
- Secure token generation using `crypto.randomBytes(32)` hashed with SHA-256 for database storage.
- Expiring tokens (7-day validity).
- Email-based invitation with status: `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`.
- Enforcement of workspace member limit during invitation creation.

---

## 8. Database Schema Additions (Prisma)

1. `enum PlanTier { FREE, PRO, BUSINESS }`
2. `enum SubscriptionStatus { ACTIVE, TRIALING, PAST_DUE, CANCELED, UNPAID, INCOMPLETE }`
3. `enum InvitationStatus { PENDING, ACCEPTED, REVOKED, EXPIRED }`
4. `model WorkspaceSubscription`:
   - `id`, `workspaceId` (unique), `planTier`, `status`, `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`.
5. `model UsageRecord`:
   - `id`, `workspaceId`, `metricType`, `quantity`, `executionId`, `idempotencyKey` (unique), `createdAt`.
6. `model BillingWebhookEvent`:
   - `id`, `eventId` (unique), `eventType`, `provider`, `payload`, `processedAt`.
7. `model WorkspaceInvitation`:
   - `id`, `workspaceId`, `email`, `role`, `tokenHash` (unique), `status`, `invitedByUserId`, `expiresAt`, `createdAt`.

---

## 9. Customer-Facing UI Deliverables

1. **Pricing Page (`/pricing`)**:
   - Monthly plan cards (Free, Pro, Business) with included quotas, feature comparisons, and dynamic CTA buttons ("Current Plan", "Upgrade to Pro", "Contact Sales").
2. **Billing Settings Tab (`/settings?tab=billing` / `/billing`)**:
   - Current subscription status badge, plan details, billing cycle renewal date.
   - Usage consumption gauges (Executions used vs allowance, Workflows active vs limit, Members vs limit).
   - "Manage Subscription" button launching Stripe Customer Portal.
   - Upgrade plan modal with checkout redirect.
3. **Workspace Members Tab (`/settings?tab=members`)**:
   - Current members list with roles and member count against plan quota.
   - "Invite Member" modal with email and role selection.
   - Pending invitations list with "Revoke" action.

---

## 10. Implementation Milestones

- **Milestone 1**: Database schema extension & migration.
- **Milestone 2**: Central plan definitions & Entitlement service.
- **Milestone 3**: Billing service, checkout, and portal integration (Stripe & Mock provider).
- **Milestone 4**: Webhook signature verification & idempotent event processor.
- **Milestone 5**: Durable usage metering ledger & execution quota admission control.
- **Milestone 6**: Workspace member invitation system and role permissions.
- **Milestone 7**: Customer-facing UI (Pricing page, Billing dashboard, Member management).
- **Milestone 8**: Automated test suite (unit, integration, E2E, and regression verification).
