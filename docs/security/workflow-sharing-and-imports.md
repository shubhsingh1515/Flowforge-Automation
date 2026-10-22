# FlowForge Automation — Security Guide: Sharing, Templates & Imports

## 1. Threat Model & Risks

When workflows are exported, shared, or imported from external sources, several security risks arise:
1. **Secret Exfiltration**: Accidentally exporting sensitive API keys, webhook secrets, database credentials, or OAuth tokens.
2. **Malicious Graph Injection**: Importing an adversarial JSON payload containing circular references, oversized strings (DoS), or unauthorized endpoints.
3. **Privilege Escalation**: Attempting to execute unauthorized workspace actions or access other tenants' connected accounts.

---

## 2. Defensive Countermeasures

### 2.1 Outbound Sanitization (Zero-Secret Export)
When exporting a workflow or saving it as a reusable template:
- All credential fields (`apiKey`, `token`, `secret`, `password`, `authHeader`, `webhookSecret`) are stripped from node configurations.
- `connectionId` references to tenant OAuth credentials are completely removed.
- Headers containing `Authorization` or `Bearer` tokens in HTTP nodes are redacted.

### 2.2 Inbound Validation & Sandboxing
- Strict JSON Schema validation using Zod (`flowforge/v1`).
- Graph DAG topology validation ensuring no cycles or invalid edge references.
- All imported node and edge IDs are replaced with fresh cryptographic UUIDs to prevent ID collisions.
- All imported third-party integration nodes are marked with `needsConnection: true`, requiring the importing user to explicitly connect their own authenticated accounts.
- Imported workflows default to `WorkflowStatus.DRAFT` to prevent unintended immediate execution.

### 2.3 Multi-Tenant Isolation
- Templates created by users (`isCustom: true`) are strictly filtered by `workspaceId`. No cross-tenant visibility or leakage occurs.
- Onboarding progress and milestone states are fully scoped to the active workspace.
