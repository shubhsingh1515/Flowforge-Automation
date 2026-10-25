# FlowForge Governed Expansion Opportunities

## 1. Overview & Detection

Expansion opportunities capture incremental revenue potential across 5 core categories:
1. `ADDITIONAL_CAPACITY`: Workflows, executions, compute runtime, or API quotas approaching thresholds.
2. `HIGHER_TIER`: Upgrading from STANDARD or GROWTH to ENTERPRISE.
3. `ADDITIONAL_PRODUCT`: Adopting Data Products (Phase 23), AI Intelligence (Phase 24), or Event Fabric (Phase 22).
4. `NEW_BUSINESS_UNIT`: Onboarding auxiliary departments or subsidiary workspaces.
5. `CONTRACT_SCOPE_EXPANSION`: Broadening enterprise license scope or multi-region commitments.

---

## 2. Mandatory Human Qualification Gate

To maintain trust and data integrity, automated detection mechanisms cannot directly instantiate qualified pipeline value:

```
[ Automated Monitor / Telemetry ]
                │
                ▼
      ┌──────────────────┐
      │     DETECTED     │
      └─────────┬────────┘
                │
                │ Human Review Checkpoint
                │ (CSM / Commercial Account Exec)
                ▼
      ┌──────────────────┐
      │    QUALIFIED     │  ◄── (Or DISMISSED)
      └─────────┬────────┘
                │
                ▼
      ┌───────────────────────┐
      │  PROPOSAL_IN_PROGRESS │
      └─────────┬─────────────┘
                │
         ┌──────┴──────┐
         ▼             ▼
      ┌─────┐       ┌──────┐
      │ WON │       │ LOST │
      └─────┘       └──────┘
```

- When telemetry flags potential expansion, it enters `DETECTED` stage.
- Transitioning to `QUALIFIED` requires authorized user interaction via `POST /customer-expansion/:id/qualify`.
- Transition records capture actor identity, timestamp, and qualification rationale in `CustomerExpansionStageHistory`.
