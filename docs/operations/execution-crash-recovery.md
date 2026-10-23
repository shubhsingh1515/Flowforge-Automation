# Execution Crash Recovery & Checkpoint Resumption

## 1. Durable Checkpointing Architecture

FlowForge implements granular step-level execution checkpoints:
- **`WorkflowStepExecution` Table**: Each executed node durably persists its input data, output data, execution duration, and status upon completion.
- **`lastCheckpointNodeId` Pointer**: `WorkflowExecution` tracks the most recent successfully completed node ID.

---

## 2. Crash Resumption Workflow

When a worker crashes midway through a workflow execution:
1. **Heartbeat Expiration**: The worker fails to renew its 30-second lease (`leaseExpiresAt`).
2. **Reconciliation Detection**: `reconciliationService` identifies the execution as stalled with an expired lease.
3. **Resumption Dispatch**:
   - If `recoveryAttempts < 2`, the execution is reset to `PENDING` with an incremented `recoveryAttempts` counter.
   - The job is re-enqueued to BullMQ with `resumeNodeId = lastCheckpointNodeId`.
4. **Graph Skipping**:
   - The new worker loads all prior successful steps from `WorkflowStepExecution`.
   - Any previously completed nodes have their outputs restored directly into `context.steps[nodeId]`.
   - The node handlers for completed steps are **not** re-executed, eliminating redundant API calls or third-party side effects.
   - Downstream unexecuted nodes resume seamlessly until completion.
5. **RPO Guarantee**: Recovery Point Objective is **0 completed steps**.
