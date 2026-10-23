# FlowForge Operations — Regional Disaster Recovery
## Controlled Regional Failover, RTO/RPO Targets, and Drill Procedures

### 1. Recovery Architecture
In the event of an outage in the primary region (`us-east-1`):
1. **Authoritative Persistence Target**: Secondary region database replica is promoted to primary.
2. **Failover Epoch Advance**: `failoverEpoch` is incremented across the regional deployment config and affected tenant workspaces.
3. **Queue Reconciliation**: Stale leases are pruned; durable execution checkpoints allow pending workflows to resume from `lastCheckpointNodeId`.
4. **Secret Availability**: Credential encryption keys are pre-synced via secure KMS replication.

---

### 2. Recovery Objectives
- **Target RTO (Recovery Time Objective)**: < 15 minutes (Database promotion, worker initialization, queue replay).
- **Target RPO (Recovery Point Objective)**: < 1 minute (Asynchronous database replication lag; 0 data loss for completed checkpoints with synchronous streaming).

---

### 3. Non-Destructive Regional Failover Drills
Administrators can execute non-destructive regional failover drills via:
- UI: `/operations` -> Click "Run Regional Failover Drill"
- API: `POST /api/v1/operations/regions/failover-drill`
- SDK: `client.scale.runFailoverDrill({ sourceRegion: "us-east-1", targetRegion: "eu-central-1" })`

**Drill Verification Sequence**:
1. Increments `failoverEpoch`.
2. Updates `RegionalFailoverDrillRecord` in PostgreSQL.
3. Logs audit entry in `RecoveryAuditRecord`.
4. Stale regional workers possessing outdated epoch tokens are fenced immediately.
