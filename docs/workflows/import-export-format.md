# FlowForge Automation — Portable Import & Export Schema (`flowforge/v1`)

## 1. Specification Overview
FlowForge provides a standardized, versioned JSON interchange format allowing automations to be safely exported, version-controlled in Git, and shared across environments or workspaces.

- **Schema Identifier**: `flowforge/v1`
- **Current Version**: `1.0.0`
- **MIME Type**: `application/json`

---

## 2. Document Schema

```json
{
  "$schema": "flowforge/v1",
  "version": "1.0.0",
  "metadata": {
    "name": "Stripe Webhook to Slack & Email",
    "description": "Notifies team and sends invoice receipt on payment events",
    "category": "Operations",
    "exportedAt": "2026-10-23T00:00:00.000Z",
    "flowforgeVersion": "1.0.0",
    "requiredIntegrations": ["slack", "email"]
  },
  "workflow": {
    "triggerType": "WEBHOOK",
    "cronExpression": null,
    "nodes": [
      {
        "id": "node_1",
        "type": "webhook",
        "name": "Payment Webhook",
        "position": { "x": 100, "y": 150 },
        "config": {
          "method": "POST",
          "authRequired": false
        }
      },
      {
        "id": "node_2",
        "type": "slack",
        "name": "Slack Notification",
        "position": { "x": 400, "y": 150 },
        "config": {
          "channel": "#payments",
          "message": "Payment received: ${{steps.node_1.body.amount}}",
          "needsConnection": true
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1_2",
        "source": "node_1",
        "target": "node_2",
        "sourceHandle": null,
        "targetHandle": null
      }
    ]
  }
}
```

---

## 3. Security Sanitization Rules (Outbound)

During `GET /api/v1/workflows/:id/export`, the backend `WorkflowVersioningService` runs an exhaustive credential stripping pass:

1. **Authentication Fields Removed**:
   - `apiKey`, `api_key`, `secret`, `token`, `password`, `authHeader`, `webhookSecret`
   - `connectionId` (references to private database connection records)
   - Authorization bearer headers in `http` node configurations
2. **Metadata Scrubbing**:
   - Internal workspace IDs and database primary keys are stripped.
   - User IDs and author emails are excluded.

---

## 4. Import Validation Pipeline (Inbound)

When importing via `POST /api/v1/workflows/import`:

```
[ Inbound JSON Payload ]
          │
          ▼
1. Top-Level Schema Check ($schema === "flowforge/v1")
          │
          ▼
2. Nodes Array Validation (Must be array with >= 1 node)
          │
          ▼
3. Node Integrity Check (type, valid position, non-empty id)
          │
          ▼
4. DAG Edge Consistency (Edges must reference existent node IDs)
          │
          ▼
5. Unique ID Remapping (All node and edge IDs regenerated with random UUIDs)
          │
          ▼
6. Third-Party Flagging (Third-party nodes flagged with needsConnection: true)
          │
          ▼
7. Status Enforcement (Workflow saved as DRAFT)
```

If any validation step fails, the API responds with `400 Bad Request` and structured error diagnostic messages.
