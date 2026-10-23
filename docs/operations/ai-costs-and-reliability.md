# FlowForge Automation — Operations, AI Cost Governance & Reliability

## 1. Cost Containment & Quota Governance

To ensure SaaS gross margin stability and prevent unexpected LLM vendor overages, FlowForge implements multi-tiered cost boundaries:

### Tier Entitlement Quotas

| Plan Tier | Monthly Included AI Runs | Overage Policy | Burst Rate Limit |
| :--- | :--- | :--- | :--- |
| **FREE** | 20 requests / month | Hard cap. Must upgrade to PRO. | 10 requests / min |
| **PRO** | 250 requests / month | Hard cap or optional add-on pack. | 60 requests / min |
| **BUSINESS** | 2,500 requests / month | Soft cap with enterprise overage billing. | 120 requests / min |

Usage is tracked atomically via `UsageRecord` rows (`metric: "AI_REQUEST"`) and audited per request by `EntitlementService.canExecuteAiRequest(workspaceId)`.

---

## 2. Token Budgeting & Model Compaction

1. **System Prompt Minification**: Node registry capabilities are compacted into structured, schema-oriented representations without redundant commentary, keeping baseline prompt overhead under ~1,200 tokens.
2. **Context Window Protection**: Large execution traces (>50 steps) are summarized to include only:
   - Initial trigger payload schema (with values redacted).
   - The immediate 3 steps preceding failure.
   - The exact failure step and standard error output.
3. **Max Completion Tokens**: Capped strictly per intent:
   - Generation / Refinement: Max 2,500 tokens.
   - Debugging / Optimization: Max 1,500 tokens.
   - Test Generation: Max 1,200 tokens.

---

## 3. Reliability & Graceful Degradation

### Egress Circuit Breaking & Timeouts

External provider calls enforce:
- **Client Timeout**: 30 seconds (`AI_TIMEOUT_MS`). Slow model responses abort cleanly to release API server worker threads.
- **Circuit Breaker**: If external provider errors exceed 20% over 5 minutes, requests fall back to simulated deterministic responses (`isSimulated: true`) or return HTTP 503 with standard retry headers (`Retry-After: 60`).
- **Feature Flagging**: Setting `AI_ENABLED=false` disables all AI endpoints instantly without requiring service redeployment or disrupting core workflow execution engine capabilities.
