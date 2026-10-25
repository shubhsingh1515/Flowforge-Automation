# FlowForge Revenue Intelligence — Permissions, Security & Audit

## 1. Multi-Tenant Isolation

All Phase 26 database models and Fastify endpoints enforce strict workspace isolation:
- Every table (`customer_contracts`, `customer_renewal_opportunities`, `customer_expansion_opportunities`, `customer_revenue_policies`) includes a mandatory `workspaceId` foreign key.
- Database queries scope lookups to `request.authUser.workspaceId`. Cross-tenant lookups throw `404 Not Found`.

## 2. Role-Based Access Control (RBAC)

| Action | Allowed Roles | Description |
| :--- | :--- | :--- |
| View Revenue Console & Metrics | `MEMBER`, `ADMIN`, `OWNER` | Read-only access to ARR, renewals, contracts, and expansion pipeline. |
| Register Contract / Renewal | `ADMIN`, `OWNER` | Creates commercial contracts and pipeline opportunities. |
| Run Risk Evaluation | `ADMIN`, `OWNER` | Re-evaluates risk score and generates retention tasks. |
| Finalize Renewal Outcome | `ADMIN`, `OWNER` | Closes opportunities and generates successor contracts. |
| Qualify Expansion | `ADMIN`, `OWNER` | Advances detected opportunities to qualified stages. |
| Configure Revenue Policy | `ADMIN`, `OWNER` | Adjusts milestone notice windows and risk thresholds. |

## 3. Immutable Change Ledgers & Audit Logs

- **Contract Modifications**: Changes to value, currency, notice periods, or dates record immutable snapshots in `CustomerContractChange`.
- **Stage Progression**: Opportunities maintain stage histories with actor ID and reasoning in `CustomerRenewalTimelineEvent` and `CustomerExpansionStageHistory`.
- **System Audit Logs**: All state transitions record events in `WorkspaceAuditLog` (`customer.contract.created`, `customer.renewal.stage_updated`, `customer.expansion.qualified`, etc.).
