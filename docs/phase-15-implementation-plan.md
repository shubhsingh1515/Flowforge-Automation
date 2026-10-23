# FlowForge Automation SaaS — Phase 15 Implementation Plan
## High Availability, Disaster Recovery, Resilient Execution, and Enterprise Reliability Engineering

**Author:** Principal Platform Architect, Senior Distributed Systems Engineer, Database Reliability Engineer, Security Engineer, QA Lead  
**Date:** October 23, 2026  
**Status:** APPROVED FOR IMPLEMENTATION  

---

## 1. Existing Reliability Architecture

FlowForge Automation has established a robust baseline across Phases 1–14:
1. **Persistence & Data Modeling (`packages/database`)**:
   - Single primary PostgreSQL instance (version 16-alpine) managed via Prisma ORM.
   - Core domain models include `Workflow`, `WorkflowVersion`, `WorkflowExecution`, `WorkflowStepExecution`, `WorkspaceGovernancePolicy`, `WorkspaceAuditLog`, and `ReliabilityObjective`.
   - Execution state snapshots are stored in `WorkflowExecution.executionState` and `executionTrace`.
2. **Asynchronous Execution & Queue Architecture (`apps/api/src/worker`)**:
   - Redis 7-alpine with BullMQ running persistent job queues (`workflow-execution` and `outbound-webhooks`).
   - Standard BullMQ job retry policies (3 attempts with exponential backoff and jitter).
   - Graceful worker shutdown handling (`stopWorker()` closes worker instances cleanly upon `SIGINT`/`SIGTERM`).
3. **Stuck Execution Reconciliation (`apps/api/src/services/reconciliation.ts`)**:
   - Cluster-level distributed mutex using Redis (`flowforge:reconciliation:lock`).
   - Periodic scanning of executions stuck in `RUNNING` or `PENDING` past an age threshold (default 15 minutes) and transitions to `FAILED` with `WORKER_TIMEOUT`.
4. **Health Probes & Telemetry (`apps/api/src/routes/health.ts`, `apps/api/src/services/diagnostics.ts`)**:
   - `/health` provides aggregated health of DB and BullMQ worker queue.
   - `/health/live` returns HTTP 200 process liveness.
   - `/health/ready` validates PostgreSQL query execution (`SELECT 1`).
   - Prometheus metrics for execution throughput, durations, error categories, and queue counts.
5. **Release Governance & Rollback (Phase 12 & 14)**:
   - SHA-256 hashed immutable release artifacts (`WorkflowReleaseArtifact`).
   - Atomic rollback to previous known-good releases.
   - Isolated environments (`DEVELOPMENT`, `STAGING`, `PRODUCTION`).

---

## 2. Current Single Points of Failure and Recovery Limitations

1. **Zombie Worker State Corruption & Race Conditions**:
   - Currently, `WorkflowExecution` lacks an explicit lease owner and monotonically increasing fencing token (`leaseToken`).
   - If a worker stalls (e.g. garbage collection pause or network blip), a reconciler or failover worker could resume or re-run the execution. When the stalled zombie worker awakens, it could commit outdated results or duplicate external side effects.
2. **Step Rerun on Crash (Lack of Fine-Grained Checkpoint Resumption)**:
   - When an execution fails midway, rerunning or retrying restarts from step 1 (unless explicitly paused at a human approval step).
   - Expensive or non-idempotent third-party side-effects (e.g. Stripe charge, Slack notification) risk being re-executed unnecessarily.
3. **Out-of-Band Event Loss (Dual-Write Hazard)**:
   - When a workflow execution completes or changes state, `outboundWebhookService.emitEvent(...)` is called asynchronously outside the database transaction.
   - If the API or worker process crashes immediately after committing the DB transaction or if Redis is unreachable, the outbound event is lost permanently without retry.
4. **Backup Verification Void**:
   - Database backups are taken via standard volume persistence or pg_dump, but there is no automated, non-destructive restore verification drill in place to test backup archive integrity, schema consistency, and recovery time.
5. **Absence of Queue Backpressure Limits**:
   - The API accepts webhook trigger requests and enqueues jobs regardless of BullMQ queue lag or depth. Under extreme traffic spikes, Redis queue memory or worker latency could balloon without backpressure (HTTP 429 / 503).
6. **Deployment Realism**:
   - Current deployment runs on a single host via Docker Compose (`docker-compose.prod.yml`). It does not provide automatic multi-region active-active failover. Any HA claims must truthfully reflect single-host container replication and cluster readiness rather than fictional multi-region guarantees.

---

## 3. Database and Queue Durability Assumptions

1. **PostgreSQL Durability**:
   - Data is stored in the Docker volume `postgres_prod_data` with WAL journaling (`fsync=on`).
   - Prisma connection pool is managed per process.
   - Schema upgrades run through `prisma db push` / migrations with backward-compatible additive columns.
2. **Redis Durability**:
   - Redis configured with `appendonly yes` (AOF persistence) and `maxmemory 512mb` with `noeviction`.
   - BullMQ stores queue state, active job markers, and delayed timestamps in Redis.
   - Restarting Redis with AOF restores pending and delayed jobs; however, Redis in-memory cache is single-instance in Docker Compose.
3. **At-Least-Once Delivery & Deduplication**:
   - Jobs in BullMQ are delivered at least once.
   - Transient network errors trigger retries.
   - Deduplication is guaranteed through execution correlation IDs, idempotency keys on billing/usage records, and unique constraints on `webhook_event_receipts`.

---

## 4. Execution Delivery and Idempotency Guarantees

| Domain | Delivery Semantic | Deduplication Mechanism |
| :--- | :--- | :--- |
| **Inbound Webhooks** | At-least-once ingestion | `WebhookEventReceipt` unique compound key `[workflowId, eventId]`. |
| **Worker Queue Jobs** | At-least-once processing | Unique BullMQ `jobId` derived from `executionId` + attempt count. |
| **Step Execution** | At-least-once with checkpoint resumption | Checkpointed node states in `WorkflowStepExecution` and `lastCheckpointNodeId`. Completed steps are skipped on resumption. |
| **Stale Worker Commits** | Strictly rejected via Fencing Tokens | Monotonically increasing `leaseToken`. If worker lease token != DB execution lease token, commit fails immediately. |
| **Outbound Webhooks** | At-least-once guaranteed delivery | Transactional Outbox pattern (`TransactionalOutboxEvent`) committed in same DB transaction, processed asynchronously with exponential backoff & DLQ. |
| **Billing / Usage Metering** | Strictly idempotent | `UsageRecord.idempotencyKey` unique index prevents duplicate billing deduction. |

---

## 5. Proposed Recovery Objectives (RTO & RPO)

| Scenario | Objective | Target | Measurement Method | Verification Type |
| :--- | :--- | :--- | :--- | :--- |
| **Worker Crash / Restart** | RTO | < 30 seconds | Time for reconciler/resumption to detect expired lease and reassign. | Automated Fault-Injection Test |
| **Execution Crash Recovery** | RPO | 0 completed steps | Resumes from `lastCheckpointNodeId`; no completed step lost or rerun. | Automated Integration Test |
| **Outbox Event Delivery Lag** | RTO | < 5 seconds | Time from execution finish to outbound webhook dispatch. | Automated Outbox Benchmark |
| **Outbox Failure Backoff** | Reliability | Max 5 retries | Exponential backoff (1s, 2s, 4s, 8s, 16s) before moving to Dead-Letter Queue. | Automated DLQ Test |
| **PostgreSQL Database Restore** | RTO | < 5 minutes | Time to unpack verified backup and restore into isolated database. | Non-destructive Restore Drill |
| **PostgreSQL Data Loss** | RPO | < 1 hour | Periodic backup snapshot frequency + WAL logs. | Verified Backup Schedule |
| **Queue Backpressure Threshold** | Protection | 5,000 pending jobs | Rejection of non-critical ingestion with HTTP 429/503 and `Retry-After`. | Load & Backpressure Test |

---

## 6. Migration and Backward Compatibility Strategy

1. **Non-Destructive Schema Additions**:
   - `WorkflowExecution`: Add nullable/default fields (`leaseOwner`, `leaseToken` default 0, `leaseExpiresAt`, `recoveryAttempts` default 0, `lastCheckpointNodeId`).
   - Add new standalone models: `TransactionalOutboxEvent`, `BackupVerificationRecord`, and `RecoveryAuditRecord`.
   - Existing workflows, executions, versions, and test suites continue operating without disruption.
2. **Safe Staged Rollout**:
   - Phase 1: Deploy schema additions with additive migrations.
   - Phase 2: Deploy updated execution engine supporting lease tokens and transactional outbox.
   - Phase 3: Existing pending/running executions smoothly transition on their next worker lease acquisition.

---

## 7. Infrastructure Dependencies and Deployment Assumptions

1. **Supported Architecture**:
   - Primary: Single-host multi-container Docker Compose deployment (`docker-compose.prod.yml`).
   - Application containers: API service (`flowforge-prod-api`), Web UI (`flowforge-prod-web`), Worker daemon (`flowforge-prod-worker`).
   - Stateful services: PostgreSQL 16 Alpine container with persistent volume; Redis 7 Alpine container with persistent volume.
2. **Clustering & Multi-Instance Readiness**:
   - Stateless API and Web services designed to scale horizontally across multiple container replicas.
   - Distributed mutex locks (`redisConnection.set(..., 'NX')`) protect singleton reconciliation and outbox sweeper routines across multiple worker instances.
   - Truthful operational boundary: Multi-host clustering, managed RDS multi-AZ failover, and multi-region replication require cloud orchestration (e.g. AWS ECS/EKS with RDS Aurora Multi-AZ) which is documented in the Disaster Recovery Architecture guide but not simulated as existing locally.

---

## 8. Security Considerations

1. **Tenant Isolation**:
   - All outbox events, execution leases, and recovery audit records maintain mandatory `workspaceId` tenant boundaries.
2. **Operator Authorization**:
   - Disaster recovery drills, manual execution reconciliation, and outbox replays are restricted strictly to workspace `OWNER` and `ADMIN` roles or system administrators.
3. **Secret Redaction**:
   - Backup verification reports and disaster recovery logs scrub all database credentials, connection strings, JWT keys, and customer integration secrets using `redactSensitiveData()`.
4. **Isolated Restore Targets**:
   - Restore drills execute against temporary, isolated scratch databases (e.g. `flowforge_restore_verify_tmp`) and never mutate the active database.

---

## 9. Test and Fault-Injection Strategy

1. **Unit & Integration Suite (`apps/api/test/phase15.test.ts`)**:
   - **Worker Fencing & Zombie Worker Rejection**: Simulate Worker A pausing; Worker B acquiring lease and incrementing fencing token; Worker A attempting to commit step results and being rejected with a fencing exception.
   - **Checkpoint-Based Resumption**: Simulate multi-step workflow interruption after step 2; trigger crash recovery; assert step 1 and 2 are skipped and step 3 resumes seamlessly.
   - **Transactional Outbox Durability & Retry**: Assert outbox event is created inside execution transaction; verify sweeper processes event, handles simulated transient dispatch failures with exponential backoff, and moves to DLQ on max retries.
   - **Backup Integrity & Verification Drill**: Verify SHA-256 checksum calculation, archive header inspection, isolated schema validation, and timestamped audit report generation.
   - **Queue Backpressure Enforcement**: Simulate queue backlog exceeding threshold; verify API returns HTTP 429/503 with `Retry-After` header.
2. **SDK Verification (`packages/sdk/test/phase15.test.ts`)**:
   - Verify SDK methods for operations overview, outbox management, backup verification, and recovery logs.
3. **Playwright E2E Smoke Tests (`e2e/smoke.spec.ts`)**:
   - Operations dashboard inspection verifying Phase 15 HA, Outbox, and Backup Verification widgets.

---

## 10. Acceptance Criteria

- [x] Baseline test verification complete (14 API suites, 266 tests green).
- [ ] Database schema enhanced with fencing fields, outbox table, backup verification table, and recovery audit table.
- [ ] Execution engine augmented with lease acquisition, heartbeats, fencing token verification, and checkpoint resumption.
- [ ] Transactional outbox engine implemented with atomic DB enqueue, async worker dispatch, retry backoff, and DLQ replay.
- [ ] Disaster recovery service implemented with non-destructive backup checksum and isolated schema validation.
- [ ] Queue backpressure and multi-instance readiness health probes integrated into `/health/ready` and `/operations`.
- [ ] Operations web UI (`/operations`) upgraded with HA metrics, outbox status, and backup drill triggers.
- [ ] SDK and TypeScript types updated in `@flowforge/shared` and `@flowforge/sdk`.
- [ ] Comprehensive Phase 15 automated test suites pass 100%.
- [ ] Complete operational documentation and `docs/phase-15-completion-report.md` written truthfully.
