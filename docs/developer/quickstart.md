# FlowForge Developer Platform: Quickstart Guide

This guide shows you how to programmatically authenticate, discover workflows, trigger executions, and inspect telemetry using both raw `curl` commands and the official `@flowforge/sdk` TypeScript client.

---

## 1. Prerequisites

1. An active FlowForge account (`http://localhost:3000` or production domain).
2. A valid FlowForge API Key created in **Settings > API Keys** (e.g. `ffa_live_...`).
3. Node.js 18+ (if using the TypeScript SDK).

---

## 2. Fast Track: Using cURL

### Step A: Health Check
```bash
curl -X GET "http://localhost:4000/api/v1/health" \
  -H "Accept: application/json"
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-10-23T03:30:00.000Z"
}
```

### Step B: List Workflows
```bash
curl -X GET "http://localhost:4000/api/v1/workflows?limit=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

### Step C: Trigger an Execution with Idempotency Key
```bash
curl -X POST "http://localhost:4000/api/v1/workflows/WORKFLOW_ID/trigger" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: req_order_sync_001" \
  -d '{
    "orderId": "ORD-1082",
    "customer": "jane@acmecorp.com",
    "amount": 149.50
  }'
```

**Response:**
```json
{
  "executionId": "clx4...918",
  "workflowId": "WORKFLOW_ID",
  "status": "QUEUED",
  "enqueuedAt": "2026-10-23T03:30:15.000Z"
}
```

### Step D: Poll Execution Telemetry
```bash
curl -X GET "http://localhost:4000/api/v1/executions/clx4...918" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

---

## 3. Fast Track: Using the TypeScript SDK

### Step A: Install the SDK
```bash
npm install @flowforge/sdk
```

### Step B: Complete End-to-End Workflow Script
Save this as `quickstart.ts`:

```typescript
import { FlowForgeClient, RateLimitError } from "@flowforge/sdk";

const client = new FlowForgeClient({
  apiKey: process.env.FLOWFORGE_API_KEY || "ffa_live_your_key_here",
  baseUrl: process.env.FLOWFORGE_API_URL || "http://localhost:4000/api/v1",
  timeoutMs: 15000,
});

async function run() {
  console.log("Checking FlowForge API health...");
  const health = await client.health();
  console.log("Status:", health.status);

  console.log("Listing published workflows...");
  const workflows = await client.workflows.list({ limit: 5 });
  console.log(`Found ${workflows.data.length} workflows.`);

  if (workflows.data.length === 0) {
    console.log("No workflows found. Create one in the web UI first!");
    return;
  }

  const targetWorkflow = workflows.data[0];
  console.log(`Triggering workflow "${targetWorkflow.name}" (${targetWorkflow.id})...`);

  try {
    const triggerResult = await client.workflows.trigger(
      targetWorkflow.id,
      {
        source: "developer-quickstart",
        eventTimestamp: new Date().toISOString(),
        payload: { sampleField: "Hello FlowForge" }
      },
      { idempotencyKey: `quickstart_run_${Date.now()}` }
    );

    console.log("Execution queued successfully! ID:", triggerResult.id);

    // Poll for status
    console.log("Polling execution status...");
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 1000));
      const execution = await client.executions.get(triggerResult.id);
      console.log(`[Attempt ${attempts + 1}] Status: ${execution.status}`);

      if (execution.status === "SUCCESS" || execution.status === "FAILED") {
        console.log("Final execution status:", execution.status);
        console.log("Duration:", execution.durationMs, "ms");
        console.log("Logs count:", execution.logs?.length || 0);
        break;
      }
      attempts++;
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.warn(`Rate limit exceeded! Retry after ${error.retryAfter} seconds.`);
    } else {
      console.error("Execution error:", error);
    }
  }
}

run();
```

---

## 4. Webhook Ingestion

FlowForge workflows can also be invoked directly via inbound webhook URLs configured in the visual canvas. Webhooks support HMAC-SHA256 signature verification via the `X-FlowForge-Signature` header.
