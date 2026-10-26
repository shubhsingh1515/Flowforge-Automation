# FlowForge Automation — Phase 27 Architecture

## Enterprise Customer Portfolio Intelligence, Strategic Account Planning & Growth Governance

### Overview

Phase 27 establishes the strategic layer of customer operations in FlowForge Automation SaaS. Building upon Phase 25 (Customer Operations & 360 Foundation) and Phase 26 (Revenue Intelligence & Renewal Pipelines), Phase 27 provides customer-facing executives, account directors, and Customer Success Managers (CSMs) with deterministic portfolio prioritization, verifiable business objective realization, stakeholder influence mapping, versioned account plans, and auditable executive review workflows.

```
+--------------------------------------------------------------------------------------------------------+
|                                  FlowForge Automation Platform Architecture                            |
+--------------------------------------------------------------------------------------------------------+
|                                                                                                        |
|  [Phase 25] Customer 360 Foundation   <--->  [Phase 26] Revenue & Renewal Pipelines                     |
|    - Accounts, Contacts, CRM Mappings          - Contracts, Renewal Milestones, Expansions             |
|    - Deterministic Health, Tasks, Journeys     - Renewal Risk Evaluations, Retention Governance        |
|                                     \             /                                                    |
|                                      v           v                                                     |
|                  +----------------------------------------------------------+                          |
|                  |     Phase 27: Strategic Portfolio & Account Planning    |                          |
|                  +----------------------------------------------------------+                          |
|                  | 1. Strategic Account Classification & Ownership Matrix   |                          |
|                  |    - Strategic Tier (Tier 1-4, Strategic, Growth, etc.) |                          |
|                  |    - Coverage: Exec Sponsor, Lead CSM, Account Director  |                          |
|                  | 2. Stakeholder Mapping & Single-Thread Risk              |                          |
|                  |    - Champion, Decision Maker, Economic Buyer, Detractor |                          |
|                  |    - Sentiment, Engagement Level, Role History Ledger    |                          |
|                  | 3. Quantified Objectives & Verified Evidence Ledger      |                          |
|                  |    - Target vs Current Metrics, Operational Blockers     |                          |
|                  |    - Link to Telemetry / Execution / Workflow Proof      |                          |
|                  | 4. Versioned Strategic Account Plans & Snapshots         |                          |
|                  |    - Draft -> In Review -> Active -> Superseded         |                          |
|                  |    - Immutable JSON Snapshot of Objectives & Milestones  |                          |
|                  | 5. Strategic Initiatives & Project Milestones            |                          |
|                  |    - Progress tracking, owner assignment, blockers       |                          |
|                  | 6. Governed Executive Business Reviews (EBR / QBR)       |                          |
|                  |    - Preparation Snapshot, Verified Attendees            |                          |
|                  |    - Idempotent Action Item Commitments                  |                          |
|                  | 7. Deterministic Portfolio Prioritization Evaluation     |                          |
|                  |    - Explainable Multi-Factor Scoring (0-100)            |                          |
|                  |    - CRITICAL / HIGH / MEDIUM / LOW Attention Levels     |                          |
|                  +----------------------------------------------------------+                          |
+--------------------------------------------------------------------------------------------------------+
```

### Core Architecture Principles

1. **Deterministic & Explainable Scoring**:
   Portfolio prioritization is calculated strictly through deterministic mathematical rules combining account ARR, renewal proximity, customer health status, blocker severity, single-thread relationship risks, and EBR timeliness. No hallucinated sentiments or opaque models.
2. **Strict Multi-Tenant Isolation**:
   Every entity (`CustomerStrategicAccountProfile`, `CustomerAccountPlan`, `CustomerSuccessObjective`, `CustomerStakeholderRelationship`, `CustomerExecutiveReview`, `CustomerPortfolioPriorityEvaluation`, etc.) is partitioned by `workspaceId`. Foreign keys are guarded with composite indexes `[workspaceId, customerAccountId]`.
3. **Auditability & Immutable History**:
   Stakeholder relationship transitions, account plan version approvals, and executive review prep states are stored immutably to provide an enterprise-grade paper trail for compliance and leadership oversight.
4. **Integration without Duplication**:
   Phase 27 references existing Phase 25 `CustomerAccount`, `CustomerContact`, `CustomerHealthEvaluation` and Phase 26 `CustomerContract`, `CustomerRenewalMilestone`, `CustomerExpansionOpportunity` records rather than duplicating them. Action items from EBRs materialize directly as Phase 25 `CustomerTask` items.
