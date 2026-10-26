# Deterministic Portfolio Prioritization & Risk Evaluation

## Overview

Rather than relying on qualitative instincts or opaque AI models, Phase 27 implements a **Deterministic Portfolio Prioritization Evaluation** algorithm in `customerPortfolioService.ts`.

Every strategic account is scored on an explainable scale from `0` to `100` and categorized into an actionable attention tier:
- `CRITICAL` (Score >= 75)
- `HIGH` (Score >= 50)
- `MEDIUM` (Score >= 25)
- `LOW` (Score < 25)

---

## 1. Multi-Factor Scoring Methodology

The score is calculated additively from verifiable operational signals:

| Factor | Condition | Points Contribution | Rationale |
|---|---|---|---|
| **Health Evaluation** | Status `AT_RISK` | +35 pts | Customer is at imminent risk of failure or dissatisfaction |
| | Status `NEEDS_ATTENTION` | +20 pts | Degrading health signals require proactive outreach |
| **Renewal Proximity** | Contract expiring in < 60 days | +25 pts | Urgent commercial window |
| | Contract expiring in 60-120 days | +15 pts | Proactive renewal preparation window |
| **Operational Blockers** | Has unresolved `CRITICAL` blocker | +25 pts | High-severity technical roadblock stopping value realization |
| | Has unresolved `HIGH` blocker | +15 pts | Significant operational hurdle |
| **Single-Thread Risk** | <= 1 engaged executive/champion | +20 pts | Vulnerable to sudden churn upon contact departure |
| **EBR Cadence** | Next EBR overdue by > 14 days | +15 pts | Missed executive alignment cadence |
| **Revenue Scale** | Strategic Tier 1 / ARR >= $100k | +10 pts | High-impact revenue exposure |

*Total score is bounded at 100.*

---

## 2. Explainability & Recommended Actions

The evaluation produces:
1. `score`: Integer between 0 and 100.
2. `attentionLevel`: Categorical severity level.
3. `contributingFactors`: Array of human-readable rationale strings (e.g. `["Single-thread risk: only 1 key stakeholder mapped", "Unresolved CRITICAL objective blocker: SSO SAML certificate expired", "Next EBR is 18 days overdue"]`).
4. `recommendedAction`: Prescriptive immediate step for the account team (e.g., "Schedule emergency stakeholder multi-threading session and clear SSO blocker").
