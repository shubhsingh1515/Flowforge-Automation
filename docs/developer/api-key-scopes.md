# API Key Scopes Reference

FlowForge enforces strict least-privilege role-based access control (RBAC) on all API key endpoints. When generating an API key, administrators must explicitly select one or more granted scopes.

---

## Complete Scopes Matrix

| Scope Key | Display Label | Description | Allowed Operations |
|---|---|---|---|
| `workflows:read` | Read Workflows | View workflow metadata, canvas graphs, and version history. | `GET /workflows`, `GET /workflows/:id`, `GET /workflows/:id/versions`, `GET /workflows/:id/export` |
| `workflows:write` | Write Workflows | Create, update, duplicate, activate, pause, or delete workflows. | `POST /workflows`, `PUT /workflows/:id`, `DELETE /workflows/:id`, `POST /workflows/:id/activate`, `POST /workflows/:id/pause` |
| `executions:read` | Read Executions | Inspect execution traces, node statuses, logs, and outputs. | `GET /executions`, `GET /executions/:id` |
| `executions:run` | Trigger Executions | Enqueue workflow runs with custom or webhook payload data. | `POST /workflows/:id/test`, `POST /executions/:id/retry` |
| `executions:cancel` | Cancel Executions | Abort waiting or running workflow executions. | `POST /executions/:id/cancel` |
| `templates:read` | Read Templates | Browse public automation recipes and blueprint templates. | `GET /templates`, `GET /templates/:id` |
| `connections:read` | Read Connections | Inspect connected integrations metadata (zero credential leakage). | `GET /connections` |
| `webhooks:manage` | Manage Webhooks | Register outbound webhook destinations, inspect delivery logs, and trigger retries. | `GET /outbound-webhooks`, `POST /outbound-webhooks`, `PATCH /outbound-webhooks/:id`, `DELETE /outbound-webhooks/:id`, `POST /outbound-webhooks/:id/test` |
| `integrations:read` | Read Integrations | View standard and custom declarative integrations and action definitions. | `GET /integrations`, `GET /custom-integrations` |
| `integrations:manage` | Manage Integrations | Create declarative custom HTTP connectors, edit actions, publish versions, and test in sandbox. | `POST /custom-integrations`, `PUT /custom-integrations/:id`, `POST /custom-integrations/:id/publish`, `POST /custom-integrations/:id/test` |

---

## Scope Violation Response

If an API key attempts an operation for which it lacks the required scope, FlowForge immediately returns `HTTP 403 Forbidden`:

```json
{
  "error": "Forbidden",
  "message": "API key lacks required scope: workflows:write",
  "statusCode": 403,
  "requiredScope": "workflows:write"
}
```
