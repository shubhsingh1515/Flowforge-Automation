# Analytics, Telemetry & Diagnostics Data Security

Comprehensive documentation for tenant isolation boundaries, zero-knowledge telemetry handling, and secret redaction policies.

---

## 1. Multi-Tenant Isolation Guarantee

FlowForge Automation enforces strict tenant boundaries at every layer of the product analytics and customer support architecture:
- **API Middleware**: Every incoming request to `/api/v1/analytics/*`, `/api/v1/usage/*`, `/api/v1/notifications/*`, and `/api/v1/support/*` validates tenant context from session cookies or Bearer API keys (`req.user.workspaceId`).
- **Database Query Constraints**: All Prisma aggregation queries, joins, and raw queries explicitly bind `where: { workspaceId: req.user.workspaceId }`. Cross-workspace data reads are impossible.
- **Support Diagnostic Scoping**: Diagnostic bundles queries only the requesting workspace's workflows, recent errors, and connection statuses.

---

## 2. Redaction & Data Sanitization Specification

To ensure that confidential client credentials, proprietary business logic, or customer personal identifiers are never stored or exposed:

1. **Secret Scrubbing Filter**:
   - The recursive sanitization function `redactSensitiveData(payload)` evaluates every key name across nested objects and arrays.
   - Any key matching patterns `apiKey`, `key`, `secret`, `token`, `password`, `passwd`, `credential`, `auth`, `bearer` is scrubbed and replaced with `[REDACTED]`.
2. **Error Message Truncation**:
   - Execution error messages stored in `WorkflowExecution.error` and aggregated in telemetry are sanitized to prevent raw database connection strings, database passwords, or OAuth bearer tokens from lingering in error messages.
3. **Audit Trail Recording**:
   - Diagnostic bundle generation and feedback submissions create tamper-evident events in `WorkspaceAuditLog` (`SUPPORT_BUNDLE_GENERATED`, `CUSTOMER_FEEDBACK_SUBMITTED`).
4. **Time-To-Live (TTL) on Diagnostics**:
   - Exported diagnostic records in `SupportBundle` carry an automated expiration timestamp (`expiresAt = now + 7 days`). Expired diagnostic packages are automatically pruned by background retention workers.

---

## 3. Public Status Information Boundary

The public status page (`/status` and `GET /api/v1/status/public`) is completely decoupled from tenant-specific or proprietary data:
- Exposes only broad infrastructure health booleans (`OPERATIONAL` vs `DEGRADED`) derived from live `SELECT 1` ping tests and Redis `PING` responses.
- Emits no customer identifiers, no internal IP addresses, and no confidential infrastructure topologies.
