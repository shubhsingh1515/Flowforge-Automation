# Community Template Hub & Reusable Recipe Ecosystem

## 1. Overview

The FlowForge Community Template Hub enables engineers to share pre-configured workflow architectures for common integration patterns, data synchronization jobs, and operational automations.

Templates are accessible via the `/marketplace` UI under the "Automation Recipes" tab and through the existing `/templates` library.

---

## 2. Recipe Safety & Sanitization Contract

When a workflow template is instantiated into a workspace (`POST /api/v1/templates/:id/instantiate`), the engine enforces strict sanitization to guarantee security and isolation:

### 2.1 Complete Credential Stripping
Templates are strictly stateless graph configurations. They **NEVER** contain:
- API keys, OAuth access/refresh tokens, or passwords.
- Real webhook signing secrets or HMAC keys.
- Tenant-specific account IDs or private database connection strings.

Any credential bindings in the source workflow are wiped during publishing. Nodes requiring authenticated credentials are instantiated with unlinked account states, requiring the recipient to explicitly attach an authorized `ConnectedAccount`.

### 2.2 Fresh Graph ID Generation
To prevent node collision and accidental cross-talk:
- Every node in the template graph receives a new, unique UUID: `node_${Date.now()}_${randomBytes(4).toString('hex')}`.
- All connecting edges are rewritten to point to the newly minted node IDs.
- Sub-graph dependencies and step references are remapped in topological order.

### 2.3 Draft-by-Default Status
All instantiated recipes are created with `status = "DRAFT"`. Workflows are never activated automatically. The workspace engineer must configure required credentials, verify configuration options, and explicitly test the workflow prior to activation.

---

## 3. Seeded Platform Recipes

The Template Hub includes pre-built platform recipes covering core automation patterns:
1. **Hourly API Health Monitoring & Alerting**: Periodically polls critical endpoints, checks status codes, and halts with diagnostic notifications if unhealthy.
2. **Loop Through Array Records**: Demonstrates array chunking and rate-limited sequential iteration for line-item records.
3. **Normalize & Transform JSON Payload**: Reshapes nested inbound webhook data into clean tabular structures before forwarding downstream.
4. **Filter Incoming Events Before REST API Dispatch**: Validates event properties and discards invalid payloads before REST API calls.
5. **Webhook Ingestion to Slack Notification**: Alerts channels when new customer events arrive.
