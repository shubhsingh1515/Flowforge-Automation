# Advanced Execution Diagnostics & Actionable Failure Analysis

## 1. Overview
FlowForge Phase 10 introduces deep structured observability for workflow runs. Rather than unformatted stack dumps or raw errors, every workflow execution captures structured lifecycle milestones, sanitized step outputs, distributed trace IDs, and actionable root-cause remediation summaries.

---

## 2. Structured Lifecycle Milestones
Executions record an ordered array of milestones in `WorkflowExecution.timeline`:
```json
[
  { "stage": "QUEUED", "timestamp": "2026-10-23T02:00:00.000Z" },
  { "stage": "STARTED", "timestamp": "2026-10-23T02:00:00.120Z", "durationMs": 120 },
  { "stage": "NODE_STARTED", "nodeId": "node-1", "nodeName": "Webhook", "timestamp": "2026-10-23T02:00:00.125Z" },
  { "stage": "NODE_COMPLETED", "nodeId": "node-1", "nodeName": "Webhook", "timestamp": "2026-10-23T02:00:00.150Z", "durationMs": 25 },
  { "stage": "FINISHED", "timestamp": "2026-10-23T02:00:00.350Z", "durationMs": 230 }
]
```

Lifecycle stages tracked:
- `QUEUED`: Enqueued in BullMQ Redis queue.
- `STARTED`: Picked up by background worker process.
- `NODE_STARTED` & `NODE_COMPLETED`: Node-level boundary timestamps and latencies.
- `PAUSED_APPROVAL`: Execution paused waiting for human review.
- `RESUMED`: Resumed post-approval.
- `FINISHED`: Terminal completion (SUCCESS, FAILED, or CANCELLED).

---

## 3. Actionable Root-Cause Failure Summaries
When a workflow fails, FlowForge analyzes the step outputs and synthesizes an actionable failure summary in `WorkflowExecution.diagnostics.failure`:
- **failedNodeId** & **failedNodeName**: Specific canvas node where failure originated.
- **category**: Normalized classification (`TIMEOUT`, `HTTP_ERROR`, `AUTH_ERROR`, `RATE_LIMIT`, `CONCURRENCY_LIMIT`, `EXPRESSION_ERROR`).
- **message**: Concise root cause description without internal system clutter.
- **actionableTip**: Context-aware guidance, such as:
  - *HTTP 401*: "Check connection credentials and OAuth token refresh status."
  - *HTTP 429*: "Third-party service rate limit reached. Enable retry logic or back off execution schedule."
  - *WORKER_TIMEOUT*: "Worker process was terminated unexpectedly. Check worker memory limits or retry the run."

---

## 4. Sensitive Secret Redaction
Before diagnostic data, step outputs, or download bundles are written to the database or returned over the API, recursive scrubbing is applied:
- Keys matching `/password|secret|token|authorization|api[_-]?key|bearer|private[_-]?key/i` are automatically replaced with `[REDACTED]`.
- Bearer token substrings and JWT header/payload structures in string values are scrubbed.

---

## 5. Downloadable Diagnostics Bundles
Operators and developers can export an end-to-end diagnostics bundle:
- **API Endpoint**: `GET /api/v1/diagnostics/:executionId/download`
- **Output**: JSON file containing:
  - Workflow metadata and version
  - Environment summary (Node version, runner runtime)
  - W3C Distributed Traceparent
  - Lifecycle milestone timeline
  - Sanitized step execution logs
  - Root-cause failure analysis
