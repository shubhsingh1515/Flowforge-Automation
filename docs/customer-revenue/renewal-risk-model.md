# FlowForge Deterministic Renewal Risk Model

## 1. Principles & Deterministic Guarantee

FlowForge Automation prohibits opaque statistical churn predictions or unverified black-box outputs. The Renewal Risk Model is:
1. **100% Deterministic**: Given the exact same customer signals and inputs snapshot, the evaluator always produces the exact same score and classification.
2. **Explainable**: Every risk level has a detailed natural language explanation and an array of contributing signals with point impacts.
3. **Graceful Insufficiency Handling**: If customer usage telemetry, health metrics, and engagement data are absent, the model returns `INSUFFICIENT_DATA` rather than a false low or false high risk score.

## 2. Contributing Signals & Weight Breakdown

The maximum risk score is 100 points. Points accumulate additively:

| Signal Name | Trigger Condition | Maximum Impact | Description |
| :--- | :--- | :--- | :--- |
| `LOW_HEALTH_SCORE` | Account Health Score < 50 | Up to +40 pts | Scaled proportionally: `((50 - score) / 50) * 40`. Heavy penalty for degraded platform health. |
| `HEALTH_STATUS_CRITICAL` | Account Health Status is `AT_RISK` | +30 pts | Direct flag when health model flags account as at risk. |
| `RECENT_CRITICAL_INCIDENTS` | Open/resolved Sev-1 incidents in lookback | +25 pts | 10 pts per incident up to 25 pts. |
| `LOW_PLATFORM_ADOPTION` | Account active workflows < 1 | +20 pts | Zero or near-zero active workflow executions in the past 30 days. |
| `RENEWAL_WINDOW_COMPRESSION` | Renewal < 60 days but stage is `UPCOMING`/`PREPARATION` | +20 pts | Failure to engage customer early as contract expiration approaches. |
| `OVERDUE_SUCCESS_TASKS` | Overdue retention/success tasks exist | +15 pts | Unresolved operational blockers flagged by customer success team. |

## 3. Score to Level Mapping

The cumulative score (clamped between 0 and 100) maps directly to versioned policy thresholds:

- **CRITICAL** (Score $\ge 80$): Immediate churn risk. Generates an URGENT customer retention intervention task and flags account in red across the executive dashboard.
- **HIGH** (Score $\ge 60$): Elevated renewal vulnerability. Generates a HIGH priority retention task.
- **MODERATE** (Score $\ge 30$): Noticeable adoption or ticket degradation; requires monitoring in weekly pipeline reviews.
- **LOW** (Score $< 30$): Healthy commercial engagement, high product utilization, and active milestone progression.
- **INSUFFICIENT_DATA**: Assigned if account has no active health evaluation history or telemetry inputs.

## 4. Retention Task Generation Rules

When risk evaluates to `HIGH` or `CRITICAL`, the system automatically invokes `CustomerSuccessTask.create()` with:
- Task Type: `RENEWAL_CHECK`
- Due Date: Set to either 14 days or contract notice deadline
- Task Priority: `URGENT` for CRITICAL risk, `HIGH` for HIGH risk
- Evidence: JSON object containing all contributing signals and input snapshot
- Idempotency Key: Deduped per opportunity and evaluation date to avoid duplicate tasks.
