# FlowForge Automation SaaS — Subscription Model & Entitlements

## 1. Overview
FlowForge operates as a multi-tenant B2B and prosumer SaaS platform with subscription plans tied directly to workspaces.

Each workspace possesses an authoritative `WorkspaceSubscription` record determining its tier, status, billing boundaries, and feature entitlements.

---

## 2. Subscription Lifecycle States

```
                [ Customer Starts Checkout ]
                             │
                             ▼
     ┌─────────────────▶  [ ACTIVE ] ◀─────────────────┐
     │                       │                         │
     │                 Payment Fails              Payment Recovers
     │                       │                         │
     │                       ▼                         │
     │                  [ PAST_DUE ] ──────────────────┘
     │                       │
     │                 Grace Period Expires (7 days)
     │                       │
     │                       ▼
     │                   [ UNPAID ] ──▶ (Fallback to Free Quotas)
     │
Customer Reactivates
     │
     │
  [ CANCELED ] ◀── Cancel at Period End ── [ ACTIVE ]
 (Effective at period end)
```

### State Behaviors
- **`ACTIVE`**: Full access to plan quotas and features.
- **`TRIALING`**: Temporary trial access; treated as active.
- **`PAST_DUE`**: Payment failed on invoice. The workspace enters a 7-day grace period where active workflows continue executing while a warning banner is shown to administrators.
- **`CANCELED`**: Customer requested cancellation. Maintains paid plan quotas until `currentPeriodEnd`, after which the workspace drops to the `FREE` tier. Existing workflows are never deleted.
- **`UNPAID` / `INCOMPLETE`**: Immediate restriction to `FREE` plan limits.

---

## 3. Server-Authoritative Entitlements
Entitlements are calculated dynamically by `EntitlementService` (`apps/api/src/services/entitlements.ts`):
1. **Admission Control**: Check `canExecuteWorkflow` before accepting or enqueueing any execution.
2. **Workflow Activations**: Enforce `canActivateWorkflow` when changing workflow status to `ACTIVE`.
3. **Workspace Members**: Enforce `canAddWorkspaceMember` upon issuing new invitations.
4. **Connected Accounts**: Enforce `canConnectAccount` when storing new OAuth or API credentials.
