# Disaster Recovery & Operational Runbooks

## Runbook DR-01: Stalled / Orphaned Workflow Execution Recovery

### Objective
Identify, inspect, and safely recover workflow executions stuck in `RUNNING` or `PENDING` states after worker process restarts or network partitioning.

### Preconditions
- Operator holds workspace `OWNER` or `ADMIN` role.
- Database connectivity verified (`/api/v1/health/ready` returns 200).

### Execution Steps
1. **Scan Inactive Executions (Dry-Run)**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/operations/reconcile \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"mode": "dry-run", "maxAgeMinutes": 15, "limit": 50}'
   ```
2. **Review Candidate Anomalies**:
   - Executions with valid checkpoints will indicate `proposedAction: "CRASH_RECOVERY_RESUME"`.
   - Executions exceeding maximum recovery limits will indicate `proposedAction: "MARK_FAILED_TIMEOUT"`.
3. **Trigger Live Resumption**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/operations/reconcile \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"mode": "execute", "maxAgeMinutes": 15, "limit": 50}'
   ```
4. **Verification**:
   Inspect `GET /api/v1/operations/reconciliation-logs` to confirm status transitions.

---

## Runbook DR-02: Transactional Outbox Dead-Letter Replay

### Objective
Re-dispatch events that failed asynchronous delivery after 5 retries.

### Execution Steps
1. **Inspect Dead-Letter Queue Depth**:
   ```bash
   curl -X GET http://localhost:4000/api/v1/operations/outbox \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```
2. **Execute Replay**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/operations/outbox/replay \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"limit": 50}'
   ```
3. **Trigger Outbox Sweep**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/operations/outbox/process \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"limit": 50}'
   ```

---

## Runbook DR-03: Backup Verification & Integrity Drill

### Objective
Perform automated, non-destructive restore drill into an isolated scratch database to validate archive checksums without touching production.

### Execution Steps
1. **Execute Verification Drill**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/operations/backup/verify \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"dryRun": true}'
   ```
2. **Verify Report**:
   Ensure `record.status` is `VERIFIED` and `checksumSha256` is recorded.
