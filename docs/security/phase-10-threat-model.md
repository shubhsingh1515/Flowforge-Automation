# Phase 10 Enterprise Security & Threat Model

## 1. Overview
This threat model analyzes security assets, potential threat vectors, and defense-in-depth mitigations introduced in Phase 10 (Enterprise SSO, SCIM 2.0, Active Sessions, and Observability).

---

## 2. Threat Analysis Matrix

| Threat Vector | Potential Impact | Phase 10 Mitigation |
|---|---|---|
| **OIDC Auth Code Interception / Replay** | Attacker intercepts authorization code and obtains valid session. | **RFC 7636 PKCE Enforcement**: Ephemeral `code_verifier` stored server-side. Without the original verifier, intercepted authorization codes cannot be exchanged for tokens. |
| **SSRF via Malicious IdP Endpoints** | Attacker configures internal cloud metadata IP (`169.254.169.254`) as IdP Discovery URL to exfiltrate IAM credentials. | **Strict URL and Hostname Validation**: `validateHttpUrl()` disallows loopbacks, RFC 1918 private subnets, and cloud metadata IPs. All IdP endpoints must use HTTPS. |
| **Plaintext Client Secret Leakage** | Database leak exposes IdP client secrets to unauthorized parties. | **AES-256-GCM Encryption**: Secrets are encrypted at rest with workspace key material. Plaintext is never returned in API payloads or logged. |
| **SCIM Bearer Token Exfiltration** | Attacker gains persistent API access to provision/deprovision users. | **High-Entropy Tokens with SHA-256 Hashing**: Tokens (`ffscim_...`) are hashed using SHA-256 before storage. Admins can revoke tokens immediately via UI/API. |
| **SCIM Privilege Escalation** | IdP payload attempts to create accounts with `ADMIN` or `OWNER` roles. | **Strict Role Boundary**: SCIM endpoints hardcode workspace role assignment to `MEMBER`. Role escalation is strictly prohibited. |
| **Session Theft / Stale Logins** | Compromised device retains access indefinitely. | **Active Session Revocation**: Every session is tracked in the `Session` table. Users can revoke individual sessions or trigger "Revoke All Other Sessions". Deprovisioning via SCIM revokes all sessions immediately. |
| **Secret Exposure in Observability Logs** | API keys or passwords logged in execution milestone timelines or error diagnostics. | **Recursive Sensitive Data Scrubbing**: Keys matching `/password|secret|token|bearer|key/i` are masked as `[REDACTED]` before writing to DB or download bundles. |
| **Zombie Execution Denial of Service** | Crashed workers leave hundreds of executions in `RUNNING`, blocking workspace slots. | **Automated Execution Reconciliation**: Scans and terminates orphaned executions >15m with Redis mutex protection (`flowforge:reconciliation:lock`). |
