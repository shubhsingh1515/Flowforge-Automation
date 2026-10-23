# FlowForge Automation — Workflow Refinement & Structural Diffs

## 1. Conversational Refinement Paradigm

Automating complex workflows is rarely a one-shot operation. Once an initial automation architecture is generated, operators frequently need to:
- Insert rate-limiting filters or condition branches.
- Require human approval steps before high-impact mutations.
- Reformat payload representations or add data transformations.
- Swap out notification channels (e.g. from Slack to Microsoft Teams or Discord).

FlowForge Phase 13 introduces conversational refinement through `POST /api/v1/ai/refine-workflow`. Rather than regenerating the graph from scratch, FlowForge calculates a **Structural Diff** between the current topology and the refined topology.

---

## 2. Structural Diff Calculation (`AiStructuralDiff`)

The structural difference contract provides full transparency before changes are accepted:

```typescript
export interface AiStructuralDiff {
  addedNodes: Array<{ id: string; label: string; nodeType: string }>;
  removedNodes: Array<{ id: string; label: string }>;
  modifiedNodes: Array<{ id: string; field: string; before: any; after: any }>;
  summary: string;
}
```

### Diff Analysis in Practice

When an operator provides a refinement instruction (e.g., *"Add a filter node to ignore transactions under $10"*):
1. **Node Preservation**: Existing configured nodes (`Trigger`, `Slack Message`, `CRM Sync`) retain their identifiers and configurations where possible.
2. **Intermediate Splice**: The refinement engine introduces the filter node, rewires source and target edges dynamically, and marks the new node as added.
3. **Visual Diff Inspection**: In `/workflows/ai-builder`, the `[data-testid="structural-diff-viewer"]` displays:
   - Green pill: `+N Nodes Added`
   - Red pill: `-N Nodes Removed`
   - Indigo pill: `N Nodes Modified`
4. **DAG Integrity**: The refined graph is passed through `topologicalSort()` to guarantee no cycle was introduced during splicing.
