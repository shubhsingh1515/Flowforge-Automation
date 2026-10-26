# Phase 27 API & SDK Reference

## REST API Endpoints

All endpoints are hosted under `/api/v1` and require authenticated workspace sessions.

### 1. Portfolio Prioritization & Overview
- `GET /account-planning/overview`: Retrieves high-level portfolio counts, single-thread risk count, priority breakdown, and overdue review counts.
- `GET /account-planning/queue`: Retrieves the prioritized account ranking list with explainable scores and recommended actions.
- `POST /account-planning/prioritize/:customerAccountId`: Triggers a deterministic re-evaluation of an account's priority score.

### 2. Strategic Account Profiles
- `GET /account-planning/profiles/:customerAccountId`: Retrieves the strategic profile and ownership matrix.
- `POST /account-planning/profiles/:customerAccountId`: Creates or updates tier, ownership team, and EBR cadence.

### 3. Stakeholder Relationships
- `GET /account-planning/stakeholders`: Lists stakeholder mappings for an account.
- `POST /account-planning/stakeholders`: Registers a new stakeholder with role, sentiment, and engagement level.
- `PATCH /account-planning/stakeholders/:id`: Updates stakeholder status and records a change history entry.
- `DELETE /account-planning/stakeholders/:id`: Removes a stakeholder mapping.

### 4. Strategic Account Plans
- `GET /account-planning/plans`: Lists strategic account plans.
- `POST /account-planning/plans`: Creates a new account plan draft.
- `GET /account-planning/plans/:id`: Retrieves plan details with objectives, blockers, and initiatives.
- `PATCH /account-planning/plans/:id`: Updates plan attributes or transitions lifecycle state (`DRAFT` -> `IN_REVIEW` -> `ACTIVE`).
- `POST /account-planning/plans/:id/approve`: Approves the plan, creating an immutable version snapshot.
- `GET /account-planning/plans/:id/versions`: Lists historical snapshots.

### 5. Customer Objectives & Evidence
- `GET /account-planning/objectives`: Lists customer business objectives.
- `POST /account-planning/objectives`: Creates a new quantified business objective.
- `GET /account-planning/objectives/:id`: Retrieves objective details with evidence and blockers.
- `PATCH /account-planning/objectives/:id`: Updates progress (`currentValue`) or status.
- `POST /account-planning/objectives/:id/evidence`: Adds verified evidence proof to the immutable ledger.
- `POST /account-planning/objectives/:id/blockers`: Logs an operational blocker.
- `PATCH /account-planning/blockers/:blockerId/resolve`: Resolves an operational blocker.

### 6. Strategic Initiatives
- `GET /account-planning/initiatives`: Lists strategic initiatives and milestones.
- `POST /account-planning/initiatives`: Creates a new strategic initiative.
- `PATCH /account-planning/initiatives/:id`: Updates initiative status and progress.
- `POST /account-planning/initiatives/:id/milestones`: Adds a milestone to an initiative.
- `PATCH /account-planning/milestones/:milestoneId`: Updates milestone completion status.

### 7. Executive Business Reviews (EBR)
- `GET /account-planning/reviews`: Lists scheduled, prepared, and completed EBRs.
- `POST /account-planning/reviews`: Schedules a new EBR and generates prep data.
- `GET /account-planning/reviews/:id`: Retrieves review details with participants and commitments.
- `PATCH /account-planning/reviews/:id`: Updates review status (`PREPARATION` -> `COMPLETED`).
- `POST /account-planning/reviews/:id/commitments`: Records an idempotent commitment and materializes a Customer 360 task.

---

## TypeScript SDK (`@flowforge/sdk`)

Phase 27 is fully integrated into the official client SDK:

```typescript
import { FlowForgeClient } from "@flowforge/sdk";

const client = new FlowForgeClient({
  baseUrl: "https://api.flowforge.dev",
  apiKey: "ff_sec_...",
  workspaceId: "ws_prod_01",
});

// 1. Fetch Prioritized Portfolio Queue
const queue = await client.accountPlanning.getPrioritizedQueue();
console.log(`Top priority account: ${queue[0].customerAccount.name} (Score: ${queue[0].score})`);

// 2. Register Stakeholder
const stakeholder = await client.accountPlanning.addStakeholder({
  customerAccountId: "acc_123",
  contactId: "cnt_456",
  role: "CHAMPION",
  sentiment: "POSITIVE",
  engagementLevel: "HIGH",
  influenceScore: 5,
});

// 3. Log Quantified Objective
const objective = await client.accountPlanning.createObjective({
  customerAccountId: "acc_123",
  title: "Reduce ETL Latency by 70%",
  category: "TIME_SAVINGS",
  targetDate: "2026-12-31T00:00:00.000Z",
  baselineValue: 120, // 120 minutes
  targetValue: 36,   // 36 minutes
});

// 4. Attach Verified Evidence
await client.accountPlanning.recordEvidence(objective.id, {
  evidenceType: "EXECUTION_METRIC",
  summary: "Measured median run duration across 1,420 pipeline runs in November.",
  metricValue: 34.2,
  verifiedByUserId: "usr_lead_csm",
});
```
