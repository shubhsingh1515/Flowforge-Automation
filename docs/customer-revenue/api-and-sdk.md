# FlowForge Revenue Intelligence — API & SDK Reference

## 1. Fastify API Endpoints

All endpoints are prefixed with `/api/v1` and require an authenticated Bearer token or API key.

### Contracts
- `POST /customer-contracts`: Register a new customer contract.
- `GET /customer-contracts`: List contracts with optional `customerAccountId` or `status` filters.
- `GET /customer-contracts/:id`: Retrieve contract by ID or contract number.
- `PATCH /customer-contracts/:id`: Update contract with auditable change tracking.
- `GET /customer-contracts/:id/changes`: Retrieve immutable change log.

### Renewals
- `POST /customer-renewals`: Register a renewal opportunity.
- `GET /customer-renewals`: List renewals filtered by stage or risk level.
- `GET /customer-renewals/:id`: Retrieve renewal opportunity.
- `PATCH /customer-renewals/:id/stage`: Advance stage with transition validation.
- `POST /customer-renewals/:id/outcome`: Finalize outcome (`RENEWED_*`, `CHURNED`, `CANCELLED`).
- `GET /customer-renewals/:id/timeline`: Retrieve chronological event timeline.
- `POST /customer-renewals/:id/evaluate-risk`: Run deterministic risk calculation.
- `GET /customer-renewals/:id/risk-history`: Versioned evaluation snapshots.

### Expansion
- `POST /customer-expansion`: Register a detected expansion opportunity.
- `GET /customer-expansion`: List expansion opportunities.
- `GET /customer-expansion/:id`: Retrieve opportunity details.
- `POST /customer-expansion/:id/qualify`: Human qualification checkpoint (`qualified: true/false`).
- `PATCH /customer-expansion/:id/stage`: Advance expansion commercial stage.
- `GET /customer-expansion/:id/history`: Stage history audit log.

### Policy & Executive Overview
- `GET /customer-revenue/policy`: Get workspace revenue policy.
- `PUT /customer-revenue/policy`: Update milestone thresholds and automation settings.
- `POST /customer-revenue/generate-tasks`: Run scheduled milestone evaluation.
- `GET /revenue/overview`: Aggregate executive overview metrics.

---

## 2. TypeScript SDK Usage

```typescript
import { FlowForgeClient } from "@flowforge/sdk";

const client = new FlowForgeClient({ apiKey: "ff_live_your_key" });

// 1. Create a customer contract
const contract = await client.revenue.contracts.create({
  customerAccountId: "acc-123",
  contractNumber: "CNT-2026-001",
  name: "Acme Master Subscription",
  contractValue: 120000,
  annualRecurringValue: 120000,
  currency: "USD",
  startDate: "2026-01-01T00:00:00Z",
  termEndDate: "2027-01-01T00:00:00Z",
  renewalDate: "2027-01-01T00:00:00Z",
  autoRenew: false,
});

// 2. Register renewal opportunity
const renewal = await client.revenue.renewals.create({
  contractId: contract.data.id,
  opportunityNumber: "REN-2026-001",
  renewalAmount: 120000,
  currency: "USD",
  targetDate: "2027-01-01T00:00:00Z",
  stage: "UPCOMING",
});

// 3. Evaluate deterministic renewal risk
const risk = await client.revenue.renewals.evaluateRisk(renewal.data.id);
console.log(`Risk Level: ${risk.data.riskLevel}, Score: ${risk.data.riskScore}`);

// 4. Qualify expansion opportunity
const expansion = await client.revenue.expansion.qualify("exp-123", {
  qualified: true,
  notes: "Verified API capacity spike in Q3",
  estimatedValue: 35000,
});

// 5. Query executive overview
const overview = await client.revenue.getOverview("USD");
console.log(`Active ARR: $${overview.data.totalAnnualRecurringRevenue}`);
```
