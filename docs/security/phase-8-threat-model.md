# Phase 8 Threat Model & Security Controls

This document details the threat vectors analyzed during the architecture of FlowForge Automation's Developer Platform (Phase 8) and the defense-in-depth mitigations implemented across the stack.

---

## 1. Threat Vectors & Mitigations

### Threat 1: API Key Exfiltration & Database Compromise
- **Risk**: If an attacker accesses the PostgreSQL database, plaintext API keys would grant programmatic access to tenant workflows and executions.
- **Mitigation**: FlowForge **never** stores plaintext API keys in the database. Tokens are cryptographically generated with 128-bit entropy (`ffk_live_<32_hex>`) and hashed using SHA-256 before storage. Verification checks the incoming token against the stored hash. Plaintext tokens are returned exactly once upon creation.

### Threat 2: Privilege Escalation via API Keys
- **Risk**: A compromised API key with write permissions creates additional unrestricted API keys or modifies workspace memberships.
- **Mitigation**: API key tokens are prohibited from creating child API keys (`POST /api/v1/api-keys` explicitly blocks `isApiKey: true` callers with `403 Forbidden`). Only human users authenticated through secure session cookies/JWTs can generate, rotate, or revoke API keys.

### Threat 3: Cross-Tenant Data Access (Multi-Tenancy Breach)
- **Risk**: An API key from Workspace A attempts to inspect workflows, executions, or webhooks belonging to Workspace B.
- **Mitigation**: Every database query is strictly filtered by `workspaceId: request.authUser.workspaceId`. Attempting to access resources across workspaces returns `404 Not Found`.

### Threat 4: Server-Side Request Forgery (SSRF) via Outbound Webhooks & Custom Integrations
- **Risk**: An attacker registers an internal endpoint (e.g. `http://169.254.169.254/latest/meta-data/` or `http://localhost:5432`) to exfiltrate cloud credentials or probe internal VPC infrastructure.
- **Mitigation**: Every target URL is validated through `validateUrlForSsrf` before HTTP dispatch. DNS is resolved and all private IP subnets (RFC 1918), loopback, link-local, and cloud metadata addresses are immediately rejected with an `SSRF_VIOLATION` exception. In test runs, the error is safely caught and recorded without taking down the worker.

### Threat 5: Webhook Spoofing and Man-in-the-Middle Manipulation
- **Risk**: Malicious third parties spoof webhook requests to external client endpoints pretending to be FlowForge.
- **Mitigation**: Every outbound webhook delivery computes an HMAC-SHA256 signature using a per-endpoint secret (`whsec_...`) and sends it via `X-FlowForge-Signature`. Destination servers verify authenticity via constant-time HMAC comparison before processing payloads.

### Threat 6: Sensitive Credential Leakage in Developer Endpoints
- **Risk**: `GET /workspaces/current` or `GET /connections` exposes teammate emails or third-party OAuth access tokens to automated API callers.
- **Mitigation**: Responses are sanitized. For API key callers, workspace member email lists are omitted. Connection lists expose only safe connection metadata (`provider`, `label`, `status`), stripping all plaintext `credentials`, `token`, and `apiKey` properties.
