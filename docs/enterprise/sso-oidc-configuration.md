# Enterprise Single Sign-On (OIDC / OAuth 2.0) Architecture & Configuration

## 1. Overview
FlowForge Enterprise SSO enables organizations to authenticate team members via OpenID Connect (OIDC) identity providers, including:
- **Okta**
- **Microsoft Entra ID (Azure AD)**
- **Google Workspace / Cloud Identity**
- **PingFederate / PingIdentity**
- **Keycloak**
- **Auth0**

SSO is scoped at the **workspace** level, ensuring complete tenant isolation and autonomous configuration per enterprise customer.

---

## 2. Protocol & Security Architecture

### PKCE (Proof Key for Code Exchange)
FlowForge enforces **RFC 7636 PKCE** with `S256` code challenge generation:
1. When authentication begins, a cryptographically random `code_verifier` (43–128 characters) is generated.
2. The SHA-256 hash of the verifier is computed and base64url-encoded to produce the `code_challenge`.
3. An ephemeral `SsoAuthorizationState` record is stored with a 10-minute expiration containing:
   - State nonce (32 bytes high entropy)
   - Code verifier
   - Workspace ID
   - Post-login return URL

### Secret Protection & AES-256-GCM Encryption
- The IdP client secret is encrypted at rest using AES-256-GCM authenticated encryption before persisting in `WorkspaceSsoProvider.clientSecretEncrypted`.
- Client secrets are never returned over any API response or logged.
- The UI displays an encrypted status indicator (`••••••••`) rather than exposing plaintext.

### SSRF Protection
Identity provider endpoints (`issuerUrl`, `authorizationUrl`, `tokenUrl`, `userinfoUrl`) undergo strict validation:
- Scheme must be `https:` (or `http://localhost` for approved local dev/test fixtures).
- Cloud metadata IP addresses (`169.254.169.254`, `169.254.170.2`), link-local ranges, loopbacks, and RFC 1918 private subnets are strictly disallowed in production.

---

## 3. Account Linking & SSO Enforcement

### Safe Account Linking
1. If an incoming IdP email matches an existing user:
   - If the user is already a member of the workspace, their identity is linked (`SsoUserIdentity`).
   - If the user exists but is not in the workspace, they are provisioned as a `MEMBER`.
2. New users provisioned via SSO are created with randomized 32-character high-entropy passwords, email marked verified, and enrolled in the target workspace.

### Enforce SSO & Break-Glass Emergency Recovery
Workspaces can toggle `enforceSso: true`. When enabled:
- Non-owner members attempting password login receive HTTP 403 (`SSO_ENFORCED`) and are redirected to authenticate via their IdP.
- **Break-Glass Owner Fallback:** The designated workspace `OWNER` always retains direct password authentication to guarantee access in the event of an upstream IdP outage, expired certificates, or misconfiguration.

---

## 4. Setup Guide: Okta OIDC

1. In the Okta Admin Console, navigate to **Applications > Create App Integration > OIDC - OpenID Connect > Web Application**.
2. Set Sign-in redirect URIs: `https://your-flowforge-domain.com/api/v1/sso/callback`.
3. Copy the **Client ID**, **Client Secret**, and **Issuer URL** (`https://dev-xxxx.okta.com`).
4. In FlowForge, go to **Settings > Single Sign-On**.
5. Paste the Issuer URL, Client ID, and Client Secret.
6. Click **Test IdP Connection** to verify metadata discovery (`/.well-known/openid-configuration`).
7. Click **Save SSO Configuration**.
8. Optional: Toggle **Enforce SSO For All Members** once confirmed working.
