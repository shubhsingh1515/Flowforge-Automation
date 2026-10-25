# FlowForge Revenue Intelligence — Operations Runbook

## 1. Routine Milestone Evaluation Cadence

The retention governance engine triggers scheduled milestone evaluation tasks based on the workspace revenue policy:
- **Daily Evaluation Job**: Triggers `POST /api/v1/customer-revenue/generate-tasks`.
- **Milestones**:
  - `90 Days`: Renewal Preparation. CSM conducts account strategy review.
  - `60 Days`: Health & Telemetry Review. System flags adoption drops.
  - `45 Days`: Customer Engagement. Outreach to key executive stakeholders.
  - `30 Days`: Commercial Review. High-priority retention task generated.
- **Deduplication Guarantee**: Tasks use the idempotency key `RENEWAL-MILESTONE-${contractId}-${milestone}` to prevent duplicate task generation across runs.

## 2. Troubleshooting & Diagnostics

### Insufficient Data Handling
- **Symptom**: Renewal opportunity displays `INSUFFICIENT_DATA`.
- **Remediation**:
  1. Verify the customer account has linked contacts or external identities.
  2. Confirm product telemetry or journey milestones have begun recording.
  3. Trigger an on-demand health evaluation via `POST /customer-health/evaluate/:id`.

### Contract Value Mismatch
- **Symptom**: Overview metrics do not match expected contract totals.
- **Remediation**:
  1. Check the active currency filter. Financial totals are strictly segregated by currency.
  2. Confirm contract status is `ACTIVE` or `RENEWAL_PENDING`. `EXPIRED` or `DRAFT` contracts are excluded from active ARR.
