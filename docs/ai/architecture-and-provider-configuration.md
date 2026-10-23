# FlowForge Automation — AI Subsystem Architecture & Provider Configuration

## 1. Architectural Overview & Design Philosophy

FlowForge Automation Phase 13 introduces an enterprise-grade AI subsystem engineered around a non-negotiable core tenet:

> **"AI proposes; deterministic FlowForge services validate and execute."**

Under this contract:
1. **Untrusted Input**: All AI outputs—topologies, code expressions, remediations, test cases—are treated as unauthenticated, untrusted user submissions.
2. **Deterministic Gatekeeping**: The AI model never directly invokes execution engines, alters database state silently, provisions cloud infrastructure, triggers webhooks, or changes production workflows.
3. **Registry Grounding**: Workflow creation and modification prompts are strictly constrained by FlowForge's dynamic node registry, JSON schema configurations, and supported integration capabilities. Hallucinated nodes, unsupported connectors, or invalid cyclic dependencies are rejected by topological validation before presentation to the user.
4. **Draft-Only Persistence**: Newly generated workflows are persisted exclusively with `WorkflowStatus.DRAFT` (`isDraft: true`). Human operators must review and explicitly activate or promote through Phase 12 release pipelines.

```
                    ┌────────────────────────┐
                    │ User / Client Request  │
                    │ (Prompt / Diagnostics) │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ FlowForge API Gateway  │
                    │  - Tenancy Isolation   │
                    │  - RBAC Scope Check    │
                    │  - Rate & Quota Limits │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Secret Scrubbing Layer │
                    │ (redactSensitiveData)  │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Registry System Prompt │
                    │  + JSON Schema Specs   │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  IAiProvider Interface │
                    │ ┌────────────────────┐ │
                    │ │ Mock Provider      │ │
                    │ │ (Deterministic)    │ │
                    │ ├────────────────────┤ │
                    │ │ OpenAI-Compatible  │ │
                    │ │ (GPT-4o, Claude)   │ │
                    │ └────────────────────┘ │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Topological Validator  │
                    │  - Cycle Detection     │
                    │  - Port / Handle Match │
                    │  - Schema Validation   │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  Structured Proposal   │
                    │ (Interactive Review UI)│
                    └────────────────────────┘
```

---

## 2. Provider Abstraction (`IAiProvider`)

All model interaction is mediated through the `IAiProvider` interface (`apps/api/src/services/ai/provider.ts`), decoupling the FlowForge platform from any single AI vendor or backend API:

```typescript
export interface IAiProvider {
  generateWorkflow(userPrompt: string, availableIntegrations?: string[]): Promise<AiWorkflowProposal>;
  refineWorkflow(currentProposal: AiWorkflowProposal, instruction: string): Promise<AiRefinementProposal>;
  explainWorkflow(nodes: any[], edges: any[]): Promise<AiWorkflowExplanation>;
  debugExecution(diagnostics: {
    workflowName: string;
    errorCategory?: string;
    errorSummary?: string;
    failedStep?: any;
    stepExecutions: any[];
  }): Promise<AiExecutionDebugReport>;
  optimizeWorkflow(metrics: {
    workflowId: string;
    p95DurationMs: number;
    errorRate: number;
    nodes: any[];
    edges: any[];
  }): Promise<AiOptimizationReport>;
  generateTestCases(workflow: {
    name: string;
    nodes: any[];
    edges: any[];
  }): Promise<AiTestCaseProposal[]>;
}
```

### Supported Providers

1. **`MockAiProvider` (`AI_PROVIDER="mock"`)**:
   - High-performance, offline, deterministic mock generator.
   - Grounded completely in the real node registry (`TRIGGER`, `CONDITION`, `HTTP_REQUEST`, `DATA_TRANSFORM`, `HUMAN_APPROVAL`, `WORKFLOW_END`).
   - Generates deterministic structural diffs, failure debug analyses, performance optimizations, and assertion test cases matching Phase 12 validation gates.
   - Ideal for CI/CD test suites, air-gapped deployments, and automated verification without external API egress costs.

2. **`OpenAiCompatibleProvider` (`AI_PROVIDER="openai"` | `"anthropic"` | `"custom"`)**:
   - Connects to any standard OpenAI API-compatible endpoint (OpenAI, Azure OpenAI, Anthropic via proxy, vLLM, Ollama, Groq, Mistral).
   - Enforces JSON Schema mode (`response_format: { type: "json_object" }`).
   - Built-in abort timeouts (`AI_TIMEOUT_MS`, default 30s) and exponential backoff retry policies.

---

## 3. Configuration & Environment Variables

The AI subsystem is configured via server-side environment variables defined in `apps/api/src/config.ts`:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AI_ENABLED` | `boolean` | `true` | Master feature flag toggling all `/api/v1/ai` capabilities. |
| `AI_PROVIDER` | `string` | `"mock"` | Provider engine (`"mock"`, `"openai"`, `"custom"`). |
| `AI_API_KEY` | `string` | `""` | Secret API key for OpenAI-compatible endpoint. Kept strictly server-side. |
| `AI_MODEL` | `string` | `"gpt-4o"` | Model identifier passed in completion requests. |
| `AI_API_ENDPOINT` | `string` | `"https://api.openai.com/v1"` | Base URL for LLM API requests. |
| `AI_MAX_REQUESTS_PER_MINUTE` | `number` | `60` | Workspace-level token bucket rate limiter. |
| `AI_TIMEOUT_MS` | `number` | `30000` | Egress timeout for LLM provider HTTP requests. |

---

## 4. Subsystem Health & Status API

Clients and frontend shells query the operational readiness of the AI engine via `GET /api/v1/ai/status`:

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "provider": "mock",
    "model": "deterministic-mock-v1",
    "quotaRemaining": 248,
    "quotaLimit": 250,
    "quotaResetDate": "2026-11-01T00:00:00.000Z"
  }
}
```

If `AI_ENABLED=false`, all mutating AI routes gracefully return HTTP `503 Service Unavailable` with `{ code: "AI_FEATURE_DISABLED", message: "AI Assistant is currently disabled in this workspace or installation." }`.
