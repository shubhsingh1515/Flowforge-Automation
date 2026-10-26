# Stakeholder Mapping & Single-Thread Risk Governance

## Overview

Enterprise accounts with high Annual Recurring Revenue (ARR) frequently suffer sudden churn due to **Single-Thread Risk** — relying on a single champion or contact who subsequently leaves the organization.

Phase 27 introduces multi-stakeholder influence mapping (`CustomerStakeholderRelationship`) linked to Phase 25 contacts (`CustomerContact`) and historical role progression (`CustomerStakeholderRoleHistory`).

---

## 1. Stakeholder Classification & Influence

Each stakeholder relationship records:
- `contactId`: Reference to Phase 25 `CustomerContact`.
- `role`: `CHAMPION`, `ECONOMIC_BUYER`, `DECISION_MAKER`, `EXECUTIVE_SPONSOR`, `TECHNICAL_LEAD`, `INFLUENCER`, `DETRACTOR`, `USER_ADVOCATE`
- `sentiment`: `POSITIVE`, `NEUTRAL`, `NEGATIVE`, `UNKNOWN`
- `engagementLevel`: `HIGH`, `MEDIUM`, `LOW`, `DISENGAGED`
- `influenceScore`: Numeric scale (1–5).
- `lastEngagedAt`: Timestamp of latest verified interaction.

---

## 2. Single-Thread Risk Calculation

An account is flagged as having **Single-Thread Risk** if:
1. The total number of engaged stakeholders with role `CHAMPION`, `ECONOMIC_BUYER`, `DECISION_MAKER`, or `EXECUTIVE_SPONSOR` is **less than or equal to 1**.
2. Or the account lacks any identified `CHAMPION` or `DECISION_MAKER`.
3. Or the only identified champion has an engagement level of `DISENGAGED` or sentiment `NEGATIVE`.

Accounts with Single-Thread Risk receive an immediate priority score penalty in the Portfolio Prioritization queue, alerting leadership to initiate executive multi-threading.

---

## 3. Role History & Succession Ledger

When a stakeholder changes roles or sentiment:
- A new `CustomerStakeholderRoleHistory` record is created recording `previousRole`, `newRole`, `previousSentiment`, `newSentiment`, `changedByUserId`, and reason.
- If a key champion leaves the customer company or changes roles, the history ledger preserves the audit trail and alerts the account team to qualify a successor champion immediately.
