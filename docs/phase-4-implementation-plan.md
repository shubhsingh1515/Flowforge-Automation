# FlowForge Automation — Phase 4 Implementation Plan
## Advanced Workflow Logic, Flow Control, State Management, and Human-in-the-Loop Execution

**Date:** October 22, 2026  
**Status:** Approved for Implementation  
**Architect:** Senior Workflow Engine Architect & Full-Stack Developer  

---

## 1. Executive Summary & Existing Baseline

FlowForge Automation has successfully completed Phases 1 through 3:
- **Phase 1**: Next.js App Router frontend, React Flow canvas, authentication, PostgreSQL database with Prisma ORM.
- **Phase 2**: BullMQ Redis asynchronous execution engine, webhook triggers, cron scheduler, SSRF-protected HTTP requests, execution history.
- **Phase 3**: Reusable integration framework, OAuth 2.0 with PKCE and anti-replay state, AES-256-GCM authenticated credential encryption, tenant isolation, and real integrations for Slack, Google Sheets, Gmail, and Google Drive.
- **Baseline Verification**: 66 Vitest unit/integration tests passing, 20 Playwright browser tests passing, 0-error Next.js production build.

Phase 4 transforms FlowForge from a linear/simple DAG runner into an enterprise-grade automation platform supporting **multi-condition branching**, **loops & iteration**, **safe data transformations**, **parallel execution & joins**, and **human-in-the-loop approvals** with durable state persistence and cancellation.

---

## 2. Architecture & Design Principles

### Core Tenet: Extend the Existing Engine (No Parallel Engine)
The execution engine in `apps/api/src/engine/runner.ts` and BullMQ worker in `apps/api/src/worker/` will be extended with:
1. **Durable Pause & Resume**: Workflows can yield execution (e.g. `WAITING_APPROVAL`) without holding BullMQ worker threads open. Resuming enqueues an idempotent continuation job.
2. **Branch Routing**: Condition nodes output discrete branch keys (`true` / `false` or named branch IDs). Downstream edges check `sourceHandle` matching to activate only chosen paths.
3. **Safe Evaluation Without `eval()`**: Condition rules, nested AND/OR groups, and data transformation operations use deterministic, sandboxed AST/rule parsers.
4. **Bounded Iteration**: For Each nodes iterate over arrays with isolated item contexts, resource protection (max iterations), and structured result aggregation.
5. **Join Synchronization**: Joins wait for all active incoming branches, correctly resolving skipped paths from unselected condition branches.
6. **Strict Multi-Tenant Isolation**: Approvals, cancellations, executions, and transformations enforce workspace ownership on every operation.

---

## 3. Database Schema Changes

File: `packages/database/prisma/schema.prisma`

### A. ExecutionStatus Enum Update
Add `WAITING_APPROVAL` status:
```prisma
enum ExecutionStatus {
  PENDING
  RUNNING
  WAITING_APPROVAL
  SUCCESS
  FAILED
  CANCELLED
}
```

### B. New Model: WorkflowApproval
Persists human approval requests:
```prisma
model WorkflowApproval {
  id               String          @id @default(uuid())
  workspaceId      String
  workflowId       String
  executionId      String
  nodeId           String
  stepId           String?
  title            String
  description      String?
  context          Json?           // Sanitized step/trigger data for approver review
  status           String          @default("PENDING") // PENDING, APPROVED, REJECTED, TIMED_OUT, CANCELLED
  requiredRole     WorkspaceRole?
  decision         String?         // APPROVED, REJECTED
  comment          String?
  decidedByUserId  String?
  decidedAt        DateTime?
  timeoutSeconds   Int?
  expiresAt        DateTime?
  resumeNodeId     String?
  rejectNodeId     String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  workflow  Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  execution WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([workspaceId, status])
  @@index([executionId])
  @@index([status, expiresAt])
  @@map("workflow_approvals")
}
```

### C. Updates to WorkflowExecution
- Add `executionState Json?` to store branch execution map, loop iterations, and context snapshots for resume.
- Add `cancellationReason String?`, `cancelledAt DateTime?`, `cancelledByUserId String?`.
- Add relation: `approvals WorkflowApproval[]`.

### D. Updates to WorkflowStepExecution
- Add `iteration Int?` (identifies loop iteration index).
- Add `branch String?` (identifies active branch name).

---

## 4. Execution Semantics & Node Specifications

### Feature A: Multi-Condition Branching & Filter
- **Condition Node (`apps/api/src/engine/nodes/condition.ts`)**:
  - Operators: `equals`, `not_equals`, `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`, `is_empty`, `is_not_empty`, `exists`, `not_exists`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_true`, `is_false`, `matches_regex` (safe length limit, ReDoS protection), `in_list`, `not_in_list`.
  - Nested Rule Groups: recursive `AND` / `OR` group evaluation.
  - Edge routing: activates downstream nodes whose `sourceHandle` matches the `selectedBranch` (`true` or `false`).
- **Filter Node (`apps/api/src/engine/nodes/filter.ts`)**:
  - Evaluates condition rules over an array expression (`{{steps.query.output.items}}`).
  - Outputs `{ matchingItems: any[], filteredCount: number, totalCount: number }`.

### Feature B: Iteration & Loop Control
- **For Each Node (`apps/api/src/engine/nodes/loop.ts`)**:
  - Input: Array expression e.g. `{{steps.list_files.output.files}}`.
  - Scoped iteration context: `{{loop.item}}`, `{{loop.index}}`, `{{loop.length}}`, `{{loop.isFirst}}`, `{{loop.isLast}}`.
  - Limits: default max 100 iterations (configurable up to 200), timeout and cancellation checks between iterations.
  - Error policy: `STOP_ON_ERROR` or `CONTINUE_AND_COLLECT`.
  - Outputs ordered array of iteration outputs and error summaries.

### Feature C: Data Transformations & Safe Expressions
- **Transform Node (`apps/api/src/engine/nodes/transform.ts`)**:
  - Declarative operators:
    - `SELECT_AND_RENAME`: pick and remap fields.
    - `BUILD_OBJECT`: construct nested JSON from template bindings.
    - `TYPE_CONVERT`: cast types (`to_string`, `to_number`, `to_boolean`, `to_date`, `to_json`).
    - `STRING_OPS`: `concat`, `trim`, `uppercase`, `lowercase`, `split`, `join`, `replace`.
    - `MATH_OPS`: `add`, `subtract`, `multiply`, `divide`, `modulo`, `round`.
    - `ARRAY_OPS`: `pluck`, `flatten`, `slice`, `filter_empty`.
  - Zero `eval()` or `new Function()`.
  - Preview Endpoint: `POST /api/v1/workflows/preview-transform` for instant UI preview with sample data.

### Feature D: Parallel Branch Execution & Joins
- **Fork Node (`apps/api/src/engine/nodes/fork.ts`)**:
  - Distributes control flow across multiple outgoing handles concurrently.
- **Join Node (`apps/api/src/engine/nodes/join.ts`)**:
  - Policy: `WAIT_ALL` (waits for all required active incoming branches).
  - Handles skipped branches from conditions so the join never deadlocks.
  - Aggregates upstream branch outputs into structured combined output.

### Feature E: Human Approvals & Pausable Workflows
- **Approval Node (`apps/api/src/engine/nodes/approval.ts`)**:
  - Pauses execution, persists `WorkflowApproval` record, transitions `WorkflowExecution` to `WAITING_APPROVAL`.
  - Releases BullMQ worker immediately.
  - Dedicated API: `GET /api/v1/approvals`, `POST /api/v1/approvals/:id/decide`.
  - Idempotent decision handling with workspace role validation.
  - On approval: re-enqueues continuation job to BullMQ resuming at `resumeNodeId`.
  - On rejection: routes to `false`/rejected branch or cleanly stops execution.
  - Optional timeout job triggers automated rejection/expiration.

### Feature F: Durable Execution State, Cancellation & Replay
- **Cancellation**:
  - `POST /api/v1/executions/:id/cancel` immediately stops active runs and cancels pending approvals.
  - Runner checks cancellation flag before executing each node.
- **Replay / Retry**:
  - Enhanced execution viewer displaying branch traces, loop iterations, and approval history.

---

## 5. API Endpoints

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/workflows/preview-transform` | Preview data transformation with sample JSON input | Authenticated |
| `GET` | `/api/v1/approvals` | List pending and decided approvals for workspace | Authenticated |
| `GET` | `/api/v1/approvals/:id` | Get details and context for an approval request | Authenticated |
| `POST` | `/api/v1/approvals/:id/decide` | Submit approval decision (`APPROVED` / `REJECTED`) | Workspace Role Check |
| `POST` | `/api/v1/executions/:id/cancel` | Cancel an active or waiting workflow execution | Workspace Member |
| `GET` | `/api/v1/executions/:id` | Get execution details with approval and branch trace | Authenticated |

---

## 6. Frontend Canvas & UI Components

1. **Node Library Palette**:
   - Condition & Multi-branch Filter
   - Data Transform
   - For Each Loop
   - Fork / Parallel Branch
   - Join / Synchronize Branches
   - Human Approval
2. **Node Configuration Panel**:
   - Condition Editor: AND/OR rule builder with operator dropdowns.
   - Transform Editor: field mapping, string/math operations, and live preview tester.
   - For Each Editor: array expression, max iteration limits, error handling strategy.
   - Join Editor: join policy (`WAIT_ALL`), branch status.
   - Approval Editor: title, description template, required role, timeout.
3. **Approvals UI (`/approvals`)**:
   - Workspace pending approvals dashboard.
   - Decision modal with approve/reject actions and comment input.
4. **Execution History UI (`/executions`)**:
   - `WAITING_APPROVAL` status badge.
   - "Cancel Execution" button.
   - Step timeline rendering loop iterations and branch outcomes.

---

## 7. Implementation Sequence & Milestones

- **Milestone 1**: Database schema migration (`WAITING_APPROVAL`, `WorkflowApproval`, `executionState`, `iteration`).
- **Milestone 2**: Feature A — Multi-condition rules evaluator, nested AND/OR groups, branch routing, and Filter node.
- **Milestone 3**: Feature C — Safe declarative data transformations, type conversions, string/math ops, and preview endpoint.
- **Milestone 4**: Feature B — For Each loop node, iteration context (`{{loop.item}}`), safety limits, error policies, and aggregation.
- **Milestone 5**: Feature D — Fork and Join nodes, parallel branch resolution, and join synchronization.
- **Milestone 6**: Feature E — Approval node, durable pause/resume, approval API, workspace authorization, and continuation queue jobs.
- **Milestone 7**: Feature F — Workflow cancellation endpoint, safe retry checkpoints, and enhanced execution trace.
- **Milestone 8**: Frontend Canvas & UI updates (NodeLibrary, NodeConfigPanel, `/approvals` page, `/executions` updates).
- **Milestone 9**: End-to-end verification (Vitest test suite, Playwright browser tests, Next.js build, and completion report).

---

## 8. Security & Compliance Checklist

- [x] No `eval()`, `new Function()`, or dynamic code execution.
- [x] Strict workspace authorization on all approvals, cancellations, and execution details.
- [x] Multi-tenant anti-leakage: cross-workspace ID queries return 404/403.
- [x] AES-256-GCM vault preserved for all credentials.
- [x] ReDoS protection on regex matching (length limits, safe-regex).
- [x] Bounded iteration limits on loops (max 200).
- [x] Safe error messages without stack traces or secret leakage.
