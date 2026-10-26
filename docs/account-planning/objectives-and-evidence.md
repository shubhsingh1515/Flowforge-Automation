# Customer Business Objectives, Quantified Targets & Evidence Ledger

## Overview

A common antipattern in customer success is tracking vague intentions (e.g., "customer wants faster pipelines") without verifiable targets or evidentiary proof.

Phase 27 introduces **Quantified Customer Objectives** (`CustomerSuccessObjective`), **Operational Blockers** (`CustomerObjectiveBlocker`), and an immutable **Verified Evidence Ledger** (`CustomerObjectiveEvidence`).

---

## 1. Objective Anatomy & Target Tracking

Each objective establishes clear targets:
- `title`: e.g. "Automate 80% of Order Intake Processing"
- `category`: `TIME_SAVINGS`, `COST_REDUCTION`, `REVENUE_GROWTH`, `ERROR_RATE_REDUCTION`, `COMPLIANCE_ASSURANCE`, `SCALING_CAPACITY`
- `status`: `DRAFT`, `IN_PROGRESS`, `BLOCKED`, `ACHIEVED`, `ABANDONED`
- `baselineValue`: Quantitative starting point (e.g., `12.5` hours manual intake per day).
- `targetValue`: Quantitative goal (e.g., `1.0` hour manual intake per day).
- `currentValue`: Current progress (e.g., `3.2` hours manual intake per day).
- `targetDate`: Target completion deadline.

---

## 2. Operational Blockers

Objectives can be flagged as blocked with explicit blocker severity:
- `severity`: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- `impact`: Specific technical or organizational impediment preventing target realization.
- `resolutionOwnerUserId`: Assigned team member accountable for resolution.
- `resolvedAt`: Unblocks the objective once verified.

Accounts with unresolved `CRITICAL` or `HIGH` blockers are escalated automatically in the **Deterministic Portfolio Prioritization Evaluation**.

---

## 3. Verified Evidence Ledger

To eliminate guesswork during Executive Business Reviews and contract renewal negotiations, objectives support verified evidence entries:
- `evidenceType`: `TELEMETRY_DATA`, `EXECUTION_METRIC`, `AUDIT_LOG`, `STAKEHOLDER_ATTESTATION`, `CONTRACTUAL_BENCHMARK`
- `summary`: Context and narrative of observed achievement.
- `metricValue`: Observed quantitative measurement.
- `verifiedByUserId`: FlowForge or customer authorized verifier.
- `verifiedAt`: Timestamp of validation.
- `metadata`: JSON payload containing workflow execution IDs, dashboard URLs, or telemetry batch references.
