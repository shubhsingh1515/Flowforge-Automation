# FlowForge Automation SaaS — Phase 11 Master Implementation Plan
## Customer Success, Product Analytics, Developer SDK, Usage Intelligence, and Commercial Launch

**Author:** Principal Software Architect, Senior Full-Stack Engineer, Product Analytics Engineer  
**Date:** October 2026  
**Status:** Approved for Implementation

---

## 1. Verified Starting Architecture (Repository Audit)

The repository was audited before designing Phase 11. The current baseline was tested with actual execution:
- **Backend Vitest Baseline:** 210 / 210 passed (100% green) across 10 test files (`test/phase10.test.ts`, `test/api.test.ts`, `test/execution.test.ts`, `test/integrations.test.ts`, `test/phase4.test.ts`, `test/security.test.ts`, `test/billing.test.ts`, `test/phase7.test.ts`, `test/phase8.test.ts`, `test/phase9.test.ts`).
- **Playwright E2E Baseline:** 54 / 54 passed (100% green) across Desktop Chrome & Mobile Chrome.
- **Active System Infrastructure:**
  - PostgreSQL 16 & Redis 7 active in Docker daemon.
  - Next.js 14 App Router on `http://localhost:3000`.
  - Fastify API on `http://0.0.0.0:4000/api/v1` with Swagger/OpenAPI docs.
  - Multi-tenant workspace data model with Prisma ORM.
  - Stripe subscription billing, usage ledger (`UsageRecord`), and plan entitlements (`FREE`, `PRO`, `BUSINESS`).
  - BullMQ execution worker with concurrency control, scheduling, retries, and stuck execution reconciliation.
  - Public REST API with scoped API keys (`ApiKey`) and outbound webhooks (`OutboundWebhook`).
  - OIDC Enterprise Single Sign-On and SCIM 2.0 provisioning.

---

## 2. Identified Gaps & High-Value Opportunities

1. **Product Analytics & Automation Insights:**
   - *Current State:* The dashboard only shows aggregate lifetime counts and the last 10 executions.
   - *Phase 11 Goal:* Dedicated `/analytics` dashboard computing bounded, real-time metrics across selectable time windows (24h, 7d, 30d, custom): volume over time, success/failure ratios, duration percentiles (p50, p90, p99), top error categories, most active workflows, repeated failures, and integration failures, with drill-down filters into executions.
2. **Usage Intelligence & Forecasting:**
   - *Current State:* Settings displays current cycle usage vs allowance, but lacks forecasting, historical daily consumption graphs, and threshold notifications.
   - *Phase 11 Goal:* Transparent usage forecasting (linear extrapolation of current period run rate), daily usage breakdowns, and deduplicated threshold alerting (50%, 80%, 90%, 100%) delivered through in-app notifications.
3. **Official TypeScript Developer SDK (`@flowforge/sdk`):**
   - *Current State:* External developers have public API endpoints and curl examples, but no npm package SDK.
   - *Phase 11 Goal:* Build and publish a dedicated, typed `@flowforge/sdk` package in `packages/sdk` supporting workflows, executions, cancellation, API key auth, timeout configuration, and W3C traceparent propagation.
4. **Developer Quickstart & Interactive Testing:**
   - *Current State:* OpenAPI docs exist, but there is no cohesive copy-paste quickstart guide or safe developer sandbox in the web console.
   - *Phase 11 Goal:* Executable Developer Quickstart guide (`docs/developer/quickstart.md`) with TypeScript SDK and curl snippets, plus an in-app API request inspector/tester in Settings.
5. **Customer Onboarding & Contextual Guidance:**
   - *Current State:* Fixed checklist with 6 items.
   - *Phase 11 Goal:* Expand onboarding with contextual validation guidance and troubleshooting tips mapped to real failure categories (rate limits, missing OAuth connections, timeout, expressions).
6. **In-App Notification Center:**
   - *Current State:* Alerts are only visible on the operator dashboard.
   - *Phase 11 Goal:* Persistent, tenant-isolated notification center in the top navigation bar (bell icon with unread count badge), supporting read/unread toggles and deep links to failed executions or billing alerts.
7. **Support Diagnostics & Self-Service Bundles:**
   - *Current State:* Operators can download execution diagnostics, but workspace admins have no self-service mechanism to export a sanitized workspace support bundle or submit feedback.
   - *Phase 11 Goal:* Sanitized workspace support bundle generator and in-app customer feedback submission modal.
8. **Commercial Launch Readiness:**
   - *Current State:* Pricing page exists, but lacks clear quota exhaustion policies, billing portal shortcuts, and customer-facing service status indicators.
   - *Phase 11 Goal:* Transparent plan transition indicators, customer-facing system status page (`/status`), and commercial release documentation.

---

## 3. Reusable Services & Models

- `packages/database`: Prisma models (`WorkflowExecution`, `WorkflowStepExecution`, `Workflow`, `UsageRecord`, `WorkspaceSubscription`, `WorkspaceOnboarding`, `ApiKey`, `OutboundWebhook`).
- `apps/api/src/services/entitlements.ts`: Plan quotas and feature entitlements.
- `apps/api/src/services/billing.ts`: Stripe customer and subscription management.
- `apps/api/src/services/tracing.ts`: W3C traceparent parsing and recursive secret scrubbing (`redactSensitiveData`).
- `apps/api/src/services/diagnostics.ts`: Error categorizations and remediation tips.
- `apps/api/src/services/reconciliation.ts`: Reliability reconciliation and anomaly detection.
- `apps/web/src/components/layout/AppShell.tsx`: Navigation sidebar, header, and auth state.

---

## 4. Proposed Database & API Changes

### Database Schema Additions (`packages/database/prisma/schema.prisma`):
1. `WorkspaceUsageAlertConfig`: Workspace-level alert preferences (50%, 80%, 90%, 100% toggles).
2. `WorkspaceUsageAlertEvent`: Deduplication ledger recording triggered threshold alerts per billing cycle to avoid repeated alerts.
3. `Notification`: Persistent in-app notifications for workspace members (type, title, message, link, read, readAt, category).
4. `CustomerFeedback`: Sanitized customer feedback submissions (category, rating, comment, contactEmail).
5. `SupportBundle`: Metadata and sanitized payload for requested support diagnostic packages.

### New API Routes (`apps/api/src/routes/`):
- `/analytics`:
  - `GET /api/v1/analytics/overview?timeRange=7d&workflowId=...`: Aggregated workflow execution metrics, duration percentiles, volume over time, error breakdown.
- `/usage-alerts`:
  - `GET /api/v1/usage/alerts/config`: Get alert settings and triggered alerts.
  - `PUT /api/v1/usage/alerts/config`: Update alert threshold preferences.
  - `POST /api/v1/usage/alerts/evaluate`: Evaluate thresholds against current usage and dispatch notifications.
- `/notifications`:
  - `GET /api/v1/notifications`: List workspace notifications (with unread count).
  - `PATCH /api/v1/notifications/:id/read`: Mark single notification as read.
  - `POST /api/v1/notifications/mark-all-read`: Mark all notifications as read.
- `/support`:
  - `POST /api/v1/support/bundle`: Generate sanitized workspace support bundle.
  - `GET /api/v1/support/bundle/:id/download`: Download generated support bundle.
  - `POST /api/v1/support/feedback`: Submit rate-limited customer feedback.
- `/status`:
  - `GET /api/v1/status/public`: Public customer-facing system health and service availability status.

---

## 5. Privacy, Security & Tenant Isolation

- **Zero Invasive Telemetry:** No third-party tracking scripts, cookies, or individual user mouse-tracking. All analytics are computed strictly from existing workflow execution and usage records.
- **Tenant Scope Enforcement:** All database queries for analytics, notifications, usage alerts, support bundles, and feedback enforce `workspaceId` at the Prisma query level.
- **Comprehensive Secret Redaction:** All support bundles and diagnostics automatically run through `redactSensitiveData` before storage and export, removing API keys, OAuth tokens, passwords, and private certificates.
- **Rate-Limiting on Feedback:** Feedback endpoints are throttled to prevent spam or resource exhaustion.

---

## 6. Implementation Sequence

1. **Step 1: Database Schema & Migrations**
   - Add models to `packages/database/prisma/schema.prisma`.
   - Run `npx prisma db push` and `npx prisma generate`.
   - Update shared package types in `packages/shared`.
2. **Step 2: Backend Services & API Routes**
   - Implement `apps/api/src/services/analytics.ts` (server-side aggregation, percentile calculations, volume over time).
   - Implement `apps/api/src/services/usageAlerts.ts` (forecasting, threshold evaluation, deduplication).
   - Implement `apps/api/src/services/notifications.ts` (notification creation, retrieval, read states).
   - Implement `apps/api/src/services/support.ts` (sanitized bundle generator, feedback recorder).
   - Create and register API route handlers in `apps/api/src/server.ts`.
3. **Step 3: Official TypeScript SDK (`packages/sdk`)**
   - Create package structure in `packages/sdk` with `package.json`, `tsconfig.json`, and client source.
   - Provide typed client methods: `workflows`, `executions`, `templates`, `health`.
   - Add unit tests with mock server in `packages/sdk/test/sdk.test.ts`.
4. **Step 4: Frontend Implementation (`apps/web`)**
   - Update `apps/web/src/lib/api.ts` with new Phase 11 endpoints.
   - Create Analytics Dashboard (`apps/web/src/app/analytics/page.tsx`).
   - Create Notification Center component in `AppShell.tsx` (top navigation bell icon with live badge & dropdown).
   - Enhance Billing & Usage Settings with forecasting, daily consumption breakdown, and threshold alert toggles.
   - Create Customer-Facing Status Page (`apps/web/src/app/status/page.tsx`).
   - Add Self-Service Support Diagnostics & Feedback Modal in Settings.
5. **Step 5: Testing & QA**
   - Create Phase 11 Vitest backend test suite (`apps/api/test/phase11.test.ts`).
   - Add Playwright E2E tests in `e2e/smoke.spec.ts` (Tests 28, 29, 30).
   - Run full regression suites (Vitest + Playwright) to guarantee zero regressions.
6. **Step 6: Documentation & Completion Report**
   - Write all 9 required documentation guides in `docs/`.
   - Produce `docs/phase-11-completion-report.md`.
   - Write final user-facing conversation artifact `phase11_completion_report.md`.

---

## 7. Acceptance Criteria

- [x] Baseline audit recorded without assumptions.
- [ ] Product analytics dashboard displays real execution data, percentiles, and error categories with time-window filtering.
- [ ] Usage forecasting estimates consumption transparently based on current period burn rate.
- [ ] Threshold alerts trigger deduplicated notifications at 50%, 80%, 90%, 100% capacity.
- [ ] Official TypeScript SDK builds, exports types, and passes automated mock tests.
- [ ] In-app notification center tracks read/unread states with deep links.
- [ ] Support bundles strictly scrub secrets before export.
- [ ] Feedback submission is authenticated and rate-limited.
- [ ] Public customer status endpoint reflects health safely without exposing internal infrastructure details.
- [ ] 100% green test pass across all new and existing test suites.

---

## 8. Features Intentionally Deferred

- **External Data Warehouse / OLAP Export (ClickHouse / Snowflake):** Deferring external warehouse streaming; existing PostgreSQL indexed queries and in-memory aggregation sufficiently handle customer workflow volumes at this scale.
- **Generative AI Chat Assistant:** Deferring external LLM support bots in favor of deterministic, contextual troubleshooting tips and sanitized diagnostics bundles.
- **Third-Party Email Notification Relay (SES/SendGrid):** Focus is placed on persistent in-app notifications first to avoid unverified external SMTP credential requirements.
