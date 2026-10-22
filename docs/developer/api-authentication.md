# FlowForge API Authentication & Key Security

This document details the security architecture, token lifecycles, and cryptographic standards governing programmatic authentication in FlowForge Automation.

---

## 1. Token Formats & Cryptographic Verification

FlowForge issues cryptographic workspace API keys adhering to modern security best practices:

- **Format**: `ffk_live_<32_random_hex_characters>` (e.g. `ffk_live_4a89fb314d...`)
- **Key Prefix**: `ffk_live_` prefix followed by the first 8 characters, exposed in listing tables for user identification (e.g. `ffk_live_4a89fb31...`).
- **Storage Standard**: Plaintext API key secrets are **NEVER** stored in the database. When created, a key is hashed using **SHA-256** (`crypto.createHash("sha256").update(secret).digest("hex")`). Only the cryptographic hash is stored in `ApiKey.keyHash`.
- **One-Time Secret Presentation**: The full secret is rendered exactly once upon generation. FlowForge cannot retrieve or recover the secret afterwards.

---

## 2. Using API Keys

API keys can be supplied via either of the following HTTP request headers:

### Option A: Standard Bearer Token
```http
GET /api/v1/workflows HTTP/1.1
Host: api.flowforge.com
Authorization: Bearer ffk_live_0123456789abcdef0123456789abcdef
```

### Option B: Custom Header
```http
GET /api/v1/workflows HTTP/1.1
Host: api.flowforge.com
X-API-Key: ffk_live_0123456789abcdef0123456789abcdef
```

---

## 3. Key Rotation & Revocation

### Zero-Downtime Rotation
To rotate an API key without service interruption:
1. Call `POST /api/v1/api-keys/:id/rotate` with an active user session.
2. The old key is immediately marked with `revokedAt = now()`.
3. A new cryptographic token is returned in the response secret field.
4. Deploy the new token to your caller service.

### Immediate Revocation
To revoke a compromised key immediately:
- Call `DELETE /api/v1/api-keys/:id` or click **Revoke** in the Settings UI.
- All subsequent calls using that token fail immediately with `HTTP 401 Unauthorized`.

---

## 4. Metadata Protection & Privilege Boundaries

- **No Privilege Escalation**: Programmatic API keys are strictly forbidden from creating other API keys (`POST /api/v1/api-keys` returns `403 Forbidden`). Only human users with active workspace sessions can create or rotate API keys.
- **Tenant Isolation**: An API key is strictly scoped to `workspaceId`. Attempting to access resources belonging to another workspace returns `404 Not Found`.
- **Data Protection**: API key requests to workspace endpoints (e.g., `GET /workspaces/current`) will omit member personally identifiable information (PII) such as teammate names and email addresses.
