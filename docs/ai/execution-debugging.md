# FlowForge Automation — Intelligent Execution Debugging & Remediation

## 1. Context-Grounded Failure Analysis

In distributed automation platforms, workflow runs can fail for multifaceted reasons:
- Expired OAuth tokens or rotated API keys (`AUTH_FAILURE`).
- Network partition, gateway timeout, or target service 503 (`NETWORK_TIMEOUT`, `RATE_LIMITED`).
- Invalid schema or missing JSON keys in trigger payloads (`SCHEMA_VALIDATION_ERROR`).
- Server-Side Request Forgery or private IP traversal attempts (`SSRF_VIOLATION`).

FlowForge Phase 13 introduces intelligent failure debugging accessible directly inside execution logs at `POST /api/v1/ai/debug-execution/:executionId`.

---

## 2. Security-First Diagnostics Pipeline

Before any execution log or trace is sent to an AI provider, it passes through FlowForge's privacy boundary:

1. **Secret Scrubbing**: All bearer tokens, passwords, authorization headers, credit card numbers, and secret values are redacted using `redactSensitiveData()` (`apps/api/src/services/ai/aiService.ts`).
2. **Error Category Classification**: FlowForge passes the deterministic `errorCategory` recorded by the Phase 2 runtime engine (`API_UNAUTHORIZED`, `TIMEOUT`, `TRANSFORMATION_SYNTAX_ERROR`).
3. **Verified Step History**: The AI engine inspects the sequence of successful steps prior to the failure point, identifying exactly which node failed and what parameters caused the failure.

---

## 3. The Debug Report Schema (`AiExecutionDebugReport`)

The debug report provides structured, actionable insights:

```typescript
export interface AiExecutionDebugReport {
  executionId: string;
  workflowId: string;
  probableCause: string;
  uncertaintyLevel: "LOW" | "MEDIUM" | "HIGH";
  supportingEvidence: string[];
  remediationSteps: string[];
  suggestedNodePatch?: {
    nodeId: string;
    patchDescription: string;
    configDiff: Record<string, any>;
  };
}
```

### UI Integration

Within `/executions`, clicking "Logs" on any failed execution displays the **Intelligent Failure Analysis** card (`[data-testid="ai-debug-container"]`):
- Probable root cause with high/medium confidence indicator.
- Bulleted supporting evidence pulled directly from step execution logs.
- Step-by-step remediation checklist (e.g., re-authenticating connected credentials, updating endpoint URL, adding an upstream null-check filter).
