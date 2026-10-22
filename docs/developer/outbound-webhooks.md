# FlowForge Outbound Webhooks Reference

Outbound Webhooks allow external systems, serverless functions, microservices, and third-party dashboards to receive real-time HTTP POST notifications whenever events take place within FlowForge Automation.

---

## 1. Supported Platform Event Types

| Event Identifier | Description | Emitted When |
|---|---|---|
| `workflow.created` | New workflow created in workspace. | User or API creates a new workflow definition. |
| `workflow.updated` | Workflow metadata or nodes changed. | Canvas graph modified, name updated, or settings saved. |
| `workflow.activated` | Workflow triggers enabled. | Workflow transitions from DRAFT/PAUSED to ACTIVE. |
| `workflow.deactivated` | Workflow paused. | Active workflow paused. |
| `execution.started` | Workflow run enqueued/initiated. | Webhook trigger receives payload or scheduled trigger ticks. |
| `execution.succeeded` | Execution successfully completed. | All nodes in the graph succeed without unhandled errors. |
| `execution.failed` | Execution aborted or failed. | A node throws an unhandled exception or retry limit is exhausted. |
| `execution.cancelled` | Execution manually stopped. | User or API invokes execution cancellation. |
| `approval.requested` | Human-in-the-loop approval paused. | Execution reaches an Approval node waiting for manual decision. |
| `approval.decided` | Human decision submitted. | Approver submits APPROVE or REJECT action. |

---

## 2. Standard Webhook Payload Schema

Every outbound webhook delivery includes a structured JSON payload:

```json
{
  "id": "del_01j7xyz89...",
  "event": "execution.succeeded",
  "eventId": "evt_1792695928808_4a89fb",
  "workspaceId": "ws_d6ff031a-fa2e-44c1...",
  "timestamp": "2026-10-23T00:30:00.000Z",
  "attempt": 1,
  "data": {
    "executionId": "exec_20418923-ad11...",
    "workflowId": "wf_2f9eb88f-ccf0...",
    "correlationId": "corr_1792696277982_k32w4",
    "durationMs": 182,
    "trigger": "webhook"
  }
}
```

---

## 3. Reliability & Retry Architecture

- **Worker Architecture**: Deliveries are processed asynchronously via BullMQ on the `outbound-webhooks` Redis queue, decoupled from request execution loops.
- **Bounded Retries**: If the receiving endpoint returns non-2xx (or connection times out), FlowForge automatically retries up to 3 times with exponential backoff (10s, 30s, 60s).
- **Timeouts**: Every delivery attempt has a strict 5,000ms HTTP timeout.
- **Payload Safety**: Response bodies from destinations are truncated to 1,024 bytes in the `WebhookDelivery` log to prevent DB bloat.
- **Manual Redelivery**: Any delivery attempt can be re-triggered on demand via `POST /api/v1/outbound-webhooks/deliveries/:deliveryId/retry`.
