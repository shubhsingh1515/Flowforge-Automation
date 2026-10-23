# SCIM 2.0 Automated User Provisioning Architecture & Guide

## 1. Overview
FlowForge provides full support for **RFC 7643 / RFC 7644 SCIM 2.0 (System for Cross-domain Identity Management)**, enabling automated employee lifecycle synchronization from corporate identity providers.

### Capabilities:
- **Just-in-Time & Ahead-of-Time Provisioning**: Automatically create accounts for onboarded employees.
- **Profile Synchronization**: Synchronize given name, family name, and display name.
- **Deactivation & Deprovisioning**: When an employee is deactivated or unassigned in Okta/Azure AD, their FlowForge membership is immediately deactivated (`active = false`) and **all active sessions and JWTs are revoked instantly**.
- **Role Boundary**: All SCIM-provisioned accounts default strictly to `MEMBER` to prevent automated privilege escalation to `ADMIN` or `OWNER`.

---

## 2. Authentication & Token Management

SCIM endpoints require a workspace-scoped bearer token:
- **Prefix**: `ffscim_` (high entropy, 32 bytes random hex).
- **Storage**: SHA-256 hashed in `ScimProvisioningToken.tokenHash`. The raw token is displayed exactly once upon generation.
- **Expiration**: Configurable duration (30, 90, 180, or 365 days).
- **Revocation**: Workspace admins can revoke any token immediately from **Settings > SCIM Provisioning**.

---

## 3. Supported SCIM 2.0 Endpoints

Base URL: `https://your-flowforge-domain.com/api/v1/scim/v2`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/scim/v2/Users` | Query users with pagination (`startIndex`, `count`) and filtering (`filter=userName eq "user@example.com"` or `filter=email eq "..."`). |
| `POST` | `/scim/v2/Users` | Create a new user account, link to workspace as `MEMBER`, and return 201 Created with standard SCIM User schema. |
| `GET` | `/scim/v2/Users/:id` | Fetch specific SCIM User record by FlowForge user ID. |
| `PUT` | `/scim/v2/Users/:id` | Replace user attributes (name, active status). |
| `PATCH` | `/scim/v2/Users/:id` | Partial update (e.g., deactivation via `Operations: [{ op: "replace", path: "active", value: false }]`). |
| `DELETE`| `/scim/v2/Users/:id` | Deprovision user from workspace and revoke all active sessions. |

---

## 4. Immediate Session Revocation on Deprovisioning
When a user is deactivated or deleted via SCIM:
1. `sessionService.revokeAllUserSessions(userId, workspaceId)` is invoked synchronously.
2. All entries in the database `Session` table matching `userId` are marked `revoked: true`.
3. In-flight requests presenting the revoked JWT or cookie are rejected immediately on their next call.

---

## 5. Setup Guide: Okta SCIM Integration

1. Go to **Settings > SCIM Provisioning** in FlowForge.
2. Click **Generate Provisioning Token**, enter a descriptive name (e.g., `Okta Production`), and copy the `ffscim_...` token.
3. In Okta Admin Console, navigate to the FlowForge App > **Provisioning > Integration**.
4. Enable **SCIM Integration**.
5. Set **SCIM connector base URL**: `https://your-flowforge-domain.com/api/v1/scim/v2`.
6. Set **Unique identifier field for users**: `userName` or `email`.
7. Set **Authentication Mode**: `HTTP Header` / `Bearer Token` and paste the token.
8. Click **Test Connector Credentials** and save.
