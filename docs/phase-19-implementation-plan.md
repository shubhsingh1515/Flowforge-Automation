# FlowForge Automation SaaS — Phase 19 Implementation Plan
## Enterprise Integration Developer Platform, Connector SDK, Certification Pipeline, Versioned Marketplace, and Secure Runtime

### 1. Architectural Scope & Objectives
Phase 19 delivers a developer platform that enables first-party and third-party developers to author, validate, test, certify, publish, and govern versioned connectors under FlowForge's secure execution runtime.

Building on Phases 3, 8, 9, 12, 14, 17, and 18, Phase 19 introduces:
1. **Versioned Connector Manifest & Strict Contract Validation**:
   - Manifest schema validating triggers, actions, schemas, auth configurations, permissions, timeouts, retries, and residency support.
   - Server-side deterministic validation, rejection of unauthorized privileged capabilities, canonicalization, and SHA-256 artifact hashing.
2. **Typed Connector SDK & Developer Tooling (`packages/connector-sdk`)**:
   - Typed definition helpers for triggers and actions.
   - Input and output runtime validation, safe logging/redaction helpers, pagination helpers.
   - `ConnectorTestHarness` for contract and security testing.
3. **Secure Connector Execution Runtime**:
   - Sandboxed execution within the existing node execution engine (`customIntegration.ts`).
   - Bounded execution timeouts (max 30s) and payload size bounds.
   - Redirect-aware, multi-hop SSRF validation (`validateUrlForSsrf`).
   - Credential isolation and secret redaction.
   - Immediate execution blockage on suspended or revoked connectors.
4. **Connector Certification & Automated Pipeline**:
   - 6-stage automated pipeline:
     - `MANIFEST_SCHEMA_VALIDITY`
     - `ACTION_TRIGGER_CONTRACTS`
     - `CREDENTIAL_SAFETY_AND_REDACTION`
     - `SSRF_AND_EGRESS_COMPLIANCE`
     - `TENANT_ISOLATION_AND_RESIDENCY`
     - `ARTIFACT_PROVENANCE_INTEGRITY`
   - Persisted certification records and security review workflow (admin approval/rejection).
5. **Immutable Versioned Artifacts, Provenance & Revocation**:
   - Canonical SHA-256 artifact hashing (`artifactHashSha256`).
   - Mutation rejection on published versions.
   - Emergency security suspension/revocation.
6. **Marketplace Publication, Governed Installation, Upgrades & Rollbacks**:
   - Publisher verification and marketplace listings.
   - Preflight upgrade diff (detecting breaking action removals, added required inputs, or new scopes).
   - Safe rollback to prior non-suspended versions.
7. **Connector Health & Developer Diagnostics**:
   - Aggregated execution metrics (counts, success/failure rate, P95 duration, error categories).
   - Tenant privacy preservation (no cross-tenant data leakage).
   - Integration with Phase 18 incidents and alerts.

---

### 2. Component Mapping to Monorepo

| Subsystem | Existing Files | Phase 19 Deliverables |
| :--- | :--- | :--- |
| **Database Models** | `packages/database/prisma/schema.prisma` | Add `ConnectorReleaseArtifact`, `ConnectorCertificationRecord`, `ConnectorCertificationCheck`, `ConnectorExecutionMetric`; update `Workspace`, `MarketplaceListing`, `MarketplaceInstallation` |
| **Shared Contracts & SDK** | `packages/shared/src/developer.ts`, `marketplace.ts` | Create `packages/shared/src/connector-p19.ts` and `packages/connector-sdk` package; export in `@flowforge/shared` |
| **Core Services** | `apps/api/src/services/customIntegrations.ts`, `marketplace.ts` | Create `apps/api/src/services/connectorPlatformService.ts`, `connectorCertificationService.ts`, update `apps/api/src/engine/nodes/customIntegration.ts` |
| **API Layer** | `apps/api/src/routes/customIntegrations.ts`, `marketplace.ts` | Create `apps/api/src/routes/connectors.ts`, register in `apps/api/src/server.ts` |
| **SDK Layer** | `packages/sdk/src/index.ts` | Add `client.connectors` namespace and test in `packages/sdk/test/sdk.test.ts` |
| **Web UI** | `apps/web/src/app/marketplace/page.tsx`, `apps/web/src/components/developer/CustomIntegrationsTab.tsx` | Add Connector Studio & Certification Console in UI with manifest editor, certification scorecard, and upgrade diff modal |
| **Verification & Tests** | `apps/api/test/`, `e2e/smoke.spec.ts` | Write `apps/api/test/phase19.test.ts` (15-20 integration tests), add Scenario 44 to Playwright smoke suite |
| **Documentation** | `docs/` | Create `docs/developer-platform/connector-sdk-and-certification.md` and `docs/phase-19-completion-report.md` |

---

### 3. Step-by-Step Execution Plan

1. **Database Schema Sync**:
   - Add Phase 19 models to `packages/database/prisma/schema.prisma`.
   - Run `prisma db push` and `prisma generate`.
2. **Shared Types & Manifest Schema**:
   - Create `packages/shared/src/connector-p19.ts` defining `ConnectorManifestSchema`, `ConnectorManifestDTO`, certification DTOs, and upgrade diff schemas.
   - Re-export in `packages/shared/src/index.ts` and build `@flowforge/shared`.
3. **Connector SDK Package (`packages/connector-sdk`)**:
   - Create typed connector definition builders (`defineConnector`, `defineAction`, `defineTrigger`).
   - Create `ConnectorTestHarness` for contract testing.
   - Build package.
4. **Backend Services**:
   - `connectorPlatformService.ts`: Manifest validation, draft management, release publishing, installation, upgrade preflight, rollback, suspension.
   - `connectorCertificationService.ts`: Automated 6-check pipeline and audit recording.
   - Update `apps/api/src/engine/nodes/customIntegration.ts`: Add runtime enforcement of suspension checks, timeouts, and redaction.
5. **API Routes**:
   - Create `apps/api/src/routes/connectors.ts` and register in `server.ts`. Build API.
6. **TypeScript SDK & Web UI**:
   - Extend `packages/sdk/src/index.ts` with `client.connectors`. Build SDK and run SDK tests.
   - Update `apps/web/src/lib/api.ts` and Web UI with Connector Studio & Certification Drawer. Build Web.
7. **Verification & Regression Testing**:
   - Run `apps/api/test/phase19.test.ts`.
   - Run full regression suite (`npm --prefix apps/api run test -- --fileParallelism=false`).
   - Add Scenario 44 to `e2e/smoke.spec.ts` and run full Playwright smoke suite.
8. **Documentation**:
   - Auth architecture, runbooks, and completion reports.
