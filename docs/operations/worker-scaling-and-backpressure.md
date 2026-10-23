# Worker Scaling, Concurrency Controls, and Backpressure Handling

## 1. Overview
FlowForge provides dual-layer concurrency controls to ensure fair resource isolation among multi-tenant workspaces while enabling horizontal scaling across worker clusters.

---

## 2. Configurable Worker Concurrency
- Configured via environment variable `WORKER_CONCURRENCY` (default: `5`).
- Governs the number of parallel BullMQ jobs processed concurrently by a single worker instance.
- Scalable horizontally by launching additional worker containers or processes; BullMQ automatically distributes queue jobs across all active workers.

```bash
# Example worker instance scaling
WORKER_CONCURRENCY=20 npm run start:worker
```

---

## 3. Server-Authoritative Workspace Concurrency Limits
Regardless of how many worker instances are active, each workspace is subject to an entitlement-based active execution cap:
- **FREE**: 2 concurrent executions
- **PRO**: 5 concurrent executions
- **BUSINESS**: 20 concurrent executions
- **ENTERPRISE**: 50 concurrent executions

### Enforcement Mechanism:
Before a workflow runner starts processing:
1. `entitlementService.canExecuteConcurrentWorkflow(workspaceId)` counts executions currently in `RUNNING` status for that workspace.
2. If `activeCount >= limit`, the execution is immediately rejected with:
   - `status: "FAILED"`
   - `errorCategory: "CONCURRENCY_LIMIT"`
   - `errorSummary: "Workspace concurrent execution limit reached (... active). Upgrade your plan or wait for running executions to complete."`
   - Structured diagnostic failure summary and remediation tip attached.

---

## 4. Rate Limit Backpressure & Retry-After Handling
When integrations encounter HTTP 429 (Too Many Requests) or HTTP 503 (Service Unavailable):
1. FlowForge parses the standard `Retry-After` HTTP header (in seconds or RFC 7231 date format).
2. If absent, an exponential backoff algorithm with full jitter is applied:
   $$\text{backoff} = \min(60, 2^{\text{attempt}} \times 1.5) + \text{random\_jitter}$$
3. The BullMQ worker delays the retry job by the calculated backoff window rather than hammering upstream APIs.
