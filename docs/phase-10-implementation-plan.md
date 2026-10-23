# FlowForge Automation SaaS — Phase 10 Implementation Plan
## Enterprise Identity, Advanced Observability, Reliability Engineering, and Horizontal Scaling

---

## 1. Executive Summary & Baseline Verification

FlowForge Automation SaaS has successfully completed Phases 1 through 9. A comprehensive baseline audit was executed on the actual codebase before making any modifications:

- **Vitest Backend Unit & Integration Suites**: **189 / 189 tests passed (100% green)** across all 9 suites (`npm test`).
- **Playwright End-to-End Browser Smoke Suite**: **48 / 48 tests passed (100% green)** across Desktop Chrome and Mobile Chrome viewports (`npm run test:e2e`).
- **Next.js Production Web Build**: 17 static and dynamic routes compiled cleanly (`npm run build:web`).
- **Prisma Relational Database**: 6 models added in Phase 9, 0 schema defects.

Phase 10 extends this multi-tenant foundation with enterprise identity, deep execution observability, queue reliability engineering, and horizontal scaling resilience.

---

## 2. Architecture Audit & Verified Gaps

| Domain | Current Architecture | Verified Gaps | Phase 10 Solution |
|---|---|---|---|
| **Identity & Authentication** | Email/Password, JWT sessions in cookies/headers, invite codes, API keys | No SAML/OIDC SSO, no IdP configuration per workspace, no SCIM 2.0 user lifecycle provisioning, no session listing/revocation | Workspace-scoped OIDC SSO with PKCE, encrypted secrets, owner recovery fallback; SCIM 2.0 provisioning API; active session management and revocation |
| **Execution Observability** | Execution list & step cards with inputs/outputs | No standardized diagnostic timeline, unstructured error summaries, secrets may appear in raw logs, no structured root-cause hints | Structured diagnostic milestones (`QUEUED`, `STARTED`, `NODE_STARTED`, `WAITING_APPROVAL`, `FAILED`, etc.), safe log redaction, actionable failure summaries, downloadable diagnostics bundle |
| **Distributed Tracing** | Single correlation ID string passed in runner | No standard W3C `traceparent` propagation across queue jobs, workers, and outbound HTTP calls | W3C `traceparent` / OpenTelemetry-compatible tracing service propagating spans across Fastify -> BullMQ -> Runner -> Integrations -> Webhooks |
| **Queue Reliability** | Basic BullMQ retry with 3 attempts and exponential backoff | Orphaned executions when worker crashes mid-run; no stuck execution detection; no queue backlog/oldest job age monitoring | Bounded execution reconciliation service (dry-run & execute), stalled job recovery, queue depth & oldest job age metrics, `Retry-After` header parsing with jitter |
| **Horizontal Scaling** | Hardcoded worker concurrency (5), unmetered workspace concurrency | No per-workspace active execution limits, potential for one tenant to monopolize worker pool | Centralized concurrency configuration (`WORKER_CONCURRENCY`), per-workspace active execution quotas, backpressure rejection |
| **Operational Control** | Basic `/health/ready` check and Prometheus metrics | No operator-facing unified dashboard, no operational alerting for queue backlog or high error rates | Unified Operator Dashboard (`/operations`), automated alert threshold engine (backlog, error rate, worker health), reconciliation controls |

---

## 3. Data Model Changes (Prisma Schema)

Add the following relational models to `packages/database/prisma/schema.prisma`:

1. **`WorkspaceSsoProvider`**:
   - `id`, `workspaceId` (`@unique`), `name`, `issuerUrl`, `authorizationEndpoint`, `tokenEndpoint`, `userinfoEndpoint`, `clientId`, `encryptedClientSecret`, `scopes`, `enforceSso`, `allowPasswordFallbackForAdmins`, `lastTestedAt`, `createdAt`, `updatedAt`.
2. **`SsoUserIdentity`**:
   - `id`, `userId`, `workspaceId`, `providerId`, `externalSubjectId`, `externalEmail`, `metadata` (Json), `lastAuthenticatedAt`, `createdAt`, `updatedAt`.
   - `@@unique([workspaceId, externalSubjectId])`
3. **`SsoAuthorizationState`**:
   - `id`, `workspaceId`, `state` (`@unique`), `nonce`, `codeVerifier`, `redirectUri`, `expiresAt`, `createdAt`.
4. **`ScimProvisioningToken`**:
   - `id`, `workspaceId`, `name`, `tokenHash` (`@unique`), `tokenPrefix`, `status`, `lastUsedAt`, `expiresAt`, `createdAt`.
5. **`ExecutionReconciliationLog`**:
   - `id`, `executionId`, `previousStatus`, `newStatus`, `reason`, `actionTaken`, `reconciledAt`.
6. **`OperationalAlertRule`**:
   - `id`, `metricName`, `operator`, `threshold`, `durationMinutes`, `severity`, `isEnabled`, `createdAt`, `updatedAt`.

---

## 4. Implementation Phasing & Sequence

1. **Step 1: Baseline Audit & Plan Documentation** (Completed).
2. **Step 2: Database Schema & Migrations**:
   - Add Phase 10 models to `packages/database/prisma/schema.prisma`.
   - Push schema to PostgreSQL (`prisma db push`), generate client (`prisma generate`), and build `@flowforge/database`.
3. **Step 3: Shared Contracts & Schemas (`@flowforge/shared`)**:
   - OIDC SSO types, SCIM 2.0 schemas, observability milestones, reconciliation request/response types.
   - Compile `@flowforge/shared`.
4. **Step 4: Enterprise Identity (OIDC SSO & SCIM 2.0)**:
   - `apps/api/src/services/sso.ts`: OIDC discovery, validation, PKCE, encrypted secrets, callback handling, user mapping.
   - `apps/api/src/services/scim.ts`: SCIM 2.0 Users resource provider, token verification, tenant-scoped user lifecycle.
   - `apps/api/src/routes/sso.ts`: Admin SSO configuration, test connection, OAuth callback.
   - `apps/api/src/routes/scim.ts`: `/api/v1/scim/v2/Users` endpoints.
   - `apps/api/src/routes/sessions.ts`: Active session listing & revocation.
5. **Step 5: Advanced Observability & Distributed Tracing**:
   - `apps/api/src/services/tracing.ts`: W3C `traceparent` generator, span lifecycle, context propagation.
   - Update `apps/api/src/engine/runner.ts`: Inject trace spans, record structured timeline events, sanitize logs with `redactSensitiveData`.
   - `apps/api/src/services/diagnostics.ts`: Actionable failure summaries, root-cause heuristics, diagnostic download bundles.
   - `apps/api/src/routes/diagnostics.ts`: Execution diagnostics endpoints.
6. **Step 6: Reliability Engineering & Queue Recovery**:
   - `apps/api/src/services/reconciliation.ts`: Durable reconciliation service for orphaned/stuck executions.
   - `apps/api/src/worker/queue.ts`: Queue depth, oldest job age metrics, stalled job monitoring.
   - `apps/api/src/services/integrations/declarativeEngine.ts`: `Retry-After` header parsing, bounded exponential backoff with jitter.
7. **Step 7: Horizontal Scaling & Concurrency Controls**:
   - Environment-driven worker concurrency (`WORKER_CONCURRENCY`).
   - Workspace execution concurrency limiter in runner / queue enqueue.
8. **Step 8: Operational Dashboard & Alerting**:
   - `apps/api/src/services/operations.ts`: Unified operational overview & alert evaluator.
   - `apps/api/src/routes/operations.ts`: `/api/v1/operations/overview` and reconciliation trigger.
9. **Step 9: Frontend User Experience (`apps/web`)**:
   - Update `apps/web/src/lib/api.ts` with Phase 10 API client methods.
   - Enterprise Settings tabs: `SsoTab.tsx`, `ScimTab.tsx`, `SessionsTab.tsx`.
   - Execution Details enhancements: Diagnostic timeline, Failure Summary card, Download Diagnostics button.
   - Operational Dashboard: `/operations` page.
10. **Step 10: Automated Verification & Documentation**:
    - Add `apps/api/test/phase10.test.ts` (Vitest suite covering SSO, SCIM, Tracing, Reconciliation, Concurrency, and Operations).
    - Add Playwright E2E tests for Phase 10 in `e2e/smoke.spec.ts`.
    - Run full test suites (Vitest + Playwright).
    - Author all required operational runbooks and completion report in `docs/`.
