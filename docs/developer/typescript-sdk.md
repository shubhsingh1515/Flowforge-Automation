# FlowForge TypeScript SDK (`@flowforge/sdk`)

Official typed client library for integrating with the FlowForge Automation SaaS platform.

## Overview

The FlowForge SDK provides programmatic control over workflows, executions, templates, and operational health. It includes built-in rate-limit handling, automatic retries, idempotency key injection, distributed tracing headers (`traceparent`), request timeouts, and a typed error hierarchy.

---

## Installation

```bash
# Using npm
npm install @flowforge/sdk

# Using yarn
yarn add @flowforge/sdk

# Using pnpm
pnpm add @flowforge/sdk
```

---

## Quickstart

```typescript
import { FlowForgeClient } from "@flowforge/sdk";

// Initialize client
const client = new FlowForgeClient({
  apiKey: process.env.FLOWFORGE_API_KEY!,
  baseUrl: process.env.FLOWFORGE_API_URL || "https://api.flowforge.local/api/v1",
  timeoutMs: 15000,
});

async function main() {
  // 1. Verify API connectivity
  const health = await client.health();
  console.log("FlowForge API Status:", health.status);

  // 2. List published workflows
  const workflows = await client.workflows.list({ limit: 10 });
  console.log(`Found ${workflows.data.length} workflows`);

  // 3. Trigger a workflow execution with payload and idempotency key
  if (workflows.data.length > 0) {
    const execution = await client.workflows.trigger(
      workflows.data[0].id,
      { orderId: "ORD-9481", amount: 249.99, customer: "acme@example.com" },
      { idempotencyKey: "evt_ord_9481_sync" }
    );
    console.log("Triggered execution:", execution.id, "Status:", execution.status);

    // 4. Poll execution status
    const result = await client.executions.get(execution.id);
    console.log("Execution result:", result.status, "Duration:", result.durationMs, "ms");
  }
}

main().catch(console.error);
```

---

## Client Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | *(Required)* | FlowForge API Key (e.g. `ffa_live_...` or workspace secret) |
| `baseUrl` | `string` | `http://localhost:4000/api/v1` | Root URL of the FlowForge REST API |
| `timeoutMs` | `number` | `30000` | HTTP request timeout in milliseconds |
| `traceparent` | `string` | *(Optional)* | W3C distributed traceparent header for distributed tracing |
| `customHeaders` | `Record<string, string>` | `{}` | Additional headers merged into outbound HTTP requests |

---

## Resource Modules

### 1. Workflows (`client.workflows`)

- `client.workflows.list(params?: { page?: number; limit?: number; search?: string; status?: string })`: Lists workspace workflows with pagination.
- `client.workflows.get(workflowId: string)`: Retrieves workflow details, node topology, and configurations.
- `client.workflows.create(data: { name: string; description?: string; nodes: any[]; edges: any[] })`: Creates a new workflow draft.
- `client.workflows.update(workflowId: string, data: Partial<Workflow>)`: Updates workflow metadata or graph definition.
- `client.workflows.trigger(workflowId: string, payload?: Record<string, any>, options?: { idempotencyKey?: string })`: Asynchronously executes a workflow.
- `client.workflows.delete(workflowId: string)`: Soft-deletes a workflow.

### 2. Executions (`client.executions`)

- `client.executions.list(params?: { workflowId?: string; status?: string; page?: number; limit?: number })`: Queries execution runs with tenant-isolated filtering.
- `client.executions.get(executionId: string)`: Fetches complete execution telemetry, node step statuses, logs, and outputs.
- `client.executions.cancel(executionId: string)`: Gracefully stops an in-flight execution.
- `client.executions.retry(executionId: string)`: Re-queues a failed execution with original triggers and payloads.

### 3. Templates (`client.templates`)

- `client.templates.list(params?: { category?: string; search?: string })`: Browses verified pre-built workflow templates.
- `client.templates.get(templateId: string)`: Retrieves template manifest and node graph.
- `client.templates.instantiate(templateId: string, options?: { name?: string })`: Clones a template directly into the workspace.

### 4. Health (`client.health`)

- `client.health()`: Returns API server status, latency, and system timestamp.

---

## Typed Error Hierarchy

All client errors inherit from `FlowForgeError` and include the HTTP status code, request path, and error code.

| Error Class | Status Code | Description |
|---|---|---|
| `AuthenticationError` | 401 | Invalid, expired, or missing API key |
| `ForbiddenError` | 403 | Insufficient role or workspace permission |
| `NotFoundError` | 404 | Target workflow, execution, or template does not exist |
| `ValidationError` | 400 | Payload or parameter schema validation failure |
| `RateLimitError` | 429 | Exceeded tenant rate limits; inspect `error.retryAfter` |
| `TimeoutError` | 408 | Request exceeded `timeoutMs` threshold |
| `FlowForgeError` | 500+ | Unhandled server error or network connection drop |

### Error Handling Example

```typescript
import {
  FlowForgeClient,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
} from "@flowforge/sdk";

try {
  await client.workflows.trigger("non-existent-id");
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error("Workflow not found:", error.message);
  } else if (error instanceof RateLimitError) {
    console.warn(`Rate limit reached. Retry in ${error.retryAfter}s`);
  } else if (error instanceof AuthenticationError) {
    console.error("Invalid API credentials:", error.message);
  } else {
    console.error("SDK Error:", error);
  }
}
```
