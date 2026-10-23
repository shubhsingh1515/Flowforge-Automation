# FlowForge Automation SaaS — Phase 16 Implementation Plan
## Enterprise Scale, Multi-Region Readiness, Advanced Capacity Management, and Global Traffic Resilience

### Executive Overview & Mission
Phase 16 elevates FlowForge from a single-process/single-worker model to an enterprise-grade, horizontally scalable, multi-replica distributed automation platform with authoritative capacity management, tenant fairness, and region-aware operational readiness.

This architecture preserves all Phase 15 guarantees:
- Worker leases, heartbeats, and monotonically increasing fencing tokens (`leaseToken`).
- Durable step-level checkpoints and bounded crash recovery (`lastCheckpointNodeId`, RPO = 0).
- Atomic transactional outbox dispatch with idempotency and replay guards.

---

### 1. Current Architecture & Scaling Limitations
- **Current Architecture**:
  - API: Fastify server running JWT authentication, organization/workspace multitenancy, REST & Webhook endpoints.
  - Workers: BullMQ execution workers consuming `workflow-execution` and `outbound-webhooks` queues via Redis.
  - Database: PostgreSQL accessed via Prisma ORM with connection pooling.
  - State & Coordination: Redis used for BullMQ queues, rate limiting, and ephemeral coordination. Leases and checkpoints persisted in PostgreSQL.
- **Scaling Limitations**:
  - **Connection Budget Risk**: If multiple API replicas (e.g. 3–5) and multiple worker replicas (e.g. 4–10) run independently, each spinning up default Prisma pools, database connection exhaustion can occur rapidly.
  - **Noisy Neighbor Problem**: An aggressive tenant submitting hundreds of webhook executions can saturate BullMQ worker concurrency and exhaust execution capacity, delaying latency-sensitive tasks for other tenants.
  - **Lack of Predictive Capacity Telemetry**: Prior queue-depth health probes only check a single threshold (`> 5000`) without computing queue drain times, worker saturation rates, enqueue vs completion rates, or DB pool pressure.
  - **Single-Region Hardcoding**: Workspaces and organizations lack authoritative regional affinity, data residency policies, or split-brain protection (failover epochs) when planning multi-region expansion.

---

### 2. Actual Deployment Topology & Infrastructure Dependencies
- **Supported Architecture Tiers**:
  - **Tier A (Fully Supported & Verified)**: Horizontally scalable single-region deployment. Multiple stateless API replicas and independent worker replicas coordinate safely via PostgreSQL and Redis with monotonic fencing tokens and global concurrency caps.
  - **Tier B (Region-Aware Readiness)**: Authoritative home-region metadata (`homeRegion`, `dataResidency`, `failoverEpoch`), server-controlled tenant placement, regional failover drills with epoch bumps, and wrong-region request interception failing closed on mutating operations.
  - *(Tiers C & D: Multi-Region Disaster Recovery with active standby and active-active regional execution require external cross-region infrastructure such as CockroachDB/Aurora Global or multi-region Redis replication, which is documented as future cloud infrastructure rather than fabricated).*
- **Infrastructure Dependencies**:
  - PostgreSQL 16 (Authoritative persistence, leases, fencing, outbox).
  - Redis 7 (BullMQ distributed job queues, rate limits, ephemeral locks).
  - Docker Compose / Container Orchestrators (Kubernetes / ECS ready).

---

### 3. Expected Workloads & Likely Bottlenecks
- **Workload Profiles**:
  - **Interactive API Requests**: Workflow CRUD, dashboard queries, operational telemetry. High concurrency, low latency (< 100ms).
  - **Webhook Trigger Bursts**: High-frequency external HTTP webhooks enqueuing execution jobs.
  - **Execution Processing**: Mixed workloads ranging from fast 2-step flows to heavy multi-step batch flows with HTTP calls and code transforms.
  - **Scheduled Singleton Jobs**: Execution stuck-reconciliation, outbox replay, capacity metrics aggregation, cleanup.
- **Identified Bottlenecks**:
  - Database connection pool contention under multi-replica scale.
  - Queue head-of-line blocking when one tenant bursts.
  - Stale worker write conflicts during worker scale-in or crash recovery.

---

### 4. Capacity-Management Design
- **Queue and Worker Telemetry**:
  - Measure queue depth, active jobs, delayed jobs, failed jobs, enqueue rate, and completion rate.
  - Track worker concurrency utilization and heartbeat freshness.
  - Measure DB pool utilization and query latency.
- **Predictive Drain Time Projections**:
  - Calculate `estimatedDrainTimeSec = waitingJobs / max(completionRatePerSec, 0.1)`.
  - Alert when projected drain time exceeds SLA (e.g. > 120s) or worker saturation persists > 85%.
- **Multi-Factor Backpressure & Load Shedding**:
  - Evaluate queue depth, worker saturation, and DB pool pressure before accepting new execution bursts.
  - Return HTTP 429/503 with standardized `Retry-After: <seconds>` headers and machine-readable `RESOURCE_LIMIT_EXCEEDED` codes without corrupting idempotency or dropping accepted jobs.

---

### 5. Tenant Isolation & Workload Fairness
- **Global Multi-Worker Concurrency Enforcement**:
  - Ensure workspace plan concurrency limits (e.g. 3 for FREE, 10 for PRO, 25 for BUSINESS) are enforced authoritatively across all worker instances, preventing a tenant from monopolizing multi-worker pools.
  - Resumption from checkpoints (`lastCheckpointNodeId`, `resumeNodeId`) continues without counting against new burst allocations.
- **Tenant Fair Scheduling**:
  - Implement tenant fairness checks at worker pickup and admission. If an individual tenant's active executions exceed fair allocation while queue backlog exists, worker prioritizes other tenants' pending work.
- **Noisy Neighbor Diagnostics & Alerts**:
  - Collect per-workspace execution velocity in low-cardinality telemetry.
  - Surface top consuming workspaces in admin `/operations` without leaking sensitive payloads, workflow names, or cross-tenant data.

---

### 6. Regional Deployment Options & Data Ownership
- **Region & Data Residency Schema (`Organization`, `Workspace`)**:
  - `homeRegion`: Authoritative primary region (e.g. `us-east-1`, `eu-central-1`, `ap-southeast-1`). Default: `us-east-1`.
  - `dataResidency`: Residency boundary (`US`, `EU`, `APAC`, `GLOBAL`).
  - `failoverEpoch`: Monotonically increasing epoch counter for regional failover fencing.
  - `workloadPriority`: Tenant execution tier (`BATCH`, `STANDARD`, `HIGH_PRIORITY`).
- **Deterministic Placement & Authoritative Home-Region Routing**:
  - All mutating execution and release promotion requests must be validated against `homeRegion`.
  - If a request targets a non-authoritative regional endpoint, fail closed with HTTP 421 (Misdirected Request) or HTTP 403 with `X-Authoritative-Region` redirect header.

---

### 7. Failure Modes & Split-Brain Prevention
- **Split-Brain Prevention via Regional Failover Epochs**:
  - Each workspace/organization maintains `failoverEpoch`.
  - When regional failover is declared, the recovery controller increments `failoverEpoch` in the authoritative persistence store.
  - Workers running on the evacuated region inspect the execution lease and failover epoch; any worker possessing an outdated epoch is immediately fenced and aborted, preventing split-brain writes.
- **Multi-Worker Lease Fencing**:
  - Monotonically increasing `leaseToken` verified on all checkpoint commits and terminal status updates (`prisma.workflowExecution.updateMany({ where: { id, leaseToken } })`).

---

### 8. Migration & Backward Compatibility
- **Database Schema Additions**:
  - Non-breaking schema additions with safe defaults:
    - Add `homeRegion`, `dataResidency`, `failoverRegion`, `failoverEpoch` to `Workspace` and `Organization`.
    - Create `RegionDeploymentConfig` model for regional cluster status and connection quotas.
    - Create `CapacityMetricSample` model for historical capacity trend analysis.
  - Zero downtime migration with `db:push` and Prisma client generation.
- **Backward Compatibility**:
  - All existing API endpoints, SDK calls, and frontend routes continue to work seamlessly without mandatory changes to caller code.

---

### 9. Security Threat Model
- **Cross-Region Tenant Leakage**: Prevented by server-side home-region scoping.
- **Noisy-Neighbor Denial of Service**: Thwarted by global concurrency quotas and fair scheduling admission.
- **Stale Worker Corruption**: Fenced by monotonic lease tokens and failover epochs.
- **Administrative Operation Protection**: Regional failover drills, capacity tuning, and noisy-neighbor diagnostics restricted strictly to `SYSTEM_ADMIN` / `OWNER` roles with full audit logging.

---

### 10. Verification Plan & Measurable Acceptance Criteria
1. **API Vitest Suite**: Pass 100% of existing 283 tests + new Phase 16 test suite (targeting multi-worker concurrency, fair scheduling, predictive capacity, region placement, and failover epoch fencing).
2. **SDK Vitest Suite**: Pass 100% of tests including new Phase 16 region & scale methods.
3. **Playwright Browser Suite**: 100% green on Desktop and Mobile Chrome, including new Scenario 41 validating Capacity Management & Regional Readiness on the Operations dashboard.
4. **Production Build**: 0 errors across `@flowforge/shared`, `@flowforge/sdk`, `@flowforge/api`, and `@flowforge/web`.
5. **Documentation**: Deliver comprehensive operations guides in `docs/operations/*` and final completion report in `docs/phase-16-completion-report.md`.
