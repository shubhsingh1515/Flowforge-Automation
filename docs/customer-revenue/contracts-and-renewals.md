# FlowForge Contracts and Renewal Lifecycle

## 1. Customer Contract Lifecycle

Customer contracts represent active SaaS subscription agreements, term limits, values, and autorenewal conditions.

```
       ┌──────────┐
       │  DRAFT   │
       └────┬─────┘
            │
            ▼
       ┌──────────┐
       │  ACTIVE  │◄────────────────┐
       └────┬─────┘                 │
            │                       │
            ▼                       │
   ┌─────────────────┐              │ Successor Contract
   │ RENEWAL_PENDING │              │ Instantiation
   └────────┬────────┘              │
            │                       │
     ┌──────┴──────┐                │
     ▼             ▼                │
┌─────────┐   ┌─────────┐           │
│ RENEWED │   │ EXPIRED │───────────┘
└─────────┘   └─────────┘
```

### Permitted Contract Status Transitions

- `DRAFT` $\rightarrow$ `ACTIVE`, `CANCELLED`
- `ACTIVE` $\rightarrow$ `RENEWAL_PENDING`, `RENEWED`, `EXPIRED`, `CANCELLED`, `TERMINATED`
- `RENEWAL_PENDING` $\rightarrow$ `RENEWED`, `EXPIRED`, `CANCELLED`, `TERMINATED`
- `RENEWED` $\rightarrow$ `ACTIVE`, `RENEWAL_PENDING`, `EXPIRED`, `CANCELLED`, `TERMINATED`
- `EXPIRED`, `CANCELLED`, `TERMINATED` $\rightarrow$ Final states.

All updates to contract status, value, or term end dates generate an immutable `CustomerContractChange` audit entry.

---

## 2. Renewal Opportunity Lifecycle

Renewal opportunities coordinate the commercial workflow leading up to contract expiration.

### Permitted Stage Transitions

- `UPCOMING` $\rightarrow$ `PREPARATION`, `CUSTOMER_ENGAGEMENT`, `ON_HOLD`, `LOST`
- `PREPARATION` $\rightarrow$ `CUSTOMER_ENGAGEMENT`, `COMMERCIAL_REVIEW`, `ON_HOLD`, `LOST`
- `CUSTOMER_ENGAGEMENT` $\rightarrow$ `COMMERCIAL_REVIEW`, `NEGOTIATION`, `ON_HOLD`, `LOST`
- `COMMERCIAL_REVIEW` $\rightarrow$ `NEGOTIATION`, `COMMIT_PENDING`, `ON_HOLD`, `LOST`
- `NEGOTIATION` $\rightarrow$ `COMMIT_PENDING`, `RENEWED`, `ON_HOLD`, `LOST`
- `COMMIT_PENDING` $\rightarrow$ `RENEWED`, `NEGOTIATION`, `LOST`
- `ON_HOLD` $\rightarrow$ `PREPARATION`, `CUSTOMER_ENGAGEMENT`, `COMMERCIAL_REVIEW`, `NEGOTIATION`, `LOST`

### Finalizing Renewal Outcomes

When closing a renewal opportunity (`POST /customer-renewals/:id/outcome`):
- Outcomes: `RENEWED_AS_IS`, `RENEWED_EXPANSION`, `RENEWED_CONTRACTION`, `CHURNED`, `CANCELLED`.
- If outcome is `RENEWED_*`:
  - Current opportunity stage updates to `RENEWED`.
  - Existing contract status updates to `RENEWED`.
  - A successor contract is automatically created starting immediately upon the expiration of the prior term, inheriting previous terms unless adjusted.
  - A timeline event of type `OUTCOME_FINALIZED` is appended.
- If outcome is `CHURNED` or `CANCELLED`:
  - Opportunity stage updates to `LOST`.
  - Contract status updates to `EXPIRED` or `CANCELLED`.
