# FlowForge Automation — Public REST API Reference

The FlowForge Automation REST API allows developers and teams to manage workflows, trigger runs, inspect execution history, register outbound webhooks, and interact with custom integrations programmatically.

All API routes are served under `/api/v1` and require TLS in production environments.

---

## 1. Base URL & Environments

| Environment | Base URL |
|---|---|
| Production | `https://api.flowforge.com/api/v1` |
| Local Development | `http://localhost:4000/api/v1` |
| OpenAPI Specification | `http://localhost:4000/api/v1/docs` (Swagger UI) & `/api/v1/docs/json` (Raw JSON) |

---

## 2. Authentication

Requests to the FlowForge Public REST API can be authenticated via:

1. **Bearer Token Header**:
   ```http
   Authorization: Bearer ffk_live_0123456789abcdef...
   ```
2. **Custom API Key Header**:
   ```http
   X-API-Key: ffk_live_0123456789abcdef...
   ```

API keys are scoped to a single workspace and enforce least-privilege access. API keys never expire unless an expiration timeframe was explicitly configured upon creation.

---

## 3. Endpoints Overview

### Workflows
- `GET /api/v1/workflows` — List workspace workflows with pagination & search (Requires `workflows:read`).
- `POST /api/v1/workflows` — Create a new workflow definition (Requires `workflows:write`).
- `GET /api/v1/workflows/:id` — Retrieve workflow graph definition (Requires `workflows:read`).
- `PUT /api/v1/workflows/:id` — Update workflow metadata and graph nodes/edges (Requires `workflows:write`).
- `DELETE /api/v1/workflows/:id` — Delete workflow and all historical runs (Requires `workflows:write`).
- `POST /api/v1/workflows/:id/activate` — Validate graph and activate triggers (Requires `workflows:write`).
- `POST /api/v1/workflows/:id/pause` — Pause active triggers (Requires `workflows:write`).
- `POST /api/v1/workflows/:id/test` — Trigger a test run with custom JSON payload (Requires `executions:run`).
- `GET /api/v1/workflows/:id/versions` — List immutable version snapshots (Requires `workflows:read`).
- `POST /api/v1/workflows/:id/export` — Export sanitized workflow template (Requires `workflows:read`).

### Executions
- `GET /api/v1/executions` — List past executions with filter by status or workflow (Requires `executions:read`).
- `GET /api/v1/executions/:id` — Retrieve step-by-step node execution traces (Requires `executions:read`).
- `POST /api/v1/executions/:id/retry` — Retry an eligible failed execution (Requires `executions:run`).
- `POST /api/v1/executions/:id/cancel` — Cancel a running or waiting execution (Requires `executions:cancel`).

### API Keys
- `GET /api/v1/api-keys` — List workspace API keys (excludes secret hash) (Requires user session).
- `POST /api/v1/api-keys` — Create a new scoped API key and obtain secret once (Requires user session).
- `POST /api/v1/api-keys/:id/rotate` — Invalidate old key and generate replacement (Requires user session).
- `DELETE /api/v1/api-keys/:id` — Immediately revoke an API key (Requires user session).

### Outbound Webhooks
- `GET /api/v1/outbound-webhooks` — List registered webhook endpoints (Requires `webhooks:manage`).
- `POST /api/v1/outbound-webhooks` — Register a destination URL with subscribed events (Requires `webhooks:manage`).
- `GET /api/v1/outbound-webhooks/:id` — Retrieve webhook details (Requires `webhooks:manage`).
- `PATCH /api/v1/outbound-webhooks/:id` — Update destination URL or subscribed events (Requires `webhooks:manage`).
- `DELETE /api/v1/outbound-webhooks/:id` — Remove webhook endpoint (Requires `webhooks:manage`).
- `POST /api/v1/outbound-webhooks/:id/rotate-secret` — Rotate HMAC signing secret (Requires `webhooks:manage`).
- `GET /api/v1/outbound-webhooks/:id/deliveries` — List recent delivery logs and response codes (Requires `webhooks:manage`).
- `POST /api/v1/outbound-webhooks/deliveries/:deliveryId/retry` — Trigger manual redelivery attempt (Requires `webhooks:manage`).
- `POST /api/v1/outbound-webhooks/:id/test` — Send a test ping event (Requires `webhooks:manage`).

### Custom Integrations
- `GET /api/v1/custom-integrations` — List custom integrations in workspace (Requires `integrations:read`).
- `POST /api/v1/custom-integrations` — Create a declarative HTTP connector (Requires `integrations:manage`).
- `GET /api/v1/custom-integrations/:id` — Retrieve connector draft and version history (Requires `integrations:read`).
- `PUT /api/v1/custom-integrations/:id` — Update draft action definitions (Requires `integrations:manage`).
- `POST /api/v1/custom-integrations/:id/publish` — Publish draft into immutable version (Requires `integrations:manage`).
- `POST /api/v1/custom-integrations/:id/test` — Run test execution in sandbox with SSRF protection (Requires `integrations:manage`).
