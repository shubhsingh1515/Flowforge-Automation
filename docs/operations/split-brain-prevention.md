# FlowForge Operations — Split-Brain Prevention
## Dual-Region Isolation, Fencing Tokens, and Failover Epochs

### 1. The Split-Brain Problem
If Region A suffers a transient network partition and operators promote Region B, both regions might attempt to process jobs or write to execution records simultaneously if workers in Region A do not stop.

---

### 2. Dual-Layer Fencing Solution

#### Layer 1: Monotonic Worker Lease Fencing (`leaseToken`)
Within any region or cluster, each execution carries a monotonic `leaseToken`.
- When an execution is re-leased by another worker, `leaseToken` increments.
- On every step checkpoint write, the runner verifies:
```typescript
const leaseAcquisition = await prisma.workflowExecution.updateMany({
  where: { id, leaseToken: currentLeaseToken },
  data: { lastCheckpointNodeId: stepId },
});
if (leaseAcquisition.count === 0) {
  // Stale worker detected, immediately abort
  throw new Error("Worker lease token outdated. Fencing active.");
}
```

#### Layer 2: Regional Failover Epoch Fencing (`failoverEpoch`)
During regional failover, `failoverEpoch` is incremented in PostgreSQL.
- Each execution is stamped with the `failoverEpoch` at initiation.
- Before running any node or committing checkpoints, the execution runner compares:
```typescript
if (initialExecution.failoverEpoch > 0 && workspace.failoverEpoch > initialExecution.failoverEpoch) {
  // Region has been evacuated; this worker's execution belongs to a stale epoch
  throw new Error("Regional Failover Fence: Execution epoch is superseded.");
}
```
Any stale worker from the evacuated region attempting to commit writes is rejected, preventing cross-region state corruption.
