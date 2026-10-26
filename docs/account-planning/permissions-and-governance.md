# Permissions & Multi-Tenant Governance

## Overview

Strategic account management involves sensitive revenue commitments, executive sentiments, and contract renewal timelines. FlowForge Automation SaaS enforces zero-trust tenant isolation and role-based permissions across all Phase 27 resources.

---

## 1. Multi-Tenant Isolation Guarantees

Every database query strictly filters on `workspaceId`:
- `CustomerStrategicAccountProfile`: `@@unique([workspaceId, customerAccountId])`
- `CustomerAccountPlan`: `@@index([workspaceId, customerAccountId])`
- `CustomerSuccessObjective`: `@@index([workspaceId, customerAccountId])`
- `CustomerStakeholderRelationship`: `@@unique([workspaceId, customerAccountId, contactId])`
- `CustomerExecutiveReview`: `@@index([workspaceId, customerAccountId])`
- `CustomerPortfolioPriorityEvaluation`: `@@index([workspaceId, customerAccountId])`

Cross-tenant access is structurally impossible at the database level and validated via API preHandlers (`authenticateRequest`).

---

## 2. Role-Based Permissions

Operations within strategic account planning map to tenant workspace roles:

| Action | Allowed Roles | Description |
|---|---|---|
| `VIEW_ACCOUNT_PLAN` | `VIEWER`, `MEMBER`, `ADMIN`, `OWNER` | Read-only access to plans, objectives, and reviews |
| `UPDATE_OBJECTIVE_PROGRESS` | `MEMBER`, `ADMIN`, `OWNER` | Record current metric values and progress updates |
| `RECORD_VERIFIED_EVIDENCE` | `MEMBER`, `ADMIN`, `OWNER` | Attach telemetry or audit proof to an objective |
| `REPORT_BLOCKER` | `MEMBER`, `ADMIN`, `OWNER` | Raise operational blocker on an objective |
| `RESOLVE_BLOCKER` | `MEMBER`, `ADMIN`, `OWNER` | Mark an operational blocker resolved |
| `MANAGE_STAKEHOLDERS` | `MEMBER`, `ADMIN`, `OWNER` | Add or update stakeholder relationships and sentiment |
| `CREATE_ACCOUNT_PLAN` | `ADMIN`, `OWNER` | Author a new strategic account plan draft |
| `APPROVE_ACCOUNT_PLAN` | `ADMIN`, `OWNER` | Approve account plan and generate an immutable version |
| `SCHEDULE_EBR` | `MEMBER`, `ADMIN`, `OWNER` | Schedule and prepare executive business review |
| `RECORD_EBR_OUTCOME` | `ADMIN`, `OWNER` | Complete EBR and register binding commitments |
