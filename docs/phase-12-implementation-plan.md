# FlowForge Automation SaaS — Phase 12 Implementation Plan
## Workflow Environments, Release Promotion, Automated Testing, and Deployment Governance

**Author**: Principal Software Architect & QA Lead  
**Date**: October 23, 2026  
**Status**: Approved for Implementation  
**Target Milestone**: Phase 12  

---

## 1. Executive Summary & Goals

Phase 12 implements a production-grade workflow release lifecycle for FlowForge Automation SaaS, enabling isolated environments (Development, Staging, Production), immutable release artifacts with SHA-256 content hashing, automated pre-deployment testing and validation gates, environment-scoped configuration and credentials, atomic promotion and rollback, and enterprise deployment governance.

### Core Objectives:
1. **Isolated Environments**: Workspaces manage `Development`, `Staging`, and `Production` environments with strict tenant isolation.
2. **Environment Configuration & Credentials**: Environment-scoped variables (AES-256-GCM encrypted secrets) and credential bindings. Release artifacts contain zero secret material.
3. **Immutable Release Artifacts**: Canonicalized snapshots of workflows with SHA-256 content hashing and tamper detection.
4. **Promotion Lifecycle & Governance**: Pre-flight validation, structural diff calculation, configurable approval policies (with self-approval prevention), atomic deployment, and execution pinning.
5. **Automated Workflow Testing**: Fixture-based test cases with output assertions, dry-run/mocked modes, and test gates linked to release content hashes.
6. **Safe Rollback**: Idempotent rollback to previous immutable releases with pre-flight configuration validation and audit logging.
7. **Developer Platform & CI/CD**: Extended REST API with dedicated scopes, OpenAPI specs, and updated `@flowforge/sdk`.
8. **Frontend Interface**: Environments overview, release diff inspector, test runner, promotion modals, and rollback views.
9. **Zero Regressions**: 100% pass rate maintained across all 224 Vitest tests, 8 SDK tests, and 60 Playwright tests.

---

## 2. Baseline Status

| Suite | Pre-Implementation Baseline | Target |
|---|---|---|
| Vitest Backend Suites | **224 / 224 passed (100%)** | 100% pass rate + Phase 12 suite |
| SDK Tests (`@flowforge/sdk`) | **8 / 8 passed (100%)** | 100% pass rate + Phase 12 methods |
| Browser E2E Suite (Playwright) | **60 / 60 passed (100%)** | 100% pass rate + Phase 12 scenarios |
| Next.js Web Build | **20 / 20 routes cleanly compiled** | 100% clean compilation |

---

## 3. Database Schema & Data Models (`packages/database`)

New models to add to `packages/database/prisma/schema.prisma`:
1. `WorkflowEnvironment`: Environment metadata, protection status, approval requirements, active release pointer.
2. `EnvironmentVariable`: Key-value pairs with `isSecret` boolean, encrypted using existing AES-256-GCM authenticated encryption (`encryptCredentials`).
3. `EnvironmentCredentialBinding`: Maps required integration keys (`slack`, `github`, etc.) to specific `ConnectedAccount` credentials per environment.
4. `WorkflowReleaseArtifact`: Immutable snapshot of workflow topology (nodes, edges, trigger, config declarations) with canonical SHA-256 `contentHash`.
5. `WorkflowDeployment`: Deployment records tracking promotion state machine (`PENDING_APPROVAL`, `APPROVED`, `DEPLOYING`, `DEPLOYED`, `FAILED`, `ROLLED_BACK`), structural diffs, validation logs, initiator, and approver.
6. `DeploymentPolicy`: Environment-specific governance rules (approval requirements, allowed roles, self-approval prevention, required test passes).
7. `WorkflowTestCase`: Test fixtures with trigger input data, expected status, node-level assertions, and mock outputs.
8. `WorkflowTestRun`: Execution records of test cases against specific release content hashes and environments with dry-run/mocked labeling.

Modifications to existing models:
- `Workspace`: Add relations to `environments`, `releaseArtifacts`, `deployments`, `deploymentPolicies`, `testCases`, `testRuns`.
- `Workflow`: Add relations to `releaseArtifacts`, `deployments`, `testCases`, `testRuns`.
- `WorkflowExecution`: Add optional `environmentId` and `releaseArtifactId` fields.

---

## 4. Shared Schemas & Types (`@flowforge/shared`)

Add `packages/shared/src/environments.ts`:
- Environment, variable, and credential binding Zod schemas and DTOs.
- Release artifact validation and canonicalization schemas.
- Deployment creation, diff, and approval schemas.
- Test case and test run schemas.
- New API key scopes: `environments:read`, `environments:write`, `releases:read`, `releases:create`, `deployments:promote`, `deployments:approve`, `deployments:rollback`, `tests:run`.
- New outbound webhook events: `deployment.promoted`, `deployment.approved`, `deployment.failed`, `deployment.rolled_back`.

---

## 5. Backend Services & Engine (`apps/api`)

1. `apps/api/src/services/environments.ts`:
   - Auto-provision default environments (`Development`, `Staging`, `Production`).
   - CRUD for environments, environment variables (with AES-256-GCM encryption), and credential bindings.
   - Variable resolution engine replacing `{{env.VAR_NAME}}` in workflow node configurations.
2. `apps/api/src/services/releases.ts`:
   - Canonical serialization (deterministic JSON key ordering).
   - Content hash calculation (`crypto.createHash('sha256')`).
   - Secret stripping (guaranteed exclusion of API keys, tokens, passwords).
   - Immutable artifact creation and retrieval.
3. `apps/api/src/services/deployments.ts`:
   - Pre-flight validation (graph integrity, environment variable availability, credential bindings).
   - Structural diff computation (added/removed/modified nodes, edges, configs).
   - Deployment promotion state machine with optimistic concurrency control.
   - Approval enforcement (delegating to or extending `DeploymentPolicy` and `ApprovalRequest`).
   - Atomic release activation in environment.
   - Rollback engine restoring prior release artifacts with pre-flight safety checks.
4. `apps/api/src/services/workflowTesting.ts`:
   - Test case management.
   - Test runner executing workflow against test fixtures in `DRY_RUN` or `MOCKED` mode.
   - Assertion evaluator (EQUALS, CONTAINS, EXISTS, GREATER_THAN).
   - Test gate verification ensuring passing test run for exact release content hash.
5. API Routes in `apps/api/src/routes/`:
   - `apps/api/src/routes/environments.ts`
   - `apps/api/src/routes/releases.ts`
   - `apps/api/src/routes/deployments.ts`
   - `apps/api/src/routes/workflowTesting.ts`

---

## 6. Official TypeScript SDK (`packages/sdk`)

Extend `FlowForgeClient` with:
- `client.environments`: `list()`, `get()`, `create()`, `listVariables()`, `setVariable()`, `deleteVariable()`, `listBindings()`, `setBinding()`
- `client.releases`: `list()`, `get()`, `create()`, `validate()`, `diff()`
- `client.deployments`: `list()`, `promote()`, `get()`, `approve()`, `reject()`, `rollback()`
- `client.tests`: `list()`, `create()`, `update()`, `run()`, `getRun()`

---

## 7. Frontend Experience (`apps/web`)

1. **Environments & Releases Page (`/environments`)**:
   - Environment status cards (`Development`, `Staging`, `Production`) showing current active release, last deployment timestamp, and health status.
   - Environment variables tab with secret masking and editing.
   - Credential bindings tab mapping required integrations to connected accounts.
   - Deployment history table with status badges and rollback triggers.
2. **Release Promotion & Diff Inspector**:
   - Promotion modal choosing destination environment.
   - Pre-flight readiness check (variables, bindings, test gates).
   - Visual side-by-side / structural diff modal.
   - Approval state indicator.
3. **Workflow Test Center**:
   - Test case builder (trigger payload, node mock outputs, assertions).
   - Test execution panel with live run results, node-level diagnostics, and pass/fail indicators.
4. **AppShell Navigation**:
   - Add `Environments` to navigation items.

---

## 8. Implementation Sequence

1. **Stage A**: Run baselines and document plan (Completed).
2. **Stage B**: Database schema updates in `packages/database`, migration/push, client generation.
3. **Stage C**: Shared types and Zod schemas in `@flowforge/shared`.
4. **Stage D**: Backend services and routes in `apps/api` (`environments`, `releases`, `deployments`, `workflowTesting`).
5. **Stage E**: TypeScript SDK updates in `packages/sdk` and test suite `test/phase12.test.ts`.
6. **Stage F**: Web application UI in `apps/web` (`/environments`, promotion modal, test center).
7. **Stage G**: Playwright E2E browser tests in `e2e/smoke.spec.ts`.
8. **Stage H**: Technical documentation in `docs/` and final completion report.
