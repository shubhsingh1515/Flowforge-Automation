# Stuck Execution Reconciliation & Queue Recovery Service

## 1. Problem Statement
In distributed workflow systems, worker nodes can crash unexpectedly due to:
- Spot instance or container terminations (SIGKILL, OOMKilled)
- Host kernel panics or cloud node restarts
- Network partitions severing Redis connectivity

When a worker terminates ungracefully, executions in the `RUNNING` status become orphaned "zombies". Without reconciliation, these executions permanently occupy workspace concurrency slots, preventing new automations from executing.

---

## 2. The Reconciliation Architecture

The FlowForge Reconciliation Service (`reconciliationService`) runs as a periodic reliability maintenance job or on-demand via the Operations dashboard.

### Key Characteristics:
1. **Distributed Mutex Lock**:
   - Uses Redis key `flowforge:reconciliation:lock` with a 55-second TTL (`NX` mode).
   - Prevents split-brain duplicate reconciliation runs across horizontally scaled API and worker instances.
2. **Threshold Boundary**:
   - Only executions stuck in `RUNNING` for longer than `maxAgeMinutes` (default: 15 minutes) are identified as candidates.
3. **Atomic State Transition**:
   - Status updated atomically from `RUNNING` to `FAILED`.
   - `finishedAt` recorded.
   - `errorCategory` set to `TIMEOUT`.
   - `errorSummary` set to `"Execution exceeded maximum running threshold (15 minutes). Terminated by automated queue reconciliation service."`.
   - Structured milestone `FAILED` (`reason: "WORKER_TIMEOUT"`) appended to lifecycle timeline.
4. **Audit Logging**:
   - Each reconciliation run persists an `ExecutionReconciliationLog` recording mode (`dry-run` vs `execute`), stuck count, reconciled count, and duration in milliseconds.

---

## 3. Dry-Run Mode vs Live Execution

- **Dry-Run (`mode: "dry-run"`)**:
  - Scans database for candidate executions exceeding the threshold.
  - Returns anomaly list, candidate IDs, and stuck duration without altering database state.
- **Execute (`mode: "execute"`)**:
  - Performs atomic status updates and audit logging.
  - Releases workspace concurrency capacity immediately.

---

## 4. API & Operations Interface
- Trigger: `POST /api/v1/operations/reconcile`
  - Body: `{ "mode": "dry-run" | "execute", "maxAgeMinutes": 15, "limit": 50 }`
- Audit Logs: `GET /api/v1/operations/reconciliation/logs?limit=50`
