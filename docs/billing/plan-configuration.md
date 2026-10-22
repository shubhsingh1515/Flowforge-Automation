# FlowForge Automation SaaS — Plan Configuration & Quota Matrix

## 1. Overview
FlowForge features a multi-tiered plan architecture declared in `@flowforge/shared` (`packages/shared/src/plans.ts`) and enforced by the backend `EntitlementService` (`apps/api/src/services/entitlements.ts`).

Plan definitions are centralized, version-controlled, and synchronized between frontend UI components (Pricing table, Usage gauges) and backend API route guards.

---

## 2. Plan Tier Matrix

| Dimension | `FREE` (Starter) | `PRO` (Professional) | `BUSINESS` (Enterprise) |
|---|---|---|---|
| **Monthly Price (USD)** | **$0** / month | **$29** / month | **$99** / month |
| **Executions per Month** | 1,000 | 10,000 | 100,000 |
| **Active Workflows** | 5 | 25 | Unlimited (`-1`) |
| **Step Execution Timeout** | 30 seconds | 60 seconds | 180 seconds |
| **Max Steps per Workflow** | 25 | 100 | 500 |
| **Execution History Retention**| 7 days | 30 days | 90 days |
| **Workspace Members** | 2 | 5 | 25 |
| **Connected Accounts** | 3 | 10 | Unlimited (`-1`) |
| **Custom Webhooks** | Yes | Yes | Yes |
| **Schedule Frequency** | Every 15 minutes | Every 1 minute | Real-time / Sub-minute |
| **Flow Control (Loops, Filters)**| Basic | Full | Full |
| **Human Approvals** | No | Yes | Yes |
| **Audit Logs Export** | No | No | Yes |
| **Priority Queue Concurrency** | Standard (2 workers) | High (5 workers) | Dedicated (10 workers) |
| **Support SLA** | Community | Standard (24h) | Priority / Dedicated |

---

## 3. Plan Code Definition (`packages/shared/src/plans.ts`)

```typescript
export type PlanTier = 'FREE' | 'PRO' | 'BUSINESS';

export interface PlanConfig {
  id: PlanTier;
  name: string;
  description: string;
  priceMonthly: number; // in USD
  currency: string;
  quotas: {
    monthlyExecutions: number;
    maxActiveWorkflows: number;
    maxStepsPerWorkflow: number;
    stepTimeoutMs: number;
    historyRetentionDays: number;
    maxWorkspaceMembers: number;
    maxConnectedAccounts: number;
  };
  features: {
    customWebhooks: boolean;
    highFrequencyScheduling: boolean;
    advancedFlowControl: boolean;
    humanApprovals: boolean;
    auditLogs: boolean;
    prioritySupport: boolean;
  };
}
```

---

## 4. Quota Enforcement Logic

Quotas are enforced server-authoritatively at runtime:

1. **Monthly Executions (`monthlyExecutions`)**:
   - Tracked in `UsageRecord` table.
   - Enforced by `EntitlementService.canExecuteWorkflow(workspaceId)` before BullMQ dispatch.
   - Rejection code: `402 Payment Required` or `429 Quota Exceeded` (`QUOTA_EXCEEDED_MONTHLY_EXECUTIONS`).

2. **Active Workflows (`maxActiveWorkflows`)**:
   - Queried from `Workflow` table where `status = 'ACTIVE'`.
   - Enforced when toggling status in `PATCH /api/v1/workflows/:id`.
   - Rejection code: `403 Forbidden` (`PLAN_LIMIT_ACTIVE_WORKFLOWS`).

3. **Workspace Members (`maxWorkspaceMembers`)**:
   - Queried from active members (`WorkspaceMember`) plus pending invitations (`WorkspaceInvitation`).
   - Enforced on `POST /api/v1/workspaces/members/invite`.
   - Rejection code: `403 Forbidden` (`PLAN_LIMIT_MEMBERS`).

4. **Connected Accounts (`maxConnectedAccounts`)**:
   - Queried from `ConnectedAccount` table.
   - Enforced on `POST /api/v1/connections`.
   - Rejection code: `403 Forbidden` (`PLAN_LIMIT_CONNECTIONS`).

---

## 5. Environment Overrides

To map Stripe recurring price IDs to plan tiers in production:
```bash
STRIPE_PRICE_PRO=price_1P0000000000000000000000
STRIPE_PRICE_BUSINESS=price_1P9999999999999999999999
```
If dynamic discount codes or custom enterprise plans are required, custom price ID mappings can be registered in `apps/api/src/config.ts`.
