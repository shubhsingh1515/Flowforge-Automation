# FlowForge Automation — AI Data Governance & Threat Model

## 1. Enterprise Trust Boundary

FlowForge's AI subsystem operates under a strict principle of least-privilege data egress and defense-in-depth isolation. Enterprise customers can be confident that sensitive business secrets, customer PII, and credentials never leave the tenant's trusted execution perimeter.

---

## 2. Threat Analysis & Mitigations

| Threat Vector | Attack Scenario | FlowForge Mitigation |
| :--- | :--- | :--- |
| **Silent Workflow Activation** | Prompt injection crafts a malicious workflow and attempts to activate it immediately. | **Architectural Enforcement**: AI endpoints output JSON proposals only. The persistence handler strictly saves workflows with `WorkflowStatus.DRAFT`. Canvas activation or environment promotion requires explicit human operator action and authenticated RBAC permissions. |
| **Credential Egress & Secret Leakage** | Workflow context, error logs, or environment configs sent to external LLMs contain API keys, passwords, or OAuth tokens. | **Redaction Pipeline**: Before any prompt or payload is sent to an external provider, it passes through `redactSensitiveData()`, which regex-replaces bearer tokens, authorization headers, passwords, secrets, and private keys. Real credentials in `@flowforge/db` are encrypted with AES-256-GCM and never decrypted during AI generation. |
| **Prompt Injection & Command Injection** | Malicious webhook data or user prompt attempts to hijack model output to inject shell commands, SSRF endpoints, or unauthorized integrations. | **Registry Grounding**: System prompts instruct the model to use only supported nodes and integrations. The response is validated with Zod against strict JSON schemas. Any unknown node types or invalid parameters are rejected before rendering. |
| **Topological Loop Denial of Service** | Injection attempts to create infinite cyclic loops in workflow graphs, exhausting background worker threads. | **DAG Verification**: The proposal is subjected to `topologicalSort()` (Kahn's algorithm). If any cycle is detected, `isValid` is set to `false`, and the UI displays a warning banner preventing execution. |
| **Cross-Tenant Context Pollution** | AI requests from Tenant A access workflow history or optimization metrics from Tenant B. | **Tenancy Scoping**: All routes enforce `authenticateRequest`. Workflows, executions, and analytics queries strictly filter on `workspaceId = request.authUser.workspaceId`. |
| **Resource & Cost Exhaustion** | Runaway script or malicious user spams AI generation routes, generating massive LLM API bills. | **Quota & Entitlements**: Enforced per workspace tier (FREE: 20/mo, PRO: 250/mo, BUSINESS: 2,500/mo). Workspace token bucket rate limiter restricts bursts (`AI_MAX_REQUESTS_PER_MINUTE = 60`). |

---

## 3. Data Retention & Training Policies

- **Zero Data Training**: FlowForge contracts with AI providers mandate that prompt data sent through the API is not used to train or fine-tune public foundation models.
- **Stateless Prompts**: AI completion calls are completely stateless; no conversation sessions are stored by the model provider.
- **Air-Gapped / Sovereign Deployments**: For regulated enterprises requiring zero cloud egress, the `MockAiProvider` operates 100% locally with zero external network connectivity, and the `OpenAiCompatibleProvider` can point directly to an internal Ollama or vLLM instance (`AI_API_ENDPOINT=http://internal-vllm:8000/v1`).
