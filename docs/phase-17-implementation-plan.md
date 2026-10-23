# FlowForge Automation SaaS — Phase 17 Implementation Plan
## Enterprise Data Residency, Customer-Managed Encryption, and Advanced Compliance Controls

### 1. Executive Mission & Architectural Foundations
Phase 17 integrates enterprise data residency, customer-managed encryption keys (CMEK), envelope encryption, fine-grained data classification, legal-hold-aware retention governance, and verifiable compliance evidence into FlowForge Automation SaaS.

This architecture builds directly upon Phase 15 (worker leasing, fencing tokens, durable checkpoints, transactional outbox) and Phase 16 (Tier A horizontal single-region scale, Tier B authoritative home-region placement, failover epochs, and capacity management), preserving all previous guarantees while introducing cryptographically sound, server-enforced security boundaries.

---

### 2. Baseline Architecture Audit
- **Tenancy & Regional Routing (Phase 16)**:
  - `Workspace` has `homeRegion` (default: `us-east-1`), `dataResidency` (default: `GLOBAL`), and `failoverEpoch`.
  - Execution runner (`apps/api/src/engine/runner.ts`) fails closed on misdirected execution and stale failover epochs.
- **Existing Encryption (Phases 3, 10, 12)**:
  - `apps/api/src/security/encryption.ts` provides AES-256-GCM symmetric encryption (`enc:v1:<iv>:<tag>:<ciphertext>`) using a server-wide static key.
  - Used for OAuth tokens, connected account credentials, environment secrets, and SSO secrets.
  - **Phase 17 Enhancement**: Introduce provider-neutral envelope encryption (`cmek:v1:<keyId>:<keyVersion>:<wrappedDek>:<iv>:<tag>:<ciphertext>`) where each tenant can manage or rotate their own Key Encryption Key (KEK) via KMS.
- **Data Retention & Compliance (Phases 9, 14)**:
  - `apps/api/src/services/dataRetention.ts`: cleans executions, webhook deliveries, and audit logs.
  - `apps/api/src/services/complianceService.ts`: signed audit log export with SHA-256 checksums.
  - **Phase 17 Enhancement**: Add legal hold protection (`legalHold: true` blocks deletion), granular retention categories (payloads, diagnostics, exports), and immutable compliance evidence records.

---

### 3. Data Residency Policy Engine Design
- **Authoritative Residency Policy (`WorkspaceResidencyPolicy`)**:
  - `workspaceId`: Pinned to workspace.
  - `homeRegion`: Primary authoritative execution region (`us-east-1`, `eu-central-1`, `ap-southeast-1`).
  - `permittedProcessingRegions`: Regions authorized to process workflow execution jobs.
  - `permittedStorageRegions`: Regions authorized to persist execution payloads and database records.
  - `permittedBackupRegions`: Regions authorized for disaster-recovery replicas and backup targets.
  - `crossRegionReplicationAllowed`: Boolean flag controlling standby replication.
  - `thirdPartyProcessingAllowed`: Boolean flag governing external AI / webhook integrations.
  - `status`: `ACTIVE`, `PENDING_REVIEW`, `NON_COMPLIANT`.
  - `policyVersion`: Monotonically incrementing version integer.
- **Enforcement Boundaries**:
  - Mutating workflow and execution dispatches are intercepted by `ResidencyPolicyService`.
  - Requests outside permitted processing regions fail closed with `HTTP 451 Unavailable For Legal Reasons` / `HTTP 421 Misdirected Request` (`RESIDENCY_POLICY_VIOLATION`).
  - Worker execution leases and failover drills verify against active residency policies.
- **Residency Verification Service**:
  - Evaluates actual database persistence and worker execution region against policy.
  - Marks status as `VERIFIED` (when verified against server topology) or `UNVERIFIED` (distinguishing physical placement proof from metadata).

---

### 4. Customer-Managed Encryption Keys (CMEK) Architecture
- **Envelope Encryption Pattern**:
  1. Generate cryptographically strong 256-bit Data Encryption Key (DEK) via `crypto.randomBytes(32)`.
  2. Encrypt application payload using AES-256-GCM with DEK -> produces ciphertext, 96-bit IV, and 128-bit authentication tag.
  3. Wrap DEK with tenant's KEK via `KmsProvider.wrapKey(keyRef, dek)` -> wrapped DEK.
  4. Format ciphertext: `cmek:v1:<keyId>:<keyVersion>:<wrappedDekHex>:<ivHex>:<tagHex>:<ciphertextHex>`.
  5. Never persist plaintext DEK or KEK to disk or database.
- **Provider Abstraction (`KmsProvider`)**:
  - `registerKey(keyRef)`: Validates format and accessibility.
  - `wrapKey(keyRef, plaintextDek)`: Encrypts DEK using provider KEK.
  - `unwrapKey(keyRef, wrappedDek, keyVersion)`: Decrypts DEK using provider KEK.
  - `rotateKey(keyRef)`: Advances key version in provider.
  - `getKeyMetadata(keyRef)`: Returns key state, version, and trust boundary.
  - `revokeKey(keyRef)`: Disables / revokes key.
- **Providers**:
  - `LocalKmsProvider`: In-memory / secure local master-key encryption for development, CI, and local tests.
  - `AwsKmsProvider`: Production AWS KMS envelope encryption adapter (via KMS API).
  - Explicit configuration: No silent fallback to development keys in production.

---

### 5. Data Classification & Coverage Matrix
| Data Category | Classification | Protection Mechanism |
| :--- | :--- | :--- |
| **Connected Account OAuth Tokens** | `RESTRICTED` | CMEK Envelope Encryption (AES-256-GCM) |
| **Integration Credentials & API Keys** | `RESTRICTED` | CMEK Envelope Encryption (AES-256-GCM) |
| **Environment Variable Secrets** | `RESTRICTED` | CMEK Envelope Encryption (AES-256-GCM) |
| **Workflow Execution Payloads / Inputs** | `CONFIDENTIAL`| CMEK Envelope Encryption / Tenant Storage |
| **Audit Logs & Webhook Deliveries** | `CONFIDENTIAL`| Field-level Redaction & Authenticated At-Rest Encryption |
| **System Health & Aggregated Telemetry**| `PUBLIC` | Standard Persistence, Zero PII |

---

### 6. Key Lifecycle, Rotation, and Recovery
- **Lifecycle States**: `PENDING`, `ACTIVE`, `ROTATION_IN_PROGRESS`, `DISABLED`, `REVOKED`, `ERROR`.
- **Fast DEK Re-Wrapping**:
  - Key rotation can unwrap DEKs using the old KEK and re-wrap them using the new KEK version without decrypting large payloads, making rotation fast and non-destructive.
- **Revocation Safety**:
  - Irreversible revocation requires impact assessment (calculating dependent executions and credentials) and explicit confirmation.
- **Disaster Recovery**:
  - Keys remain authoritative; if KMS is unavailable, operations fail closed (`KMS_UNAVAILABLE`) rather than exposing plaintext.

---

### 7. Data Lifecycle & Retention with Legal Holds
- **`WorkspaceRetentionPolicy` Additions**:
  - `legalHold`: When `true`, all automated and manual purges for the workspace are blocked.
  - `legalHoldReason`: Auditable reason for the hold.
  - `legalHoldSetById`: User ID of compliance officer / admin.
- **Retention Sweeper (`DataRetentionService`)**:
  - Supports dry-run simulation mode returning impacted record counts.
  - Bounded batch execution preventing database locking.

---

### 8. Compliance Evidence Records
- Model `ComplianceEvidenceRecord` records tamper-evident evidence:
  - Cryptographic SHA-256 hash across evidence payload.
  - Records residency verification runs, CMEK rotations, retention purges, and legal hold changes.
  - Integrated into `/governance` and `/compliance` audit views.

---

### 9. Verification & Testing Plan
1. **Database Sync**: Apply schema additions via `npm --prefix packages/database run db:push`.
2. **Shared Package**: Add Phase 17 schemas to `packages/shared/src/compliance.ts` and build `@flowforge/shared`.
3. **Backend Services & Routes**: Implement `residencyService.ts`, `cmekService.ts`, `kmsProvider.ts`, and corresponding API routes under `/residency`, `/cmek`, and `/retention`.
4. **TypeScript SDK**: Expose typed methods in `client.residency`, `client.cmek`, and `client.compliance`.
5. **Web UI**: Enhance `/governance` and `/operations` with residency policy configuration, CMEK rotation status, and legal hold controls.
6. **Vitest Suite**: Add `apps/api/test/phase17.test.ts` covering residency enforcement, CMEK envelope encryption, key rotation, legal hold retention blocking, and evidence records.
7. **Regression Testing**: All 16 previous test suites (295 tests) + SDK tests (16 tests) + Playwright browser tests (82 tests) passing 100%.
8. **Documentation**: Authored runbooks in `docs/security/*` and `docs/compliance/*` + completion report `docs/phase-17-completion-report.md`.
