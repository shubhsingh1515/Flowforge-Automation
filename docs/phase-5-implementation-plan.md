# FlowForge Automation — Phase 5 Implementation Plan
## Production Hardening, Security, Reliability, Deployment, Observability, Scalability, and Final QA

**Status:** Plan Approved & In Progress  
**Target Completion:** Production Launch Readiness  
**Authors:** Senior Software Architect, DevSecOps Engineer, SRE, and Full-Stack Team  

---

## 1. Executive Summary & Baseline Audit

### 1.1 Objective
Prepare FlowForge Automation SaaS for a reliable, secure, multi-tenant production launch by completing production hardening across all application layers—without replacing functioning Phase 1–4 capabilities or rebuilding the system.

### 1.2 Baseline Verification (Established at Start of Phase 5)
- **Vitest Backend API Tests:** 86 / 86 passing (`test/api.test.ts` [17], `test/integrations.test.ts` [22], `test/phase4.test.ts` [20], `test/execution.test.ts` [27]).
- **Playwright Browser E2E Tests:** 24 / 24 passing across Desktop Chrome and Mobile Chrome viewports.
- **Next.js Production Build:** 15 / 15 static and dynamic routes compiled successfully with 0 TypeScript/ESLint errors.

### 1.3 Key Audit Findings & Identified Risks

| Area | Current Implementation | Production Risk | Severity | Priority |
|------|------------------------|-----------------|----------|----------|
| **SSRF (HTTP Node)** | `redirect: "follow"` in fetch without post-redirect SSRF check | External target can redirect to `169.254.169.254` (cloud metadata) or `127.0.0.1` | **Critical** | P0 |
| **CORS & Headers** | Fallback allows arbitrary origin; missing security headers | Cross-origin unauthorized requests; missing CSP, nosniff, frame-ancestors | **High** | P0 |
| **Rate Limiting** | No rate limiting on `/auth/login`, `/auth/register`, or `/webhooks/:slug` | Brute-force credential stuffing; webhook endpoint denial-of-service | **High** | P0 |
| **Config Validation** | Insecure fallback secrets allowed in production without validation | Production instances running with known development JWT/cookie secrets | **High** | P0 |
| **Error Retry Semantics**| BullMQ retries all failed jobs 3x regardless of error category | Permanent errors (`INVALID_INPUT`, `SSRF_VIOLATION`) retried wastefully | **Medium** | P1 |
| **Execution Bounds** | Runner executes while `queue.length > 0` with no global timeout or max steps | Malicious or cyclical workflows can exhaust worker memory/CPU | **Medium** | P1 |
| **Observability** | No `/metrics` Prometheus endpoint; console logs lack centralized redaction | Operators cannot monitor latency, error rates, or queue depths | **Medium** | P1 |
| **Production Artifacts**| No production Dockerfiles, `.dockerignore`, or automated CI workflows | Deployments not reproducible in containerized production environments | **Medium** | P2 |
| **Operations Docs** | Missing backup/restore, deployment, monitoring, and incident response guides | Operators lack documented runbooks for failover and disaster recovery | **Medium** | P2 |

---

## 2. Priority-Ranked Remediation Workstreams

### Workstream A: Application Security Hardening
1. **A1. Production Security Headers & CORS Policy:**
   - Integrate `@fastify/helmet` with hardened CSP (`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `HSTS`).
   - Configure strict CORS allowlist bound to `CORS_ORIGIN` / `FRONTEND_URL` without arbitrary origin fallback.
2. **A2. Endpoint Rate Limiting:**
   - Integrate `@fastify/rate-limit`.
   - Apply strict tier for authentication endpoints (10 attempts / minute per IP).
   - Apply resilient tier for webhooks (120 requests / minute per slug/IP).
   - Apply standard API tier (100 requests / minute per authenticated user).
3. **A3. SSRF Open-Redirect Protection & Response Limits:**
   - Modify `engine/nodes/http.ts` to use `redirect: "manual"`.
   - Implement safe redirect validation loop (max 5 hops): validate each `Location` header through `validateUrlForSsrf` before following.
   - Enforce maximum response body size (10MB) and strict request timeout (configurable, default 15s) to block memory exhaustion.
4. **A4. Startup Environment Validation:**
   - Build `apps/api/src/config.ts` Zod environment schema.
   - Enforce that when `NODE_ENV === "production"`, secrets (`JWT_SECRET`, `COOKIE_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`) must not be default or test values, must have >= 32 characters, and `CREDENTIAL_ENCRYPTION_KEY` must be a valid 32-byte hex/string.
   - Fail fast on server startup with clear, non-leaking error messages.
5. **A5. Secret Redaction in Logging & Errors:**
   - Implement centralized logging serializer/filter redacting `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `credentials`, `apiKey`, `clientSecret`.

### Workstream B: Distributed Execution Reliability
1. **B1. Error Classification & Non-Retryable Error Handling:**
   - In `apps/api/src/worker/worker.ts`, inspect `result.errorCategory`.
   - Mark permanent errors (`INVALID_INPUT`, `SSRF_VIOLATION`, `AUTH_FAILURE`, `INVALID_CONFIG`) as unretryable, preventing unnecessary BullMQ retry churn.
   - Ensure network errors (`PROVIDER_ERROR`, `RATE_LIMITED`, `TIMEOUT`) use bounded exponential backoff with jitter.
2. **B2. Server-Side Workflow Resource Bounds:**
   - In `apps/api/src/engine/runner.ts`, enforce:
     - `MAX_STEPS_PER_EXECUTION = 500`: Aborts with `RESOURCE_LIMIT_EXCEEDED` if exceeded.
     - `MAX_EXECUTION_DURATION_MS = 300_000` (5 minutes): Aborts execution if total duration exceeds limit.
     - Maximum payload size limits on input/output data.
3. **B3. Graceful Worker Shutdown:**
   - Ensure `SIGTERM` and `SIGINT` signals cleanly close BullMQ workers without corrupting in-flight step executions or leaving orphaned `RUNNING` records.

### Workstream C: Database Safety, Integrity & Recovery
1. **C1. Indexes & Schema Hardening:**
   - Verify all workspace isolation indexes: `[workspaceId, status]`, `[workspaceId, createdAt]`, `[executionId, nodeId]`.
   - Verify unique constraints for idempotency (`WebhookEventReceipt [workflowId, eventId]`).
2. **C2. Backup & Restore Procedures:**
   - Document automated PostgreSQL `pg_dump` and Redis snapshot procedures, encryption, retention policies, and step-by-step restoration verification (`docs/operations/backup-and-restore.md`).

### Workstream D: Production Deployment & Environment
1. **D1. Containerization:**
   - Create production multi-stage Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/api/Dockerfile.worker`).
   - Create `.dockerignore` ignoring node_modules, local caches, credentials, and test results.
   - Create `docker-compose.prod.yml` demonstrating complete containerized production-like deployment.
2. **D2. Production Deployment Runbook:**
   - Document infrastructure requirements, migration release sequence, secrets configuration, rolling restarts, and rollback steps (`docs/operations/deployment.md`).

### Workstream E: Observability, Metrics & Monitoring
1. **E1. Health & Readiness Probes:**
   - Liveness probe at `/api/v1/health/live` (process health).
   - Readiness probe at `/api/v1/health/ready` (PostgreSQL query probe).
   - Worker probe at `/api/v1/health/worker` (Redis and BullMQ metrics).
   - Root `/api/v1/health` summary alias.
2. **E2. Prometheus Metrics (`/api/v1/metrics`):**
   - Implement `prom-client` metrics endpoint:
     - `http_requests_total`, `http_request_duration_seconds` (status code, method, route).
     - `workflow_executions_total`, `workflow_execution_duration_seconds` (status, triggerType).
     - `queue_jobs_waiting`, `queue_jobs_active`, `queue_jobs_failed`.
     - `approval_requests_pending`.
   - Strictly low-cardinality labels (no user IDs or execution IDs).
3. **E3. Monitoring, Alerting & Incident Response Runbooks:**
   - Document metric thresholds and alert configurations (`docs/operations/monitoring-and-alerting.md`).
   - Document incident response procedures for API outages, Redis/Queue failure, DB exhaustion, and security incidents (`docs/operations/incident-response.md`).

### Workstream F: Performance & Load Testing
1. **F1. Automated Load Testing Script:**
   - Build a reproducible load-testing script (`test/load-test.ts`) using synthetic mock events.
   - Benchmark concurrent API authentication, workflow CRUD, webhook ingestion, queue job submission, and transform/condition processing.
   - Record measured latencies (p50, p95, p99), throughput (RPS), and error rates.

### Workstream G: CI/CD Automation & Quality
1. **G1. GitHub Actions Workflow:**
   - Build `.github/workflows/ci.yml` running linting, typechecking, Vitest tests, and Playwright E2E tests with PostgreSQL and Redis service containers.
2. **G2. Release Procedure Documentation:**
   - Formalize repeatable release checklist and rollback guarantees.

### Workstream H: Frontend Production Polish & Accessibility
1. **H1. Frontend Error Boundaries & Usability:**
   - Audit React error boundaries, empty states, loading indicators, and accessible labels for icon-only buttons.
   - Safe rendering of expressions without raw HTML injection.

### Workstream I: Final Verification & Security Documentation
1. **I1. Security Verification Suite:**
   - Create automated security test suite `apps/api/test/security.test.ts`:
     - Cross-workspace isolation (horizontal privilege escalation).
     - Rate-limiting verification on `/auth/login`.
     - SSRF redirect bypass protection.
     - Unauthenticated request rejection.
     - Secret redaction in headers and logs.
2. **I2. Full Regression Run:**
   - Execute 100% of Vitest tests, Playwright tests, and Next.js production builds.
3. **I3. Documentation Outputs:**
   - `docs/security/security-review.md`
   - `docs/operations/production-readiness-checklist.md`
   - `docs/phase-5-completion-report.md`

---

## 3. Implementation Order

```
[Milestone 1: Audit & Baseline] (Completed)
             │
             ▼
[Milestone 2: Security Hardening]
  - Helmet & Security Headers
  - Rate Limiting
  - SSRF Open-Redirect Protection & Limits
  - Config Validation & Secret Redaction
             │
             ▼
[Milestone 3: Execution Reliability]
  - Permanent vs Retryable Error Classification
  - Server-Side Execution Timeouts & Step Caps
  - Graceful Worker Shutdown
             │
             ▼
[Milestone 4: Observability & Health]
  - Prometheus Metrics Endpoint (/api/v1/metrics)
  - Enhanced Health Probes
             │
             ▼
[Milestone 5: Deployment & Operations]
  - Production Dockerfiles & Compose
  - Backup & Restore Runbook
  - Deployment & Incident Guides
             │
             ▼
[Milestone 6: Performance & Security Testing]
  - Security Verification Test Suite (Vitest)
  - Repeatable Load Testing Script
             │
             ▼
[Milestone 7: CI/CD & Final Verification]
  - GitHub Actions CI Workflow
  - Full Test Execution (Vitest + Playwright + Build)
  - Completion Report & Production Checklist
```
