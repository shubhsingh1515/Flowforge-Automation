# Operational Dashboard, Health Telemetry & Threshold Alerting

## 1. Overview
The Operations Dashboard (`/operations`) provides real-time infrastructure telemetry, health indicators, and anomaly alerting for system administrators and platform operators.

---

## 2. Real-Time Telemetry Metrics

1. **Database & Cache Health**:
   - Live PostgreSQL ping query latency (`SELECT 1`, in milliseconds).
   - Live Redis ping round-trip latency (`redis.ping()`, in milliseconds).
2. **BullMQ Queue Health**:
   - `waiting`: Count of pending jobs in queue.
   - `active`: Count of jobs actively running on workers.
   - `oldestJobAgeSeconds`: Age of the oldest unhandled job in queue.
3. **Execution Throughput & Success Rate**:
   - Total executions over the rolling 1-hour window.
   - Completed runs vs Failed runs.
   - Success rate percentage ($(\text{completed} / \text{total}) \times 100$).
4. **Worker Concurrency Utilization**:
   - Configured worker slots vs active execution jobs.

---

## 3. Threshold-Based Operational Alerts
The alerting engine (`operationsService.evaluateAlerts()`) continuously evaluates health against predefined operational guardrails:

| Alert | Threshold | Severity | Recommended Operator Action |
|---|---|---|---|
| **High Queue Latency** | `oldestJobAgeSeconds > 60s` | CRITICAL | Scale out worker replicas (`WORKER_CONCURRENCY` or container count). |
| **High Execution Failure Rate** | `failureRate > 20%` (min 5 runs) | WARNING | Inspect `/executions` logs for third-party API outage or invalid credentials. |
| **Elevated Database Latency** | `databaseLatencyMs > 200ms` | WARNING | Check database CPU utilization, connection pool starvation, or slow queries. |

Alert evaluations are surfaced dynamically on the Operations dashboard and can be consumed via `GET /api/v1/operations/overview`.
