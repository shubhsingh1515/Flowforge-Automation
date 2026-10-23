# FlowForge Operations — Tenant Workload Isolation
## Fair Scheduling, Concurrency Enforcement, and Noisy Neighbor Protection

### 1. Workload Fairness Objectives
Multi-tenant platforms must protect well-behaved tenants from noisy neighbors that burst hundreds of triggers simultaneously.

---

### 2. Multi-Worker Concurrency Limits
Concurrency limits are enforced authoritatively across all worker instances:
- **Free Tier**: 3 concurrent executions.
- **Pro Tier**: 15 concurrent executions.
- **Business Tier**: 50 concurrent executions.
- **Custom Workspace Override**: Workspaces can have a custom `maxConcurrentExecutions` field in the database.

**Enforcement Invariant**:
- Concurrency count is checked in PostgreSQL across all worker nodes before executing initial steps:
```typescript
const currentActive = await prisma.workflowExecution.count({
  where: {
    status: ExecutionStatus.RUNNING,
    workflow: { workspaceId },
  },
});
```
- Resuming executions from checkpoints (`lastCheckpointNodeId`, `resumeNodeId`, `recoveryAttempts > 0`) bypasses new concurrency allocation to avoid starvation during recovery.

---

### 3. Noisy Neighbor Diagnostics & Alerts
The Operations service aggregates running executions by workspace:
- Identifies workspaces exceeding 80% of their concurrency limit.
- Flags noisy neighbors in `/operations` without leaking sensitive payloads, credentials, or workflow names to non-admin actors.
- Triggers operational alerts if a tenant persistently exhausts shared worker pools.
