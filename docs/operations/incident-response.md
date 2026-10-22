# FlowForge Automation SaaS — Incident Response Runbook

## 1. Severity Levels & SLA Response Times

| Severity | Definition | Target First Response | Target Mitigation | Escalation Path |
|---|---|---|---|---|
| **SEV-1 (Critical)** | Core execution engine down, data corruption, active security breach, or complete platform outage. | < 15 minutes | < 2 hours | VP of Eng, On-Call Architect, Lead Security Engineer |
| **SEV-2 (Major)** | Major feature failure (e.g. webhook ingestion stopped, OAuth token refresh failures across multiple tenants). | < 30 minutes | < 4 hours | Lead Backend Engineer, DevSecOps Lead |
| **SEV-3 (Moderate)** | Degraded performance, single third-party provider outage (e.g. Slack API rate limited), UI responsiveness issues. | < 2 hours | < 1 business day | On-Call Engineer |
| **SEV-4 (Minor)** | Non-blocking visual defect, documentation inconsistency, minor non-critical bug. | < 1 business day | Next sprint release | Engineering Team Backlog |

---

## 2. Common Incident Triage Runbooks

### Runbook A: BullMQ Worker Queue Backlog / Starvation
**Symptoms**: Workflow executions remain in `PENDING` status for > 60 seconds; BullMQ `waiting` count increases.

**Diagnosis Steps**:
1. Check Redis status:
   ```bash
   curl -s http://localhost:4000/api/v1/health/worker | jq
   ```
2. Verify Redis memory usage:
   ```bash
   docker exec -it flowforge-prod-redis redis-cli info memory
   ```
3. Inspect active worker process CPU/memory:
   ```bash
   docker stats flowforge-prod-worker
   ```

**Mitigation Actions**:
1. If worker process is crashed or OOM-killed, restart worker container:
   ```bash
   docker compose -f docker-compose.prod.yml restart worker
   ```
2. Scale up worker concurrency or replica count:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --scale worker=3
   ```
3. If poison-pill execution is stalling workers, inspect and mark failed:
   ```sql
   UPDATE workflow_executions SET status = 'FAILED', error_summary = 'Manually terminated due to worker starvation' WHERE status = 'RUNNING' AND started_at < NOW() - INTERVAL '10 minutes';
   ```

---

### Runbook B: High Rate of SSRF / Suspicious Outbound Traffic
**Symptoms**: Sudden spike in `SSRF_VIOLATION` errors recorded in `flowforge_workflow_executions_total{error_category="SSRF_VIOLATION"}`.

**Diagnosis Steps**:
1. Search audit logs for IP addresses triggering validation failures:
   ```bash
   docker logs flowforge-prod-api 2>&1 | grep "SSRF_VIOLATION" | jq
   ```
2. Check if a specific workspace or user is systematically probing internal networks.

**Mitigation Actions**:
1. Suspend the offending workspace:
   ```sql
   UPDATE workflows SET status = 'PAUSED' WHERE workspace_id = 'offending_workspace_id';
   ```
2. Invalidate the user's active sessions:
   ```sql
   DELETE FROM sessions WHERE user_id = 'offending_user_id';
   ```
3. Verify outbound egress firewall / security group rules block any potential unvalidated ports.

---

### Runbook C: Webhook Ingestion Outage / Flood
**Symptoms**: High 429 response rate on `/api/v1/webhooks/:slug` or database write latency spikes on `webhook_event_receipts`.

**Mitigation Actions**:
1. Check webhook rate limit threshold: Default is 120 requests/minute per workflow slug.
2. If legitimate high-volume enterprise tenant is being throttled, adjust per-tenant rate limit tier in Redis.
3. If DDoS or spam attack, block source IP address at Cloudflare / CDN edge layer before it reaches origin servers.

---

## 3. Post-Mortem & Incident Review Process
Every SEV-1 and SEV-2 incident requires a blameless post-mortem completed within 48 hours covering:
1. **Executive Summary & Impact**: Total downtime, number of affected tenants, failed execution count.
2. **Timeline of Events**: Chronological log from first anomaly detection to complete restoration.
3. **Root Cause Analysis (5 Whys)**: Underlying systemic or architectural cause.
4. **Corrective & Preventive Action Items (CAPA)**: JIRA tickets assigned with specific deadlines.
