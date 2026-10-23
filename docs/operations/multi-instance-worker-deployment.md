# FlowForge Operations — Multi-Instance Worker Deployment
## Horizontal Scaling, Worker Leases, and Safe Shutdown

### 1. Multi-Worker Architecture
FlowForge execution workers are stateless consumers of the BullMQ `workflow-execution` queue. Any number of worker instances can safely connect to the shared Redis instance.

---

### 2. Coordination Guarantees
1. **Worker Heartbeat Leasing**:
   - Each execution is leased for 30 seconds (`leaseExpiresAt`).
   - Monotonically increasing fencing tokens (`leaseToken`) prevent stale or zombie workers from committing checkpoint updates.
2. **Crash Recovery & Orphan Detection**:
   - The reconciliation service (`POST /operations/reconcile`) identifies un-heartbeated executions (`leaseExpiresAt < NOW`) and safely re-enqueues them with `resumeNodeId = lastCheckpointNodeId`.
3. **Graceful Scale-In**:
   - On `SIGTERM` / `SIGINT`, workers stop picking up new jobs from BullMQ.
   - Active executions are permitted up to 30 seconds to finish current steps and commit checkpoints before exit.

---

### 3. Docker Compose Example for Multi-Worker Scaling
Scale worker replicas easily using Docker Compose:
```bash
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```
Workers automatically coordinate via PostgreSQL and Redis without manual cluster configuration.
