# Workflow Environments Architecture

Comprehensive documentation for FlowForge's multi-tenant workflow environments, isolation models, configuration variables, and credential bindings.

---

## 1. Environment Model

FlowForge supports multi-tier workflow isolation through workspace-scoped environments:

| Environment | Default Slug | Protection Level | Approval Gate | Test Gate | Purpose |
|---|---|---|---|---|---|
| **Development** | `development` | Unprotected | Automatic | Optional | Sandbox for rapid iteration, testing, and draft experimentation |
| **Staging** | `staging` | Standard | Optional | Mandatory | Pre-production testing mirroring production configs and test gates |
| **Production** | `production` | **Protected** | **Mandatory** | **Mandatory** | Mission-critical live execution with strict deployment governance |

---

## 2. Environment Isolation Principles

1. **Draft vs. Deployed Separation**:
   - Modifying a workflow graph in the canvas updates the editable `Workflow` and `WorkflowVersion` draft snapshots only.
   - Environments execute exclusively from their pinned, immutable `WorkflowReleaseArtifact`.
   - Editing a workflow draft in Development never alters Staging or Production executions.
2. **Tenant Scoping**:
   - All environments are owned by a single `Workspace`. Cross-workspace environment sharing is strictly prohibited by relational constraints.
3. **Execution Pinning**:
   - Every `WorkflowExecution` records the `environmentId` and `releaseArtifactId` from which it was spawned, ensuring end-to-end traceability and reproducibility.

---

## 3. Configuration Variables & Credential Bindings

### Scoped Variables
- Variables are defined per environment and referenced in node configuration parameters using the `{{env.VARIABLE_NAME}}` expression syntax.
- **Classification**:
  - `Plaintext Config`: Non-sensitive configuration (e.g. API base URLs, tenant IDs).
  - `Encrypted Secret`: Protected keys (e.g. signing secrets, bearer tokens) encrypted with AES-256-GCM.
- **Secret Redaction**:
  - Encrypted secrets are strictly masked as `[REDACTED SECRET]` in API responses, deployment diffs, and execution logs.
  - Runtime decryption occurs in-memory only when the worker process evaluates node execution parameters.

### Credential Bindings
- Release artifacts are portable and contain **zero OAuth tokens or API keys**.
- Each environment explicitly binds required third-party integration keys (e.g. `slack`, `github`, `stripe`) to an authorized, active `ConnectedAccount`.
- Promotion to an environment validates that all declared integration dependencies are bound and healthy prior to activation.
