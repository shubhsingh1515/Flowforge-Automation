# FlowForge Automation SaaS — Reliable Usage Metering & Quota Enforcement

## 1. Billable Metrics
FlowForge defines two distinct, transparent billing units:
1. **`WORKFLOW_EXECUTION` (Primary Quota Metric)**: Count of workflow execution runs. Triggered via manual test run, incoming webhook ingestion, or scheduled trigger.
2. **`STEP_EXECUTION` (Task Audit Metric)**: Total number of discrete node handlers executed across workflows.

---

## 2. Deduplication & Idempotency Guarantee
A major risk in distributed workflow engines is double-counting usage due to:
- BullMQ worker retry attempts
- Webhook redelivery
- Human approval pause/resumption
- Network socket timeouts

FlowForge enforces strict deduplication at the database level:
- Every usage record is written to `usage_records` with a unique constraint on `idempotencyKey`:
  ```
  idempotencyKey = "usage_" + executionId + "_" + metricType
  ```
- Uses PostgreSQL atomic `upsert`:
  ```ts
  await prisma.usageRecord.upsert({
    where: { idempotencyKey: `usage_${executionId}_${metricType}` },
    update: {}, // No-op if already billed
    create: { workspaceId, executionId, metricType, quantity: 1, idempotencyKey },
  });
  ```
- When a worker retries attempt 2 or resumes from a human approval checkpoint, the idempotency key hits the existing row, guaranteeing that a single execution run is billed exactly once.

---

## 3. Admission Control & Quota Rejection
Before a workflow execution is queued or admitted for execution, `entitlementService.canExecuteWorkflow(workspaceId)` evaluates current billing cycle usage:
- If `currentUsage >= plan.maxExecutionsPerMonth`:
  - Execution is rejected with `402 Payment Required` or failed with structured error: `errorCategory: "RESOURCE_LIMIT_EXCEEDED"`.
  - The workflow remains in a safe terminal state without half-running external API side-effects.
