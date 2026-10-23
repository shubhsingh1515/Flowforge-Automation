# FlowForge Enterprise Integration Developer Platform & Connector SDK

## Overview

Phase 19 introduces a developer-first platform for authoring, testing, certifying, and governing enterprise integrations and custom connectors in FlowForge Automation SaaS.

The platform provides:
1. **Typed Connector Manifest Specification**: A declarative schema format (`ConnectorManifestDTO`) governing connector identity, authentication schemes, actions, triggers, permissions, and residency boundaries.
2. **Local Developer SDK & Test Harness (`@flowforge/connector-sdk`)**: Type-safe builders (`defineConnector`, `defineAction`, `defineTrigger`) and a zero-server contract testing harness (`ConnectorTestHarness`) with secret redaction and latency profiling.
3. **Automated 6-Check Certification Pipeline**: Rigid, server-side pre-publication verification ensuring contract validity, credential safety, SSRF protection, tenant isolation, and cryptographic provenance.
4. **Cryptographic Release Immutability (`artifactHashSha256`)**: Canonicalized SHA-256 artifact hashing preventing review-to-publish hash substitution and unauthorized modifications.
5. **Governed Marketplace & Preflight Upgrades**: In-depth compatibility diffing highlighting breaking changes (removed actions, new required parameters) and requiring explicit administrative acknowledgment before upgrades.
6. **Execution Runtime Security**: Runtime revocation/suspension checks (`CONNECTOR_REVOKED` / `CONNECTOR_SUSPENDED`), SSRF egress validation, and real-time execution telemetry.

---

## Architecture & Lifecycle

```
[ Developer Authoring ]
        │
        ▼
[ Local SDK Contract Testing (ConnectorTestHarness) ]
        │
        ▼
[ Manifest Registration (ConnectorReleaseArtifact: DRAFT) ]
        │
        ▼
[ Automated 6-Check Certification Pipeline ]
   ├── 1. MANIFEST_SCHEMA_VALIDITY
   ├── 2. ACTION_TRIGGER_CONTRACTS
   ├── 3. CREDENTIAL_SAFETY_AND_REDACTION
   ├── 4. SSRF_AND_EGRESS_COMPLIANCE
   ├── 5. TENANT_ISOLATION_AND_RESIDENCY
   └── 6. ARTIFACT_PROVENANCE_INTEGRITY
        │
        ▼
[ Human Security Review (APPROVE / REJECT) ]
        │
        ▼
[ Marketplace Publication with Immutable SHA-256 Verification ]
        │
        ▼
[ Governed Installation & Preflight Upgrade Diffing ]
        │
        ▼
[ Secure Node Runtime (SSRF Guard + Revocation Check) ]
```

---

## 1. Typed Connector Manifest Contract

Manifests adhere to `ConnectorManifestSchema` defined in `@flowforge/shared` and `@flowforge/connector-sdk`:

```typescript
import { defineConnector, defineAction } from "@flowforge/connector-sdk";

export const acmeConnector = defineConnector({
  id: "acme-crm",
  name: "Acme CRM Enterprise",
  version: "1.0.0",
  description: "Enterprise CRM connector for contacts, deals, and activities.",
  category: "CRM & Sales",
  author: {
    name: "Acme Platforms",
    email: "developers@acme.com",
    url: "https://developers.acme.com",
  },
  icon: "Puzzle",
  auth: {
    type: "API_KEY",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        description: "Your Acme account API key from settings",
      },
    ],
  },
  actions: [
    defineAction({
      id: "get-contact",
      name: "Get Contact",
      description: "Retrieves a contact record by email address",
      inputSchema: {
        email: { type: "string", required: true },
      },
      outputSchema: {
        id: { type: "string" },
        email: { type: "string" },
        name: { type: "string" },
      },
      httpConfig: {
        method: "GET",
        urlTemplate: "https://api.acme.com/v1/contacts?email={email}",
        timeoutMs: 5000,
      },
    }),
  ],
  triggers: [],
  permissions: ["network:egress"],
  residencyConstraint: "GLOBAL",
});
```

---

## 2. Local Testing Harness (`ConnectorTestHarness`)

Developers can run contract tests locally without a running FlowForge server:

```typescript
import { ConnectorTestHarness } from "@flowforge/connector-sdk";
import { acmeConnector } from "./manifest";

const harness = new ConnectorTestHarness(acmeConnector);

// 1. Static Contract & SSRF Inspection
const contract = harness.validateContract();
console.log("Is Valid:", contract.valid); // true

// 2. Action Execution & Secret Leakage Check
const result = await harness.executeAction("get-contact", {
  input: { email: "alex@example.com" },
  credentials: { apiKey: "secret_live_key_9999" },
  mockResponse: {
    status: 200,
    body: { id: "cnt_123", email: "alex@example.com", name: "Alex" },
  },
});

console.log("Success:", result.ok);
console.log("Latency (ms):", result.durationMs);
console.log("Secret Leak Detected:", result.secretLeakDetected); // false
```

---

## 3. The 6-Check Certification Pipeline

When a developer submits an artifact (`POST /api/v1/connectors/:id/certify`), the server executes 6 deterministic checks:

| Check Name | Purpose | Invariant Enforced |
|---|---|---|
| `MANIFEST_SCHEMA_VALIDITY` | Schema validation | Conforms strictly to `ConnectorManifestSchema` |
| `ACTION_TRIGGER_CONTRACTS` | Functional contracts | Valid IDs, descriptions, and parameter contracts |
| `CREDENTIAL_SAFETY_AND_REDACTION` | Secret safety | Passwords/keys must have `type: 'password'`, no hardcoded tokens in templates |
| `SSRF_AND_EGRESS_COMPLIANCE` | Network security | Blocks loopbacks (`127.0.0.1`, `localhost`), internal RFC 1918 subnets, and AWS/cloud metadata (`169.254.169.254`) |
| `TENANT_ISOLATION_AND_RESIDENCY` | Permission boundaries | Disallows elevated scopes (`system:root`, `admin:all`, `db:raw`) and validates residency |
| `ARTIFACT_PROVENANCE_INTEGRITY` | Anti-tamper verification | Canonical SHA-256 hash matches the computed hash of the submitted manifest |

---

## 4. Cryptographic Immutability & Hash Verification

The server computes a canonical SHA-256 checksum across sorted keys of the manifest:

$$\text{artifactHashSha256} = \text{SHA-256}(\text{canonicalJson}(\text{manifest}))$$

At publication time (`POST /api/v1/connectors/:id/publish`), the server:
1. Recomputes the canonical SHA-256 from the manifest to detect in-database tampering.
2. If `expectedArtifactHashSha256` is provided by the client, ensures exact match. Mismatches abort with `422 Unprocessable Entity (ARTIFACT_HASH_MISMATCH)`.
3. Sets `status = "PUBLISHED"` and locks the release from any future modifications.

---

## 5. Governed Upgrades & Rollbacks

FlowForge inspects the structural difference between the currently installed version and the target release (`POST /api/v1/connectors/:id/upgrade-preflight`):
- **Removed Actions / Triggers**: Flagged as `BREAKING`.
- **New Required Input Parameters**: Flagged as `BREAKING`.
- **New Requested Permissions**: Flagged as `WARNING`.

If breaking changes are detected, `POST /api/v1/connectors/installations/:id/upgrade` requires `acknowledgeBreakingChanges: true`. Otherwise, the upgrade is blocked with `400 Bad Request (UNACKNOWLEDGED_BREAKING_CHANGES)`.

If issues occur post-upgrade, administrators can execute `POST /api/v1/connectors/installations/:id/rollback` to immediately revert the installation to the prior certified artifact.

---

## 6. Secure Execution Runtime & Emergency Controls

At execution time, `customIntegrationNodeHandler`:
- Checks if the connector release artifact is `REVOKED` or `SUSPENDED`.
- If revoked, execution fails immediately with `errorCategory: "CONNECTOR_REVOKED"`.
- If suspended, execution fails immediately with `errorCategory: "CONNECTOR_SUSPENDED"`.
- Enforces egress SSRF check via `validateUrlForSsrf` and bounded timeout (max 30s).
- Redacts credential values from execution outputs and logs.
- Emits execution telemetry metrics (`ConnectorExecutionMetric`) recording latency, status, and error categories.
