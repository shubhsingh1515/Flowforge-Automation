# Phase 27 Operations Runbook

## Standard Operating Procedures for Account Planning & Governance

### 1. Quarterly Account Portfolio Triage
1. Navigate to `/account-planning` -> **Prioritized Queue**.
2. Filter by `Attention Level: CRITICAL` and `HIGH`.
3. For accounts with Single-Thread Risk:
   - Assign Lead CSM to map at least 2 additional technical and business stakeholders within 14 days.
4. For accounts with overdue EBRs (> 14 days):
   - Click **Schedule EBR** and select an upcoming executive alignment slot.

### 2. Operational Blocker Escalation Protocol
1. When a `CRITICAL` blocker is logged on a customer objective:
   - Portfolio priority score automatically increases by +25 points.
   - An alert is flagged in the Customer 360 overview.
2. The assigned `resolutionOwnerUserId` must investigate within 24 hours.
3. Once the technical fix or organizational resolution is deployed, call `PATCH /account-planning/blockers/:blockerId/resolve` with post-mortem notes.

### 3. Executive Business Review (EBR) Cadence
1. **T-14 Days**: Schedule review, auto-generate preparation snapshot, and confirm external executive attendees.
2. **Review Day**: Walk through quantified objectives, verified telemetry evidence, and active initiatives.
3. **T+24 Hours**: Record EBR outcome and register commitments. Verify each commitment materialized as a task in Customer 360.
