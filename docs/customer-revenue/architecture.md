# FlowForge Revenue Intelligence & Retention Governance — Architecture

## 1. Architectural Overview

Phase 26 establishes a tenant-isolated commercial intelligence layer on top of FlowForge Automation SaaS. It connects contracts, renewal opportunities, risk assessments, expansion pipelines, and milestone-driven retention tasks without altering the core workflow execution engine or bypassing governance rules.

```
                    ┌────────────────────────┐
                    │   Executive Console    │
                    │      (/revenue)        │
                    └───────────┬────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
┌───────────────────────┐               ┌───────────────────────┐
│   Customer Contracts  │◄─────────────►│ Renewal Opportunities │
│ (Terms, ARR, Changes) │               │(Lifecycle, Risk, Won) │
└───────────┬───────────┘               └───────────┬───────────┘
            │                                       │
            ▼                                       ▼
┌───────────────────────┐               ┌───────────────────────┐
│  Revenue Governance   │               │ Deterministic Renewal │
│  Policy & Milestones  │               │    Risk Evaluator     │
└───────────┬───────────┘               └───────────┬───────────┘
            │                                       │
            ▼                                       ▼
┌───────────────────────┐               ┌───────────────────────┐
│ Retention Interventions│              │ Expansion Pipeline    │
│ (CustomerSuccessTask) │               │(Telemetry, Qualify)   │
└───────────────────────┘               └───────────────────────┘
```

## 2. Core Entities & Database Schema

1. **`CustomerContract` (`customer_contracts`)**:
   - Represents the commercial baseline for a customer account.
   - Fields: `contractNumber`, `name`, `startDate`, `termEndDate`, `renewalDate`, `renewalNoticeDeadline`, `contractValue`, `annualRecurringValue`, `currency`, `contractType`, `renewalType`, `autoRenew`, `noticePeriodDays`.
   - Tenant-scoped via `workspaceId` with cascade deletion.

2. **`CustomerContractChange` (`customer_contract_changes`)**:
   - Append-only immutable change ledger for auditing adjustments to contract amounts, end dates, and statuses.
   - Fields: `contractId`, `changeType`, `previousValue`, `newValue`, `changeReason`, `changedById`, `changedAt`.

3. **`CustomerRenewalOpportunity` (`customer_renewal_opportunities`)**:
   - Manages the commercial renewal lifecycle.
   - Stages: `UPCOMING`, `PREPARATION`, `CUSTOMER_ENGAGEMENT`, `COMMERCIAL_REVIEW`, `NEGOTIATION`, `COMMIT_PENDING`, `RENEWED`, `LOST`, `ON_HOLD`.
   - Risk Classifications: `LOW`, `MODERATE`, `HIGH`, `CRITICAL`, `INSUFFICIENT_DATA`.

4. **`CustomerRenewalTimelineEvent` (`customer_renewal_timeline_events`)**:
   - Chronological, immutable timeline of renewal actions.
   - Enforces unique `(workspaceId, idempotencyKey)` to prevent duplicate task generation or redundant alerts.

5. **`CustomerRenewalRiskEvaluation` (`customer_renewal_risk_evaluations`)**:
   - Versioned snapshots of deterministic risk calculations.
   - Preserves `inputsSnapshot`, `contributingSignals`, `riskScore`, `riskLevel`, and human-readable `explanation`.

6. **`CustomerExpansionOpportunity` (`customer_expansion_opportunities`)**:
   - Tracks expansion potential identified via product telemetry or commercial discovery.
   - Types: `ADDITIONAL_CAPACITY`, `HIGHER_TIER`, `ADDITIONAL_PRODUCT`, `NEW_BUSINESS_UNIT`, `CONTRACT_SCOPE_EXPANSION`.
   - Stages: `DETECTED`, `NEEDS_REVIEW`, `QUALIFIED`, `PROPOSAL_IN_PROGRESS`, `WON`, `LOST`, `DISMISSED`.
   - Human qualification checkpoint strictly required before advancement past `DETECTED`/`NEEDS_REVIEW`.

7. **`CustomerExpansionStageHistory` (`customer_expansion_stage_histories`)**:
   - Audit trail capturing stage progression, notes, and actor ID.

8. **`CustomerRevenuePolicy` (`customer_revenue_policies`)**:
   - Workspace-level governance settings: `renewalPreparationDays` (90d), `healthReviewDays` (60d), `engagementDays` (45d), `commercialReviewDays` (30d), `riskThresholds`, and `autoTaskGeneration`.

## 3. Financial & Arithmetic Guardrails

- **Strict Multi-Currency Isolation**: Financial summaries (Total Contract Value, ARR, Pipeline at Risk) are grouped by currency. Monetary values in differing currencies are never summed without explicit exchange conversion.
- **Floating Point Precision**: All monetary calculations round to two decimal places (`Math.round(val * 100) / 100`) to prevent floating point inaccuracies.
- **Successor Contract Chain**: Upon finalizing a renewal outcome with outcome `RENEWED_*`, the engine instantiates a successor contract referencing `previousContractId`, preserving contract provenance.
