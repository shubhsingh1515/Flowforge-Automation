# Marketplace Threat Model & Supply-Chain Security

## 1. Threat Landscape Overview

Allowing users to publish, share, and install integrations introduces several attack vectors:
1. **Malicious Code Execution**: Attackers attempting to run arbitrary JS/Python in worker runtimes.
2. **Server-Side Request Forgery (SSRF)**: Connectors configured to probe internal cloud metadata or corporate networks.
3. **Data Exfiltration / Credential Theft**: Connector parameters templated to leak API keys or workflow outputs to unauthorized servers.
4. **Dependency Supply-Chain Poisoning**: Tampering with published connector versions to alter behavior post-review.

---

## 2. Mitigations & Defense in Depth

### 2.1 Declarative-Only Connector Architecture
- FlowForge does not evaluate user-provided code strings or untrusted npm packages.
- All actions execute through a hardened, single-purpose HTTP client in `apps/api/src/services/integrations/declarativeEngine.ts`.
- Node logic is expressed purely as declarative JSON structures with bounded templating.

### 2.2 Strict SSRF Filtering
- Base URLs are validated before registration and re-verified on every dispatch.
- Private IPv4/IPv6 blocks, localhost, 0.0.0.0, and AWS/GCP instance metadata IP (`169.254.169.254`) are rejected immediately with an HTTP 400 error.
- DNS resolution checks block re-binding attacks.

### 2.3 Immutable Version Pointers
- Published listing specs cannot be mutated in place.
- Updates require a new version number and subsequent administrative review.
- Installations are version-pinned; no silent background script replacements can occur.

### 2.4 Credential Isolation
- Marketplace listings never touch plaintext tokens or private keys.
- Tokens reside in AES-256-GCM encrypted `ConnectedAccount` records, isolated by tenant `workspaceId`.
- Community recipes are strictly stripped of all credentials during export and import.
