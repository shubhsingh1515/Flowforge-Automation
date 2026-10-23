# Disaster Recovery Architecture & Procedures

## 1. Disaster Scenarios & Recovery Matrix

| Severity | Scenario | Detection Signal | Automated Action | Manual Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | Worker Node Crash | Expired lease in DB (`leaseExpiresAt < NOW`) | `reconciliationService` detects expired lease; re-enqueues execution from last checkpoint. | Review worker container logs; check memory/OOM kills. |
| **Tier 1** | Zombie Worker Split-Brain | Stale worker resumes after pause | Monotonically increasing `leaseToken` fencing guard rejects stale commit. | No manual action required; split-brain automatically rejected. |
| **Tier 2** | Redis Cache / Queue Failure | Health probe 503; BullMQ reconnecting | API pauses queue ingestion and responds with 429 backpressure. | Restart Redis container; verify AOF persistence rebuild. |
| **Tier 3** | Primary PostgreSQL Corruption | DB query timeout; read/write errors | Liveness probes fail; readiness returns 503; traffic halted. | Trigger PITR restore runbook to restore from last verified backup snapshot. |
| **Tier 3** | Total Host Hardware Loss | Host ping failure; all containers down | Multi-host standby or secondary VM provisioned. | Repoint DNS to secondary VM; run `docker compose -f docker-compose.prod.yml up -d` with restored storage volume. |

---

## 2. Point-in-Time Recovery (PITR) Procedure

1. **Stop active API and worker traffic**:
   ```bash
   docker stop flowforge-prod-api flowforge-prod-worker
   ```
2. **Restore PostgreSQL data from snapshot**:
   ```bash
   docker exec -i flowforge-prod-postgres pg_restore -U flowforge -d flowforge_db_restore /backups/flowforge_snapshot_latest.dump
   ```
3. **Replay WAL logs to target timestamp**:
   Configure `recovery.signal` with target restore timestamp.
4. **Verify database consistency**:
   Trigger `disasterRecoveryService.runVerificationDrill()` to ensure all schemas and records are integral.
5. **Resume services**:
   ```bash
   docker start flowforge-prod-api flowforge-prod-worker
   ```
