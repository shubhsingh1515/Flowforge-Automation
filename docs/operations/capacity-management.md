# FlowForge Operations — Capacity Management
## Real-Time Telemetry, Predictive Drain Time, and Multi-Factor Backpressure

### 1. Capacity Management Principles
Capacity management protects database pools, worker concurrency, and queue latency from cascading failures and brownouts.

---

### 2. Predictive Drain-Time Calculations
The platform continuously samples execution velocity over rolling 5-minute windows:
$$\text{Projected Drain Time (sec)} = \frac{\text{Waiting Jobs}}{\max(\text{Completion Rate per Sec}, 0.05)}$$

When completion rate is 0 and waiting jobs exist, default estimate is calculated as $5 \times \text{Waiting Jobs}$ (assuming 5s average execution duration).

---

### 3. Multi-Factor Backpressure & Load Shedding
Backpressure is evaluated across three critical dimensions:
1. **Queue Backlog**: Normal (< 500), Elevated (500–4999), Critical (>= 5000).
2. **Worker Saturation**: Normal (< 85%), Elevated (>= 85%).
3. **Database Connection Saturation**: Healthy (< 70%), Warning (70–89%), Exhausted (>= 90%).

**Response Behavior**:
- When `NORMAL`: HTTP 200/201.
- When `ELEVATED`: Triggers warning alerts in `/operations`, suggests worker scale-out.
- When `CRITICAL`: Returns HTTP 429 with `Retry-After: 30` header and structured JSON error:
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Queue depth exceeded threshold (5000 jobs). Load shedding active.",
  "retryAfterSeconds": 30
}
```
Idempotency keys ensure retried requests do not generate duplicate executions.

---

### 4. Administrator Operations Endpoint
`GET /api/v1/operations/capacity`
Requires `OWNER` or `ADMIN` workspace role. Exposes:
- `deploymentTier`: Tier description.
- `queueMetrics`: waiting, active, delayed, failed, enqueue rate, completion rate, projected drain time.
- `workerCapacity`: total concurrency, allocated concurrency, saturation percentage.
- `dbConnectionBudget`: pool saturation percentage, status (`HEALTHY`, `WARNING`, `EXHAUSTED`).
- `backpressure`: active, status, recommended retry-after seconds.
- `noisyNeighbors`: top saturated tenants.
