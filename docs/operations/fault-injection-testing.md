# Fault Injection & Chaos Resilience Testing

## 1. Principles of Controlled Fault Testing

In Phase 15, FlowForge Automation SaaS incorporates deterministic fault injection testing without risking production data integrity:
- **No Production Chaos**: Fault injection is performed exclusively in test environments using containerized ephemeral databases or isolated mock execution contexts.
- **Fail-Safe Invariants**:
  1. No uncommitted side-effects are executed twice upon worker recovery.
  2. Stale workers whose leases expire are deterministically blocked by fencing tokens.
  3. Database transient errors trigger bounded backoff without retry storms.
  4. Outbox events are guaranteed to persist atomically with execution state transitions.

---

## 2. Automated Test Matrix

The following test scenarios are deterministically verified in `apps/api/test/phase15.test.ts`:

| Fault Scenario | Injection Technique | Expected System Response | Verified In |
| :--- | :--- | :--- | :--- |
| **Worker Preemption / Stolen Lease** | Primary worker acquires lease; lease expires; Secondary worker acquires lease & increments `leaseToken`; Primary attempts commit. | Primary worker commit is strictly rejected with `Concurrent worker lease conflict` / fencing exception. | `test/phase15.test.ts` (Section 1) |
| **Worker Mid-Workflow Crash** | Node 1 completes durably; worker process terminates before Node 2. | New worker detects checkpoint `n_step1`, restores output, skips re-executing Node 1, and completes Node 2 & 3. | `test/phase15.test.ts` (Section 2) |
| **Stuck Execution Reconciler** | Stalled execution with valid checkpoint exceeds age threshold. | Reconciler re-queues execution with `resumeNodeId = lastCheckpointNodeId` and increments `recoveryAttempts`. | `test/phase15.test.ts` (Section 3) |
| **Max Recovery Exceeded** | Stalled execution has already failed 2 recovery attempts. | Reconciler transitions execution to `FAILED` with `WORKER_TIMEOUT_EXCEEDED` to prevent infinite loops. | `test/phase15.test.ts` (Section 3) |
| **Outbox Transient Failure** | External webhook returns 500 / network drop. | Outbox sweeper records failure, increments attempt counter, and schedules exponential backoff with jitter. | `test/phase15.test.ts` (Section 4) |
| **Dead-Letter Queue Overflow** | Event fails all 5 retry attempts. | Event transitions to `DEAD_LETTER` status, triggers operational alert, and awaits operator replay. | `test/phase15.test.ts` (Section 4) |
| **Backup Integrity Corruption** | Archive header or missing core tables simulated. | Drill flags status as `CORRUPTED`, logs missing tables in report, and alerts operator without data modification. | `test/phase15.test.ts` (Section 5) |
