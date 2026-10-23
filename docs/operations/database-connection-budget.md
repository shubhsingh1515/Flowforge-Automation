# FlowForge Operations — Database Connection Budget
## PostgreSQL Connection Management for Multi-Replica Scaling

### 1. Connection Budget Strategy
PostgreSQL defaults to `max_connections = 100`. In a multi-replica deployment, per-process pools must be sized conservatively to prevent connection starvation.

---

### 2. Allocation Breakdown
For a standard cluster deployment:
- **PostgreSQL Max Connections**: 100
- **Reserved for Superuser / Migrations**: 10
- **Available Application Connections**: 90

| Service | Replicas | Pool Size per Replica | Total Connections |
| :--- | :---: | :---: | :---: |
| **API Server** | 2 | 15 | 30 |
| **Workflow Worker** | 3 | 12 | 36 |
| **Outbound Webhook Worker** | 1 | 5 | 5 |
| **Background Cron / Sweeper** | 1 | 5 | 5 |
| **Headroom / Burst Reserve** | - | - | 14 |
| **Total Allocation** | - | - | **90** |

---

### 3. Connection Pool Configuration
Prisma connection string configuration:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/flowforge_db?connection_limit=15&pool_timeout=10"
```

For scaling beyond 5 worker replicas, an external connection pooler such as **PgBouncer** in transaction pooling mode is recommended.

---

### 4. Degraded Database Operation
- **Pool Saturation > 70%**: Marked as `WARNING` in `/operations/capacity`.
- **Pool Saturation >= 90%**: Triggers load-shedding backpressure, rejecting new execution requests with HTTP 429 and `Retry-After: 30`.
- **Database Connection Failure**: Health readiness probe `/health/ready` returns HTTP 503 (`not_ready`), removing the unhealthy replica from the load balancer pool.
