# FlowForge Automation SaaS — Phase 13 Implementation Plan
## AI-Assisted Workflow Builder, Natural-Language Automation, Intelligent Debugging, and Workflow Optimization

---

## 1. Executive Summary & Architectural Context

Phase 13 introduces an enterprise-grade, secure AI assistance layer into FlowForge Automation SaaS. FlowForge has completed Phases 1–12, providing a robust execution engine, visual React Flow canvas, third-party integrations, advanced branching/loops, human-in-the-loop approvals, SaaS billing/entitlements, public developer APIs, multi-tenant governance, and isolated deployment environments (`Development`, `Staging`, `Production`) with immutable SHA-256 release artifacts.

### Guiding Architectural Principle
> **"AI proposes; deterministic FlowForge services validate and execute."**
> All AI-generated content (workflows, patches, explanations, test cases, and diagnostic suggestions) is strictly treated as untrusted input. The AI cannot mutate production databases directly, bypass approval workflows, trigger live side effects, or deploy releases automatically.

---

## 2. Existing Architecture & Reusable Components

The Phase 13 implementation builds directly upon established FlowForge foundations:
1. **Node Registry & Topology Engine (`apps/api/src/engine`, `@flowforge/shared`)**:
   - Supported node types: `TRIGGER`, `ACTION`, `CONDITION`, `FILTER`, `TRANSFORM`, `LOOP`, `FORK`, `JOIN`, `APPROVAL`, `HTTP_REQUEST`, `WORKFLOW_END`.
   - Built-in integrations: `slack`, `google-sheets`, `gmail`, `google-drive`, and custom integrations (`apps/api/src/integrations/registry.ts`).
   - Graph validation: `validateWorkflowGraph` enforcing DAG properties, cycle detection, single trigger rules, and connectivity checks.
2. **Execution Engine & Diagnostics (`apps/api/src/services/diagnostics.ts`)**:
   - `DiagnosticsService`: Canonical error classification (`INVALID_CONFIG`, `AUTH_FAILURE`, `SSRF_VIOLATION`, `NETWORK_TIMEOUT`, `RATE_LIMIT_EXCEEDED`, `WORKER_TIMEOUT`), timeline milestones, retry tracking.
   - `redactSensitiveData` (`apps/api/src/services/tracing.ts`): Strips authorization headers, API keys (`ffk_...`), Bearer tokens, passwords, and webhook secrets.
3. **Automated Testing & Release Gates (`apps/api/src/services/workflowTesting.ts`, `releases.ts`)**:
   - Fixture-based test cases with operators (`EQUALS`, `CONTAINS`, `EXISTS`, `GREATER_THAN`, `NOT_EMPTY`).
   - Safe `DRY_RUN` non-destructive execution mode short-circuiting external action side effects.
   - SHA-256 content-hash verification tying test gates directly to release artifacts.
4. **Billing, Entitlements & Metering (`apps/api/src/services/entitlements.ts`, `UsageRecord`)**:
   - `UsageRecord` model tracking metric types (e.g. `WORKFLOW_EXECUTION`, `STEP_EXECUTION`, and new `AI_REQUEST`).
   - Workspace tiers (`FREE`, `PRO`, `BUSINESS`) with server-authoritative monthly quotas.
5. **Developer Platform & SDK (`@flowforge/shared`, `@flowforge/sdk`)**:
   - Scoped API key authentication (`requireScope`).
   - Outbound webhooks emitting lifecycle events.
   - Strongly typed client SDK with promises.

---

## 3. AI Provider Architecture & Provider Strategy

### 3.1 Provider Abstraction Layer (`apps/api/src/services/ai/provider.ts`)
We establish a clean, provider-agnostic interface `IAiProvider`:
```typescript
export interface AiPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: any;
}

export interface AiProviderResponse<T = any> {
  data: T;
  rawText: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  provider: string;
  model: string;
  isSimulated?: boolean;
}

export interface IAiProvider {
  name: string;
  generateStructured<T>(options: AiPromptOptions): Promise<AiProviderResponse<T>>;
}
```

### 3.2 Provider Implementations
1. **MockAiProvider (Default / Test / Offline)**:
   - Evaluates input prompts against a deterministic registry-grounded knowledge base.
   - Emits syntactically valid React Flow nodes, edges, dependencies, and test fixtures.
   - Flags `isSimulated: true` so responses are transparently identified.
   - Enables fast, zero-cost, 100% deterministic Vitest and Playwright CI test execution without external API dependencies.
2. **OpenAiCompatibleProvider (Production / Enterprise)**:
   - Configurable via `AI_API_KEY`, `AI_MODEL` (e.g. `gpt-4o-mini`, `gpt-4o`), and optional `AI_API_ENDPOINT`.
   - Utilizes JSON mode / structured outputs with strict server-side validation.
3. **Graceful Degraded & Disabled Handling**:
   - If `AI_ENABLED=false`: Returns HTTP 503 `AI_DISABLED`.
   - If provider credentials missing: Returns HTTP 503 `AI_UNCONFIGURED` with actionable instructions.

---

## 4. Structured Schemas & Registry-Grounded Generation

### 4.1 Schema Definition (`packages/shared/src/ai.ts`)
```typescript
export interface AiWorkflowProposal {
  name: string;
  description: string;
  triggerType: "WEBHOOK" | "SCHEDULE" | "MANUAL";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  requiredIntegrations: string[];
  requiredVariables: string[];
  assumptions: string[];
  suggestedTests: Array<{
    name: string;
    description: string;
    mockPayload: Record<string, any>;
    assertions: Array<{ target: string; operator: string; expected?: any }>;
  }>;
  validation: GraphValidationResult;
}
```

### 4.2 Registry Grounding & Strict Validation
- The model is supplied strictly with supported node types, operations (`slack.sendMessage`, `googleSheets.appendRow`, etc.), and valid config parameters.
- Server-side validation rejects:
  - Unknown node types or unknown integration keys.
  - Cyclic graphs or disconnected nodes.
  - Invalid trigger definitions (must have exactly one trigger).
  - Malformed expressions or raw credential injection.
- If validation errors are detected, the API returns a structured validation warning block allowing client-side correction or automated retry.

---

## 5. Security, Privacy & Threat Model

1. **Prompt Injection & Untrusted Payloads**:
   - Workflow descriptions and execution failure payloads are strictly treated as untrusted data.
   - Prompts are bounded with length limits (max 2,000 characters for user prompts, max 10,000 characters for error summaries).
2. **Secret Redaction & Data Minimization**:
   - Before any workflow definition or execution payload is supplied to the AI provider, `redactSensitiveData` scrubs all passwords, tokens, API keys, and sensitive environment variables (`[REDACTED]`).
   - Stored AES-256-GCM ciphertext is never passed to the AI provider.
3. **Separation of Privileges**:
   - AI generates *proposals* only.
   - The AI cannot save workflows, deploy to environments, trigger live executions, or execute network requests.
   - Workflows must be explicitly saved as `DRAFT` by authorized workspace users.
4. **Tenant Isolation**:
   - Every AI request requires authenticated workspace context (`request.authUser.workspaceId`).
   - Cross-workspace queries or data aggregation are strictly forbidden.

---

## 6. Model Cost & Usage Controls

1. **Server-Authoritative Quotas**:
   - Workspace plans configure `maxAiRequestsPerMonth`:
     - **FREE**: 20 requests/month.
     - **PRO**: 250 requests/month.
     - **BUSINESS**: 2,500 requests/month.
   - Enforced by `EntitlementService.canExecuteAiRequest(workspaceId)`.
2. **Audit Logging & Accounting**:
   - Every AI operation logs a `WorkspaceAuditLog` entry (`action: "ai.workflow_generated"`, `ai.execution_analyzed`, etc.) and increments `UsageRecord(metricType: "AI_REQUEST")`.
3. **Concurrency & Rate Limits**:
   - In-memory rate limiting throttles requests to 30 requests/minute per workspace.

---

## 7. API Endpoints & Developer SDK

### API Routes (`apps/api/src/routes/ai.ts`)
- `POST /api/v1/ai/generate-workflow` — Generates a registry-grounded workflow proposal from natural language.
- `POST /api/v1/ai/refine-workflow` — Generates a conversational modification proposal and structural diff.
- `POST /api/v1/ai/explain-workflow` — Explains an existing workflow definition without revealing secrets.
- `POST /api/v1/ai/debug-execution/:executionId` — Analyzes a failed execution using sanitized diagnostic records.
- `POST /api/v1/ai/optimize-workflow/:workflowId` — Generates evidence-based performance recommendations.
- `POST /api/v1/ai/generate-tests/:workflowId` — Synthesizes test fixtures and assertions.

### API Key Scopes
- `ai:generate`
- `ai:analyze`
- `ai:optimize`

### TypeScript SDK (`packages/sdk`)
```typescript
client.ai.generateWorkflow({ prompt: "..." });
client.ai.refineWorkflow({ workflowId: "...", prompt: "..." });
client.ai.explainWorkflow({ workflowId: "..." });
client.ai.debugExecution("exec_123");
client.ai.optimizeWorkflow("wf_123");
client.ai.generateTests("wf_123");
```

---

## 8. Frontend User Experience (`apps/web`)

1. **AI Workflow Builder (`/workflows/ai-builder` or modal in `/workflows`)**:
   - Natural-language prompt input with quick starter templates.
   - Live generation progress indicator.
   - Reviewable proposal canvas displaying nodes, connections, and required integrations.
   - Conversational refinement input displaying before/after structural diffs.
   - Explicit **"Save as Draft"** button (never auto-activated or auto-deployed).
2. **Workflow Explainer**:
   - Accessible from workflow canvas or details header.
   - Clean markdown breakdown of trigger conditions, execution flow, dependencies, and risks.
3. **Intelligent Execution Debugger**:
   - Accessible from failed execution view in `/executions`.
   - Displays probable root causes, verified logs, and recommended workflow fixes.
4. **Optimization & Test Generation**:
   - Integrated into workflow performance and test center tabs.

---

## 9. Verification & Rollout Strategy

1. **Unit & Integration Tests (`apps/api/test/phase13.test.ts`)**:
   - Test provider abstraction, disabled state, unconfigured handling.
   - Test registry-grounded generation and validation error handling.
   - Test secret redaction before AI dispatch.
   - Test quota enforcement across FREE, PRO, and BUSINESS plans.
   - Test execution failure debugging and test-case generation.
2. **SDK Tests (`packages/sdk/test/sdk.test.ts`)**:
   - Validate SDK client methods and parameter handling.
3. **Playwright E2E Smoke Tests (`e2e/smoke.spec.ts`)**:
   - Test 34: Natural-language workflow generation & draft saving.
   - Test 35: Workflow explanation & execution failure debugging.
   - Test 36: AI test-case generation & optimization insights.
4. **Zero Regressions**:
   - Re-run full Vitest suite (234+ tests).
   - Re-run full Playwright E2E suite (66+ tests).
