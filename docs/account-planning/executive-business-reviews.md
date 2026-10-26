# Executive Business Reviews (EBR / QBR) & Commitments

## Overview

Executive Business Reviews (EBRs) or Quarterly Business Reviews (QBRs) are pivotal milestones for maintaining executive alignment, verifying business outcomes, and driving proactive retention and expansion.

Phase 27 provides a structured EBR workflow (`CustomerExecutiveReview`) backed by preparation snapshots, verified attendees (`CustomerExecutiveReviewParticipant`), and idempotent action item commitments (`CustomerExecutiveReviewCommitment`).

---

## 1. Review Lifecycle

EBRs follow a defined status progression:
`SCHEDULED` -> `PREPARATION` -> `COMPLETED` -> `CANCELLED`

- **Preparation Snapshot**: When an EBR is scheduled or moves to preparation, the platform compiles a snapshot of current health score, contract renewal dates, active blockers, and achieved objectives.
- **Participants**: Tracks internal and external attendees, documenting their roles, job titles, and attendance confirmation.

---

## 2. Commitments & Task Materialization

Post-review follow-up failure is the primary reason EBRs lose credibility. Phase 27 solves this through **Executive Review Commitments**:
- `CustomerExecutiveReviewCommitment` records:
  - `description`: Committed deliverable or action item.
  - `ownerUserId`: Responsible assignee.
  - `targetDate`: Target completion deadline.
  - `status`: `PENDING`, `IN_PROGRESS`, `FULFILLED`, `WAIVED`
  - `materializedTaskId`: Direct link to Phase 25 `CustomerTask`.

When a commitment is created or updated, the system can automatically materialize a corresponding task in the Customer 360 task queue, ensuring the commitment is tracked in daily operations without dual-entry.
