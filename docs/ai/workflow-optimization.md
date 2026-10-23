# FlowForge Automation — Workflow Optimization & Performance Intelligence

## 1. Evidence-Based Optimization

Unlike generic prompt-based LLM recommendations, FlowForge's Workflow Optimization engine (`POST /api/v1/ai/optimize-workflow/:workflowId`) correlates actual execution telemetry over a rolling time window (7 to 30 days) before proposing changes.

Optimization analysis ingests:
1. **Aggregated Execution Statistics**:
   - P50, P95, and P99 execution latencies.
   - Per-node execution time distributions.
   - Aggregate failure rates and error classification frequencies.
2. **Topological Graph Patterns**:
   - Unbounded sequential loops writing single records.
   - External HTTP calls missing exponential backoff retry policies.
   - Unfiltered payloads passing through memory-intensive transformation nodes.
   - Redundant API roundtrips across identical endpoints.

---

## 2. Optimization Report Schema (`AiOptimizationReport`)

```typescript
export interface AiOptimizationRecommendation {
  id: string;
  type: "REPEATED_FAILURES" | "HIGH_LATENCY" | "MISSING_RETRY" | "PAYLOAD_OPTIMIZATION" | "BATCHING_OPPORTUNITY";
  title: string;
  targetNodeId?: string;
  targetNodeLabel?: string;
  evidence: string;
  analyzedPeriod: string;
  estimatedImpact: string;
  riskAssessment: string;
  suggestedFix: string;
  suggestedPatch?: {
    nodeId: string;
    configKey: string;
    proposedValue: any;
  };
}

export interface AiOptimizationReport {
  workflowId: string;
  workflowName: string;
  analyzedExecutionsCount: number;
  recommendations: AiOptimizationRecommendation[];
  provider: string;
  isSimulated: boolean;
}
```

---

## 3. High-Value Optimization Patterns

1. **Transient 503 Gateway Errors (`MISSING_RETRY`)**:
   - *Evidence*: 12% of executions in the past 14 days failed on transient 503 gateway errors that succeeded on manual retry.
   - *Estimated Impact*: Reduces transient failure rate by ~80%.
   - *Action*: Suggests configuring `retryCount: 3` with `backoffFactor: 2` in node settings.
2. **Loop Iteration Throttling (`BATCHING_OPPORTUNITY`)**:
   - *Evidence*: Workflow writes 1 row per API call inside an item loop, hitting SaaS rate limits.
   - *Estimated Impact*: Decreases execution duration from 4.2s to 0.8s.
   - *Action*: Replaces per-item iteration with bulk batch operation (`batchAppendRows`).
3. **Early Exit Filtering (`HIGH_LATENCY`)**:
   - *Evidence*: Heavy data transformation executed for every webhook payload, including invalid submissions later dropped at step 4.
   - *Estimated Impact*: Frees worker execution slots and eliminates unnecessary CPU compute.
   - *Action*: Hoists filter condition to step 2 immediately after the trigger.
