# FlowForge Automation — Workflow Versioning, Change History & Rollback

## 1. Overview
FlowForge Phase 7 introduces production-grade workflow versioning. Workflows can be modified iteratively while preserving historical milestones, detecting concurrent edits, comparing visual differences across versions, and safely reverting to prior states without loss of historical logs.

---

## 2. Version Storage & Immutability

Workflow versions are stored in the `WorkflowVersion` model in PostgreSQL:
- Each version snapshot captures `definition` (nodes and edges), `changeSummary`, `version` number, `workflowId`, and `createdById`.
- Historical `WorkflowVersion` records are **immutable** and never overwritten or deleted.
- Executions record the specific `workflowVersion` active at execution time, enabling accurate historical replay and auditing.

---

## 3. Deliberate Version Checkpointing

When saving in the visual canvas:
- Standard autosave / incremental saves update the live workflow graph.
- When `createVersion: true` is supplied (or when clicking **Save Checkpoint** in the UI), a new immutable version is generated with an optional `changeSummary` (e.g., *"Added Slack fallback channel and transformed response payload"*).

---

## 4. Optimistic Concurrency Control (Conflict Detection)

To prevent simultaneous edits in multi-user workspaces from silently overwriting changes:
1. The canvas loads the current `version` integer (e.g. `3`).
2. When saving, `PUT /api/v1/workflows/:id` includes `expectedVersion: 3`.
3. If another collaborator updated the workflow to version `4` in the interim:
   - The API rejects the request with HTTP **409 Conflict**:
     ```json
     {
       "error": "Conflict",
       "message": "Workflow has been modified by another user. Current version: 4, expected: 3.",
       "currentVersion": 4
     }
     ```
   - The UI informs the user, preventing silent data loss.

---

## 5. Structural Diff Comparison

Users can inspect differences between any two versions or between a historical version and the live graph:
```http
GET /api/v1/workflows/:id/versions/compare?from=1&to=2
```

The response includes:
- `nodesAdded`: Array of node definitions present in `to` but not in `from`.
- `nodesRemoved`: Array of node definitions present in `from` but not in `to`.
- `nodesModified`: Nodes with changed titles, positions, or configurations.
- `edgesAdded` & `edgesRemoved`: Edge connection topology changes.

---

## 6. Safe Non-Destructive Rollback Architecture

Rolling back to a historical version **never** destroys history or rewrites the timeline:

```
Version History Timeline:
[ v1: Initial Draft ] ──► [ v2: Added Filter ] ──► [ v3: Broken Webhook ]
                                                            │
                                  Rollback to v2 triggered  │
                                                            ▼
                                           [ v4: Rolled back to version 2 ]
```

When `POST /api/v1/workflows/:id/versions/:version/rollback` is invoked:
1. The backend retrieves the definition snapshot of the target version (e.g., `v2`).
2. Increments the workflow `version` to the next sequential integer (e.g., `v4`).
3. Updates the live graph definition to match `v2`.
4. Creates a new immutable version snapshot `v4` with `changeSummary: "Rolled back to version 2"`.
5. Existing execution records for `v1`, `v2`, and `v3` remain completely intact.
