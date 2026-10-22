# FlowForge Automation SaaS — Monitoring, Observability & Alerting Guide

## 1. Observability Architecture
FlowForge implements a three-pillar observability architecture:
1. **Metrics**: Prometheus metrics exposed at `GET /api/v1/metrics`.
2. **Health Probes**: Liveness (`/health/live`), Readiness (`/health/ready`), Worker queue status (`/health/worker`), and Aggregated health (`/health`).
3. **Structured Logging**: JSON logging with automated redaction of sensitive credentials, tokens, session cookies, and API keys.

---

## 2. Key Prometheus Metrics Reference

| Metric Name | Type | Labels | Description / Threshold |
|---|---|---|---|
| `flowforge_http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP traffic processed by the API gateway. |
| `flowforge_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request duration in seconds (p50, p95, p99). |
| `flowforge_workflow_executions_total` | Counter | `status`, `error_category` | Count of workflow executions completed by terminal status. |
| `flowforge_workflow_execution_duration_seconds` | Histogram | `status` | Execution runtime duration of workflows. |
| `process_cpu_user_seconds_total` | Counter | None | CPU consumption by Node.js runtime. |
| `nodejs_heap_size_used_bytes` | Gauge | None | Heap memory usage of active Node process. |

---

## 3. Production Alerting Rules (Prometheus Alertmanager)

```yaml
groups:
  - name: flowforge-production-alerts
    rules:
      - alert: APIHighLatencyP95
        expr: histogram_quantile(0.95, sum(rate(flowforge_http_request_duration_seconds_bucket[5m])) by (le)) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API 95th percentile latency exceeds 1 second"

      - alert: APIHigh5xxErrorRate
        expr: sum(rate(flowforge_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(flowforge_http_requests_total[5m])) * 100 > 2.0
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "API 5xx error rate is above 2%"

      - alert: WorkerQueueBacklogGrowing
        expr: bullmq_queue_jobs{status="waiting"} > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "BullMQ workflow execution backlog exceeds 500 pending jobs"

      - alert: DatabaseConnectionFailure
        expr: probe_success{instance="http://api:4000/api/v1/health/ready"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API unable to communicate with PostgreSQL database"
```

---

## 4. Log Redaction Standard
The API server logger is configured with strict field redaction to guarantee zero leakage of secret data in stdout or log aggregation systems:
- `req.headers.authorization`
- `req.headers.cookie`
- `res.headers["set-cookie"]`
- `password`, `token`, `secret`, `credentials`, `apiKey`
