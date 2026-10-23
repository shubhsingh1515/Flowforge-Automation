# FlowForge Automation SaaS — Phase 18 Implementation Plan
## Enterprise Observability 2.0, SLO-Driven Automation, Predictive Incident Management, and Self-Healing Operations

**Author:** Principal Distributed-Systems Architect, SRE, Security Engineer & Full-Stack Lead  
**Scope:** Phase 18 End-to-End Implementation  
**Status:** In Progress  

---

## 1. Overview & Architectural Objectives

Phase 18 advances FlowForge Automation from localized health metrics and manual diagnostics into a cohesive **Enterprise Operational Intelligence & Autonomous Self-Healing Platform**. 

Building directly upon the foundations established in Phases 1–17 (durable execution runner, checkpoint recovery, worker leases and monotonically increasing fencing tokens, transactional outbox, deployment approvals, regional failovers, data residency, and CMEK), Phase 18 implements:

1. **Unified Health & Telemetry Topology**: Comprehensive real-time aggregation across workers, BullMQ queues, execution engines, transactional outbox, Redis, PostgreSQL connection pools, external integrations, and regional clusters.
2. **SLO-Driven Incident Detection & Error-Budget Governance**: Automated evaluation of `ReliabilityObjective` records (Phase 14) against rolling telemetry windows (P95 latency, success rate, execution duration, queue wait time), tracking error budget consumption (`HEALTHY`, `AT_RISK`, `BREACHED`, `INSUFFICIENT_DATA`), and enforcing deployment release gates.
3. **Deterministic Incident Correlation & Root-Cause Synthesis**: Grouping related alerts by `correlationKey`, service, error category, or affected resource into unified `Incident` records with multi-stage lifecycles (`OPEN` -> `ACKNOWLEDGED` -> `INVESTIGATING` -> `MITIGATING` -> `RESOLVED` -> `CLOSED`), timeline event tracking, and evidence-backed diagnostic analysis distinguishing symptoms, facts, and hypotheses.
4. **Safe, Allowlisted Automated Remediation (Self-Healing)**: Strict, typed action registry (`RETRY_RETRYABLE_EXECUTION`, `REQUEUE_ABANDONED_JOB`, `REPLAY_FAILED_OUTBOX_EVENT`, `PAUSE_FAILING_DEPLOYMENT`, `SCALE_CONCURRENCY_BACKPRESSURE`) governed by `RemediationPolicy` with three autonomy modes (`OBSERVE_ONLY` default, `APPROVAL_REQUIRED`, `POLICY_AUTOMATED`), multi-gate safety checks (fencing, residency, epoch, lease), and verified outcome confirmation.
5. **Predictive Capacity & Anomaly Warnings**: Rolling statistical trend analysis over `CapacityMetricSample` (Phase 16) detecting rising queue age, drain time deterioration (> 60s), outbox backlogs, and connection saturation with confidence levels (`INSUFFICIENT_DATA` for sample sizes < 3).
6. **Deduplicated Incident Notifications & Escalations**: Integration with in-app notification center and outbound webhooks with severity-based escalation, rate-limited cooldowns, and secret redaction.
7. **Enterprise UI (`/operations`)**: Live Service Health Matrix, Active Incidents Drawer, Incident Detail & Root Cause Analyzer, Remediation Action Panel & Approvals, and Predictive Anomaly Banners.
8. **TypeScript SDK & REST APIs**: Typed `client.incidents`, `client.remediations`, `client.observability` with 100% test coverage.

---

## 2. Monorepo Mapping & Persistence Strategy

### 2.1 Persistence Layer (`packages/database/prisma/schema.prisma`)
New entities to add:
- `OperationalIncident`:
  - `id`, `workspaceId`, `title`, `severity` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), `status` (`OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `MITIGATING`, `RESOLVED`, `CLOSED`), `category` (`SLO_BREACH`, `WORKER_FAILURE`, `QUEUE_SATURATION`, `INTEGRATION_ERROR`, `OUTBOX_BACKLOG`, `REGIONAL_DEGRADATION`), `sourceService`, `correlationKey`, `rootCauseSummary`, `candidateCauses` (Json), `suggestedAction` (String?), `affectedWorkflows` (String[]), `affectedRegions` (String[]), `assignedToUserId` (String?), `acknowledgedAt`, `resolvedAt`, `closedAt`, `metadata` (Json?), `createdAt`, `updatedAt`.
- `OperationalIncidentTimelineEvent`:
  - `id`, `incidentId`, `eventType` (`ALERT_TRIGGERED`, `STATUS_CHANGED`, `NOTE_ADDED`, `REMEDIATION_TRIGGERED`, `REMEDIATION_COMPLETED`, `REMEDIATION_FAILED`, `ESCALATION_SENT`), `actorId` (String?), `actorType` (`SYSTEM`, `USER`, `WORKER`), `details` (Json?), `createdAt`.
- `RemediationPolicy`:
  - `id`, `workspaceId`, `name`, `autonomyMode` (`OBSERVE_ONLY`, `APPROVAL_REQUIRED`, `POLICY_AUTOMATED`), `allowedActions` (String[]), `maxAutomatedActionsPerIncident` (Int default 3), `cooldownMinutes` (Int default 15), `createdAt`, `updatedAt`.
- `RemediationOperation`:
  - `id`, `workspaceId`, `incidentId` (String?), `actionKey`, `status` (`PENDING_APPROVAL`, `APPROVED`, `EXECUTING`, `COMPLETED`, `FAILED`, `REJECTED`, `VERIFIED`, `UNVERIFIED`), `riskLevel` (`LOW`, `MEDIUM`, `HIGH`), `targetType` (`EXECUTION`, `OUTBOX_EVENT`, `QUEUE_JOB`, `DEPLOYMENT`, `CONCURRENCY`), `targetId`, `parameters` (Json?), `requestedByUserId` (String?), `approvedByUserId` (String?), `approvedAt` (DateTime?), `executedAt` (DateTime?), `verifiedAt` (DateTime?), `resultSummary` (String?), `error` (String?), `createdAt`, `updatedAt`.
- `OperationalCapacityWarning`:
  - `id`, `workspaceId` (String?), `regionKey`, `signalType` (`QUEUE_AGE_SPIKE`, `DRAIN_TIME_DETERIORATION`, `OUTBOX_ACCUMULATION`, `WORKER_LEASE_SATURATION`, `DB_POOL_PRESSURE`), `severity` (`WARNING`, `CRITICAL`), `currentValue` (Float), `baselineValue` (Float), `thresholdValue` (Float), `confidence` (`HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT_DATA`), `recommendation` (String), `isResolved` (Boolean default false), `createdAt`, `resolvedAt`.

### 2.2 Shared Types & Schemas (`packages/shared/src/observability-p18.ts`)
- Zod schemas:
  - `OperationalIncidentSchema`, `UpdateIncidentStatusSchema`, `AssignIncidentSchema`, `AddIncidentNoteSchema`
  - `RemediationPolicySchema`, `UpdateRemediationPolicySchema`
  - `RemediationOperationSchema`, `CreateRemediationSchema`, `ApproveRemediationSchema`
  - `CapacityWarningSchema`, `UnifiedHealthSummarySchema`
- Enums:
  - `INCIDENT_SEVERITIES`, `INCIDENT_STATUSES`, `INCIDENT_CATEGORIES`, `REMEDIATION_AUTONOMY_MODES`, `REMEDIATION_ACTION_KEYS`, `REMEDIATION_STATUSES`.

### 2.3 Backend Domain Services (`apps/api/src/services/`)
- `apps/api/src/services/sloEngine.ts`: Evaluates `ReliabilityObjective`, tracks error budgets, fires deduplicated alerts.
- `apps/api/src/services/incidentService.ts`: Incident lifecycle, correlation, timeline event logging, root-cause synthesis.
- `apps/api/src/services/remediationEngine.ts`: Registered action registry, deterministic safety gates, execution and post-action verification.
- `apps/api/src/services/predictiveCapacityService.ts`: Evaluates rolling metric samples, flags trend anomalies.
- `apps/api/src/services/unifiedHealthService.ts`: Real-time multi-dimensional health scorecard.

### 2.4 API Routes (`apps/api/src/routes/`)
- `apps/api/src/routes/incidents.ts`: List, get, update status, assign, add notes, retrieve root cause analysis.
- `apps/api/src/routes/remediations.ts`: Get policy, update policy, list operations, request remediation, approve/reject, verify outcome.
- `apps/api/src/routes/observability.ts`: Unified health matrix, active capacity warnings, evaluate SLOs on-demand.

### 2.5 SDK & Web Frontend
- `packages/sdk/src/index.ts`: Add `client.incidents`, `client.remediations`, `client.observability`.
- `apps/web/src/lib/api.ts`: Add API client methods.
- `apps/web/src/app/operations/page.tsx`: Integrate Service Health Grid, Incidents & Root Cause, Remediation & Approvals, and Predictive Warnings.

---

## 3. Verification & Execution Sequence

1. Database Schema Sync: `prisma db push` and Prisma client regeneration.
2. Shared Package: build `@flowforge/shared`.
3. Service & Route Implementation in `apps/api`.
4. SDK & Web UI Implementation.
5. Automated Tests:
   - Vitest suite `apps/api/test/phase18.test.ts`.
   - SDK suite `packages/sdk/test/sdk.test.ts`.
   - Full regression suite across all 18 test files.
   - Playwright E2E suite `e2e/smoke.spec.ts` (Scenario 43).
6. Documentation & Completion Report.
