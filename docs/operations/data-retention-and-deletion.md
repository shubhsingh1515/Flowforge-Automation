# Customer Data Rights, Retention & Deletion Runbook

## 1. Automated Data Retention Cleanup

FlowForge implements background bounded data retention enforcement in `apps/api/src/services/dataRetention.ts`:

### 1.1 Configurable Windows (`WorkspaceRetentionPolicy`)
- `executionRetentionDays`: Purges old `Execution` records and detailed node execution logs.
- `webhookDeliveryRetentionDays`: Purges outbound `WebhookDelivery` attempts and response headers.
- `auditLogRetentionDays`: Purges historical `WorkspaceAuditLog` entries past policy limit (up to 365 days on Enterprise/Business plans).

### 1.2 Bounded Batch Execution
The cleanup job (`cleanupExpiredData`) processes deletions in bounded batches of 500 records to prevent PostgreSQL transaction log lockups or connection saturation.

---

## 2. Self-Service Data Portability (GDPR Article 20 / CCPA)

- Endpoint: `POST /api/v1/workspaces/current/data-export`
- Generates an encrypted, structured JSON bundle containing:
  - Workflows and visual layout graphs.
  - Connected account metadata (provider, name, creation date).
  - Webhook endpoints and event history.
  - Audit trail records.
- **Zero-Secret Guarantee**: Explicitly sanitizes and omits passwords, OAuth tokens, and encryption secrets.

---

## 3. Deliberate Workspace Deprovisioning (Right to be Forgotten)

- Endpoint: `POST /api/v1/workspaces/current/deletion-request`
- Multi-step verification:
  1. Operator must provide explicit reason.
  2. Operator must match exact confirmation phrase (`DELETE WORKSPACE {WORKSPACE_NAME}`).
  3. Cascading delete executes across workflows, executions, credentials, and installations.
