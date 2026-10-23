# Phase 15 Enterprise Reliability & Disaster Recovery Release Checklist

## 1. Database & Migrations
- [x] Non-destructive additive schema modifications applied via `prisma db push` / migrations.
- [x] Worker leasing and fencing fields (`leaseOwner`, `leaseToken`, `leaseExpiresAt`, `recoveryAttempts`, `lastCheckpointNodeId`) indexed on `WorkflowExecution`.
- [x] `TransactionalOutboxEvent` table created with unique compound index on `idempotencyKey`.
- [x] `BackupVerificationRecord` table created with SHA-256 integrity checksums.
- [x] `RecoveryAuditRecord` table created for administrative action traceability.
- [x] Generated Prisma Client updated across `@flowforge/database`.

## 2. Execution Engine & Fencing
- [x] Atomically acquired leases with monotonically increasing fencing tokens.
- [x] Stale worker commits rejected upon lease expiration or worker preemption.
- [x] Fine-grained checkpoint resumption restores outputs from `WorkflowStepExecution` and skips completed nodes (`RPO = 0 completed steps`).
- [x] Bounded crash recovery resumption in `reconciliationService` (max 2 recovery attempts before terminal failure).

## 3. Transactional Outbox
- [x] Atomic outbox event enqueue in execution completion transactions.
- [x] Asynchronous outbox processor with exponential backoff and jitter.
- [x] Dead-letter queue tracking and administrative replay APIs.

## 4. Disaster Recovery & Backpressure
- [x] Automated non-destructive backup verification drill against isolated scratch targets.
- [x] SHA-256 archive checksum verification.
- [x] Queue backpressure threshold (`QUEUE_BACKPRESSURE_THRESHOLD = 5000`) with load shedding (HTTP 429 + `Retry-After: 30`).
- [x] Deep health probe (`/health`) reporting database latency, worker queue depth, active leases, and pending outbox events.

## 5. Operations Web UI & SDK
- [x] `/operations` dashboard enhanced with HA leases, Queue Backpressure, Transactional Outbox, and Disaster Recovery Drill triggers.
- [x] `@flowforge/sdk` updated with typed `client.operations` methods.
- [x] Backward-compatible API contracts preserved for all previous phases.

## 6. Automated Test Verification
- [x] API Vitest Suite: 15 suites, 283 tests passing (100% green).
- [x] SDK Vitest Suite: 15 tests passing (100% green).
- [x] Production builds: `@flowforge/shared`, `@flowforge/sdk`, `@flowforge/api`, `@flowforge/web` (23 Next.js routes prerendered).
- [x] Playwright E2E Suite: 40 scenarios across Desktop Chrome and Mobile Chrome.
