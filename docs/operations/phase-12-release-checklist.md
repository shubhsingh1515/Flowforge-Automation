# Phase 12 Production Release Checklist

Before enabling Phase 12 capabilities for customer workspaces, verify each item in this operational checklist.

---

## 1. Database & Migrations
- [x] Schema synchronized with `prisma db push` / migrations.
- [x] Indexes verified on `workflow_environments(workspaceId, slug)`.
- [x] Indexes verified on `workflow_release_artifacts(workflowId, contentHash)`.
- [x] Indexes verified on `workflow_deployments(environmentId, status)`.
- [x] Cascade delete constraints tested for multi-tenant isolation.

---

## 2. Cryptographic Security & Secrets
- [x] `FLOWFORGE_ENCRYPTION_KEY` configured with valid 32-byte hexadecimal key.
- [x] AES-256-GCM encryption verified for sensitive environment variables.
- [x] API outputs rigorously strip/redact secret variables with `[REDACTED]`.
- [x] Release artifacts strip all credentials, tokens, and sensitive URLs before computing SHA-256 hash.
- [x] Tamper detection verified on release artifact definition validation.

---

## 3. Governance & Quality Gates
- [x] Default environments (`Development`, `Staging`, `Production`) auto-provisioned upon workspace creation or first access.
- [x] Production environment protected by default (`isProtected: true`).
- [x] Separation of duties verified: Initiator prevented from self-approving deployments when policy enabled.
- [x] Automated test runner passes assertions in non-destructive `DRY_RUN` mode without external network side-effects.
- [x] Rollback capability tested and verified to restore prior release artifact atomically.

---

## 4. Test Verification
- [x] Vitest API Suite: 234 / 234 tests passed (100% green across 12 suites).
- [x] TypeScript SDK Suite: 12 / 12 tests passed.
- [x] Playwright Browser Smoke Suite: 66 / 66 tests passed (100% green across Desktop Chrome and Mobile Chrome).
- [x] Next.js compilation: Clean build with zero TypeScript or route compilation errors.
