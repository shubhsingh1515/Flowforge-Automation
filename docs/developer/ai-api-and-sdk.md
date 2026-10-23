# FlowForge Automation — Developer AI API & TypeScript SDK

## 1. REST Endpoints Overview

The FlowForge Phase 13 AI platform exposes high-level, strongly-typed endpoints under `/api/v1/ai/...`.

All endpoints require standard Bearer token authentication (`Authorization: Bearer <token>` or `Authorization: Bearer ff_live_...`).

| Route | Method | Required Scope | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/ai/status` | `GET` | `ai:analyze` or standard user | Returns AI subsystem status, active provider, model, and monthly quota remaining. |
| `/api/v1/ai/generate-workflow` | `POST` | `ai:generate` | Translates natural-language prompt into a registry-grounded DAG workflow proposal. |
| `/api/v1/ai/refine-workflow` | `POST` | `ai:generate` | Refines an existing proposal with structural diffing (`addedNodes`, `removedNodes`, `modifiedNodes`). |
| `/api/v1/ai/explain-workflow` | `POST` | `ai:analyze` | Generates human-readable architectural and operational walkthrough without revealing secrets. |
| `/api/v1/ai/debug-execution/:executionId` | `POST` | `ai:analyze` | Analyzes execution failure traces, returns probable root cause, confidence, and remediation steps. |
| `/api/v1/ai/optimize-workflow/:workflowId` | `POST` | `ai:optimize` | Synthesizes rolling telemetry to produce evidence-backed performance optimizations and patches. |
| `/api/v1/ai/generate-tests/:workflowId` | `POST` | `ai:generate` | Synthesizes pre-deployment test cases matching Phase 12 `WorkflowTestCase` assertion schemas. |

---

## 2. API Key Scopes

Phase 13 introduces three dedicated Developer Platform scopes:
- `"ai:generate"`: Authorizes creation and refinement of workflow proposals and test cases.
- `"ai:analyze"`: Authorizes execution failure debugging and workflow explanations.
- `"ai:optimize"`: Authorizes performance intelligence and optimization recommendations.

---

## 3. TypeScript SDK (`@flowforge/sdk`)

The FlowForge TypeScript SDK provides first-class methods under `client.ai.*`:

```typescript
import { FlowForgeClient } from "@flowforge/sdk";

const client = new FlowForgeClient({
  baseUrl: "https://api.flowforge.dev/api/v1",
  apiKey: process.env.FLOWFORGE_API_KEY!,
});

// 1. Check subsystem status
const status = await client.ai.status();
console.log(`Provider: ${status.data.provider}, Quota Remaining: ${status.data.quotaRemaining}`);

// 2. Generate a workflow proposal
const proposal = await client.ai.generateWorkflow({
  prompt: "When a new lead arrives via webhook, filter by company domain, create a contact, and post to Slack",
});
console.log(`Proposed ${proposal.data.name} with ${proposal.data.nodes.length} nodes (DAG valid: ${proposal.data.validation.isValid})`);

// 3. Conversational Refinement
const refined = await client.ai.refineWorkflow({
  prompt: "Add an approval gate before posting to Slack",
  currentNodes: proposal.data.nodes,
  currentEdges: proposal.data.edges,
});
console.log(`Diff: +${refined.data.diff.addedNodes.length} nodes, -${refined.data.diff.removedNodes.length} nodes`);

// 4. Debug an execution failure
const debugReport = await client.ai.debugExecution("exec_12345");
console.log(`Root cause: ${debugReport.data.probableCause}`);
for (const step of debugReport.data.remediationSteps) {
  console.log(`- ${step}`);
}

// 5. Generate automated pre-deployment test cases
const tests = await client.ai.generateTests("wf_67890", 3);
console.log(`Generated ${tests.data.length} test fixtures ready for safe DRY_RUN execution`);
```
