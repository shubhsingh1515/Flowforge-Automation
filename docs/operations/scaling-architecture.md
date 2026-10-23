# FlowForge Operations — Scaling Architecture
## Enterprise Tier A Horizontal Scale & Tier B Regional Readiness

### 1. Scaling Architecture Overview
FlowForge is architected around two verified tiers:
- **Tier A (Horizontally Scalable Single-Region)**: Multiple stateless API instances and worker replicas coordinate via PostgreSQL 16 and Redis 7 with monotonic worker fencing tokens and global concurrency limits.
- **Tier B (Region-Aware Readiness)**: Authoritative home-region routing metadata (`homeRegion`, `dataResidency`, `failoverEpoch`), server-controlled tenant placement, regional failover drills, and wrong-region request fencing.

*(Note: Tiers C & D representing active-passive secondary regions and active-active regional execution require external global cloud infrastructure such as distributed cross-region databases and are documented as future cloud infrastructure).*

---

### 2. Tier A: Multi-Instance Deployment Topology
```
                          [ Global HTTPS / Load Balancer ]
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
     [ API Replica 1 ]                                     [ API Replica 2 ]
  (Fastify, Stateless)                                  (Fastify, Stateless)
             │                                                     │
             ├──────────────────────────┬──────────────────────────┤
             │                          │                          │
             ▼                          ▼                          ▼
     [ Redis 7 Cluster ]      [ PostgreSQL 16 Pool ]     [ Transactional Outbox ]
    (BullMQ Job Queues)       (Authoritative Leases)      (Guaranteed Events)
             ▲                          ▲                          ▲
             │                          │                          │
             ├──────────────────────────┴──────────────────────────┤
             │                                                     │
             ▼                                                     ▼
    [ Worker Replica 1 ]                                  [ Worker Replica 2 ]
 (Concurrency: 5, Token Fencing)                       (Concurrency: 5, Token Fencing)
```

---

### 3. Stateless API Guarantees
- **Session Authentication**: JWT tokens verified against database `Session` records with expiration.
- **Rate Limiting**: Shared Redis counters prevent per-process counter evasion.
- **Webhook Dispatch**: Enqueued asynchronously to BullMQ; no process-local state.
- **Concurrency & Quotas**: Computed authoritatively via PostgreSQL queries across all worker replicas.

---

### 4. Safe Multi-Worker Coordination
- **Execution Leases**: Leases acquired atomically via `updateMany({ where: { status: { in: [PENDING, RUNNING, WAITING_APPROVAL] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: NOW } }, { leaseOwner: workerId }] } })`.
- **Monotonic Fencing Tokens**: `leaseToken` increments on each acquisition. Workers verify `leaseToken` on every durable step checkpoint.
- **Safe Scale-In**: When workers receive `SIGTERM` or `SIGINT`, active jobs are allowed up to 30 seconds to complete or yield a checkpoint.
