# FlowForge Automation — Template Library & Reusable Recipes

## 1. Overview
The FlowForge Template Library provides pre-built, production-tested automation workflows that allow users to instantiate complex automations in seconds. Templates eliminate repetitive pipeline configuration, encode automation best practices, and guide users through third-party connection setup.

Templates are available in two tiers:
1. **Platform Templates**: Curated, verified automations provided out-of-the-box across 5 core categories (`Notifications`, `Data Sync`, `Operations`, `Productivity`, `Developer`).
2. **Workspace Recipes**: Custom templates created and shared by workspace team members (`isCustom: true`, scoped to `workspaceId`).

---

## 2. Supported Categories & Complexity Levels

### Categories
- **Notifications**: Cross-channel alerts across Slack, Discord, Email, and SMS (e.g., Critical Alert Dispatcher, Team Daily Digest).
- **Data Sync**: Two-way and unidirectional data synchronization between cloud CRMs and spreadsheets (e.g., New Lead CRM & Sheet Ingestion).
- **Operations**: Infrastructure event handling, incident response, and webhooks (e.g., Stripe Webhook to Accounting & Slack).
- **Productivity**: Daily automated agendas, task summarization, and calendar management.
- **Developer**: REST webhooks, schema transformation, multi-step branching, and API relays.

### Complexity Levels
- **BEGINNER**: Linear triggers and single-action payloads (1–3 nodes, ~2 min setup).
- **INTERMEDIATE**: Multi-step flows with data transformations, filters, and connected accounts (4–6 nodes, ~5 min setup).
- **ADVANCED**: Branching DAGs with loops, fork/join parallel paths, or human-in-the-loop approvals (6+ nodes, ~10 min setup).

---

## 3. Pre-Seeded Platform Templates

| Template ID | Name | Category | Complexity | Node Types |
| :--- | :--- | :--- | :--- | :--- |
| `webhook-slack-alert` | Instant Webhook to Slack Alert | Notifications | BEGINNER | `webhook`, `slack` |
| `sheets-lead-sync` | New Lead CRM & Sheet Ingestion | Data Sync | INTERMEDIATE | `webhook`, `transform`, `google-sheets`, `slack` |
| `stripe-invoice-notify` | Stripe Payment to Slack & Email | Operations | INTERMEDIATE | `webhook`, `filter`, `slack`, `email` |
| `github-release-slack` | GitHub Release to Team Announcement | Notifications | BEGINNER | `webhook`, `slack` |
| `daily-slack-digest` | Daily Scheduled Slack Digest | Productivity | BEGINNER | `schedule`, `slack` |
| `high-value-lead-approval` | High-Value Deal Human Approval | Operations | ADVANCED | `webhook`, `filter`, `approval`, `slack` |
| `batch-customer-sync` | Batch Customer Data Loop & Transform | Data Sync | ADVANCED | `webhook`, `transform`, `loop`, `http` |
| `incident-triage-dispatch` | Incident Response & Multi-Channel Alert | Operations | ADVANCED | `webhook`, `transform`, `slack`, `email`, `http` |
| `webhook-http-relay` | Webhook to HTTP API Relay | Developer | BEGINNER | `webhook`, `transform`, `http` |

---

## 4. Safe Instantiation & ID Remapping Architecture

When a user selects **Use Template**, the engine ensures complete isolation from the template definition:

```
[ Template Definition ]
       │
       ▼
[ Instantiate Request ] ───► POST /api/v1/templates/:id/instantiate
       │
       ├── 1. Generate unique UUIDs for all nodes (e.g., node_xxx)
       ├── 2. Map existing node IDs to new UUIDs
       ├── 3. Rewrite edge source, target, and handle references
       ├── 4. Inspect node configs: set `needsConnection: true` for third-party integrations
       ├── 5. Clear sensitive runtime states & execution caches
       ├── 6. Force workflow status to WorkflowStatus.DRAFT
       └── 7. Persist to PostgreSQL under user's active workspace
```

### Third-Party Connection Placeholders
When instantiated, third-party nodes (e.g., Slack, Google Sheets, GitHub) have their `connectionId` set to `""` or `null`, and are marked with `needsConnection: true`. The workflow editor displays a warning badge indicating credentials must be bound prior to activation.

---

## 5. Saving Custom Workflows as Recipes

Users can convert any existing workflow into a workspace recipe via:
```http
POST /api/v1/workflows/:id/save-as-template
```
**Security Enforcement**:
- All OAuth connection tokens, client secrets, passwords, and webhook signatures are stripped.
- Graph node structure and field mappings are preserved.
- The recipe is saved with `isCustom: true` and scoped strictly to the requesting `workspaceId`.
