# Enterprise Governance, RBAC & Policy Guardrails

## 1. Overview

FlowForge provides multi-tenant enterprise governance controls via the `WorkspaceGovernancePolicy` database entity. Workspace owners and administrators can set platform guardrails governing integration installation, outbound webhook transmission, and credentials management.

---

## 2. Policy Dimensions

| Policy Flag | Default | Description |
|---|---|---|
| `allowMarketplacePublishing` | `false` | When true, workspace admins can submit custom integrations to the marketplace. |
| `allowCommunityTemplates` | `true` | Allows members to instantiate community-contributed workflow recipes. |
| `requireHttpsWebhooks` | `true` | Enforces HTTPS on all outbound webhook registration URLs. |
| `restrictIntegrationsToAdmin` | `false` | When true, only workspace `ADMIN` and `OWNER` roles can install marketplace packages. |
| `maxApiKeyLifetimeDays` | `90` | Upper limit for developer API key validity. |
| `requireMfa` | `false` | Signals enforcement of multi-factor authentication for workspace members. |

---

## 3. Role-Based Access Control (RBAC) Enforcement

1. **Policy Administration**: Only `OWNER` and `ADMIN` roles can query and update `WorkspaceGovernancePolicy` (`api.governance.updatePolicy`).
2. **Audit Logging**: Any modification to workspace policies is automatically recorded in `WorkspaceAuditLog` with actor ID, timestamp, and previous/updated values.
3. **Audit Querying**: Read access to `WorkspaceAuditLog` is restricted to authorized workspace administrators.
