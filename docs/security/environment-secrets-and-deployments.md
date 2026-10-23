# Security Guardrails: Environment Secrets and Deployment Safety

Security and multi-tenant data protection are foundational to FlowForge Automation's Phase 12 release architecture.

---

## 1. Secret Protection & Authenticated Encryption

### Encryption at Rest
- All secret environment variables (`isSecret: true`) are encrypted using authenticated **AES-256-GCM** before persistence in the PostgreSQL database.
- Ciphertext, IV, and auth tags are stored in the `EnvironmentVariable` model (`encryptedValue`, `iv`, `authTag`).
- Plaintext values are never written to database disk or transaction logs.

### Zero Secret Exposure in API & UI
- When querying environment variables via REST API or GraphQL, secret values are completely redacted and returned as `[REDACTED]`.
- Frontend tables and inputs display masked placeholder text (`[REDACTED SECRET]`) with security badges.
- Secret values cannot be read back through public or internal GET endpoints.

### Secret Stripping from Release Artifacts
- The release engine completely strips credentials, tokens, passwords, and sensitive connection pointers when generating immutable `WorkflowReleaseArtifact` payloads.
- Workflow definitions reference environment variables through abstract expression keys:
  `{{ env.PAYMENT_GATEWAY_URL }}` or `{{ env.STRIPE_SECRET_KEY }}`.
- Deploying the same release artifact across environments automatically binds to the target environment's scoped secrets without altering the artifact's SHA-256 hash.

---

## 2. Multi-Tenant Isolation

- Every environment, variable, credential binding, release artifact, deployment record, test case, and test run is strictly bounded by `workspaceId`.
- Database foreign keys enforce cascade deletion on workspace removal.
- API middleware verifies workspace membership and permissions before granting access to any environment resource.
- Cross-workspace artifact promotion or variable resolution is blocked at both query and service layer boundaries.

---

## 3. Governance Policies & Self-Approval Prevention

Enterprise workspaces can enforce strict deployment policies:
1. **`preventSelfApproval`**:
   - The user who creates or initiates a promotion request cannot approve that same deployment.
   - Self-approval attempts are rejected with HTTP 403 (`"Separation of duties: The deployment author cannot approve their own promotion."`).
2. **`requireApprovalForProduction`**:
   - Any deployment targeting `Production` transitions to `PENDING_APPROVAL` and requires explicit sign-off by a workspace `ADMIN` or `OWNER`.
3. **`requirePassingTests`**:
   - Releases cannot be promoted to `Production` unless all associated test cases have passed against the exact release SHA-256 hash.
