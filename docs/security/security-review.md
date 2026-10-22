# FlowForge Automation SaaS — Production Security Review & Threat Model

## 1. Executive Summary & Security Posture
FlowForge Automation has undergone comprehensive security hardening across network perimeter, API gateway, execution runtime, multi-tenant persistence, and third-party credential management.

### Key Security Certifications & Design Principles
- **Defense in Depth**: Layered protections from network edge (CSP/Helmet), API rate limiting, strict workspace isolation, to SSRF-hardened egress.
- **Zero Trust Credential Storage**: All external credentials encrypted with AES-256-GCM. Plaintext tokens never written to disk or exposed in logs.
- **Fail-Fast Startup Security**: API and Worker daemons fail to start in production if insecure default secrets or weak keys (< 32 characters) are detected.
- **Strict Tenant Boundary Enforcement**: Zero horizontal privilege escalation across workspaces, verified by automated security test suites.

---

## 2. Threat Modeling & OWASP Top 10 Defenses

### A. SSRF (Server-Side Request Forgery) Mitigation
- **Attack Vector**: An attacker crafts an HTTP Request action or Webhook pointing to `http://127.0.0.1`, `http://169.254.169.254` (cloud metadata), or internal network ranges (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`).
- **Defense Mechanism**:
  1. DNS resolution and CIDR validation (`validateUrlForSsrf`) executed prior to any network socket connection.
  2. Protocol validation rejecting non-HTTP schemes (`file://`, `ftp://`, `gopher://`).
  3. **Safe Manual Redirect Loop**: Default `fetch` redirect following is disabled (`redirect: "manual"`). Each redirect target `Location` header is parsed and validated against SSRF rules up to 5 hops, preventing open-redirect SSRF bypasses.
  4. Response payload size ceiling of 10MB to eliminate memory exhaustion DOS attacks.

### B. Broken Object-Level Authorization (BOLA / IDOR)
- **Attack Vector**: User B attempts to access `/api/v1/workflows/:id`, `/api/v1/executions/:id`, or `/api/v1/connections/:id` belonging to Workspace A.
- **Defense Mechanism**:
  - All database queries for tenant assets enforce compound `WHERE workspaceId = currentWorkspace.id` checks.
  - Cross-tenant requests return 404/403 to prevent resource enumeration.
  - Automated Vitest test suite (`apps/api/test/security.test.ts`) tests cross-tenant reading, modification, deletion, and execution tampering.

### C. Sensitive Data Exposure & Secret Redaction
- **Attack Vector**: Credentials leaked in application logs, error messages, or exception traces.
- **Defense Mechanism**:
  - Fastify logger configured with field-level redaction for `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `credentials`, `apiKey`.
  - Step execution records in database scrub sensitive headers before persistence.

### D. Rate Limiting & Denial of Service (DoS)
- **Global API Rate Limit**: 300 requests/minute per client IP.
- **Authentication Endpoint Limits**: 15 requests/minute on `/api/v1/auth/login` and `/api/v1/auth/register` in production.
- **Webhook Ingestion Limits**: 120 requests/minute per workflow slug.
- **Execution Engine Limits**: Hard caps of `MAX_WORKFLOW_STEPS = 500` and `MAX_EXECUTION_DURATION_SECONDS = 300` prevent runaway execution loops or infinite queue bloat.

### E. OAuth 2.0 Security
- PKCE (Proof Key for Code Exchange) with `S256` code challenge generation.
- Cryptographic state parameter with anti-replay timestamp and single-use validation in database.
- Refresh token automatic rotation with expiration tracking.
