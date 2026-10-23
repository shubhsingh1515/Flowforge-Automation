# Usage Intelligence, Forecasting, and Threshold Alerts

This document describes FlowForge's usage intelligence forecasting engine, burn-rate calculations, and automated threshold alerts.

---

## 1. Linear Extrapolation & Burn Rate Forecasting

The usage intelligence engine calculates consumption velocity to help workspace owners anticipate overage risks before billing cycle renewal.

### Calculation Model
1. **Billing Cycle Days Elapsed**:
   $$D_{\text{elapsed}} = \max(1, \text{days between cycle start and current time})$$
2. **Total Days in Billing Cycle**:
   $$D_{\text{total}} = \text{days between cycle start and cycle end}$$
3. **Burn Rate (Executions / Day)**:
   $$\text{burnRatePerDay} = \frac{\text{currentExecutions}}{D_{\text{elapsed}}}$$
4. **Projected Period-End Total**:
   $$\text{projectedTotal} = \text{currentExecutions} + \left(\text{burnRatePerDay} \times (D_{\text{total}} - D_{\text{elapsed}})\right)$$
5. **Projected Usage Percentage**:
   $$\text{projectedPercentOfQuota} = \frac{\text{projectedTotal}}{\text{planLimit}} \times 100$$
6. **Confidence Level**:
   - `HIGH`: Elapsed days $\ge 14$
   - `MEDIUM`: Elapsed days $\ge 5$ and $< 14$
   - `LOW`: Elapsed days $< 5$

---

## 2. Proactive Threshold Alerts & Deduplication

Workspace administrators can configure automated notifications when monthly execution consumption crosses critical percentage milestones:
- **50% of monthly quota**
- **80% of monthly quota** (Warning state)
- **90% of monthly quota** (High-alert state)
- **100% of monthly quota** (Quota exhausted; automations may be throttled)

### Deduplication Architecture
To prevent notification storms, threshold evaluations record a unique record in `WorkspaceUsageAlertEvent`:
```prisma
model WorkspaceUsageAlertEvent {
  id              String   @id @default(cuid())
  workspaceId     String
  periodStart     DateTime
  thresholdPct    Int      // 50, 80, 90, 100
  notifiedAt      DateTime @default(now())

  @@unique([workspaceId, periodStart, thresholdPct])
}
```

Whenever an execution increments usage or the scheduled evaluation worker runs:
1. It checks if `percentUsed >= thresholdPct`.
2. It attempts to find an existing `WorkspaceUsageAlertEvent` for the current workspace and billing period.
3. If no alert exists, it creates the alert record and dispatches an in-app `Notification` record to all workspace owners and admins.
4. Subsequent evaluations during the same billing period safely skip already-dispatched thresholds.

---

## 3. Endpoints

- `GET /api/v1/usage/forecast`: Returns current month elapsed days, burn rate/day, projected period-end total, and confidence rating.
- `GET /api/v1/usage/alerts/config`: Returns active alert thresholds and notification destinations.
- `PUT /api/v1/usage/alerts/config`: Updates threshold percentage preferences and delivery channels.
- `POST /api/v1/usage/alerts/evaluate`: Triggers immediate server-side evaluation of usage against configured thresholds.
