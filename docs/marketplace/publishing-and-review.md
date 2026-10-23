# Integration Publishing & Review Workflow

## 1. Overview

FlowForge enforces a strict review lifecycle for all integrations published to the public marketplace. Community developers and workspace operators can package declarative connectors and submit them for review. No unverified third-party integration is discoverable or installable platform-wide without explicit review and approval.

---

## 2. Review Lifecycle State Machine

The review status of every listing is governed by the `ListingReviewStatus` enumeration:

```
[DRAFT] ───► [IN_REVIEW] ───► [PUBLISHED] ───► [DEPRECATED]
                  │
                  ▼
              [REJECTED]
```

1. **`DRAFT`**: The integration is under development by the author. Visible only within the authoring workspace.
2. **`IN_REVIEW`**: The package has been formally submitted. Automated validation checks have passed, and the listing is locked from further mutations pending human review.
3. **`PUBLISHED`**: Approved by platform security and integration review teams. Discoverable platform-wide in the marketplace catalog.
4. **`REJECTED`**: Rejected during automated validation or manual inspection. Accompanied by a detailed `rejectionReason` explaining non-compliance.
5. **`DEPRECATED`**: The listing is flagged as end-of-life or superseded. Existing workspace installations continue to execute, but new installations are discouraged and migration notices are displayed.
6. **`UNPUBLISHED`**: Revoked by administrator or author. Hidden from catalog discovery.

---

## 3. Automated Validation Pipeline

When a developer calls `POST /api/v1/marketplace/listings`, the server executes synchronous structural validation:

1. **Schema Integrity**:
   - `slug`: Must be URL-safe, alphanumeric, lowercase with hyphens (e.g., `acme-lead-enrichment`).
   - `authRequirements`: Must declare valid authentication (`NONE`, `API_KEY`, `BEARER_TOKEN`, `BASIC`, `OAUTH2`).
   - `specDefinition`: Must contain valid JSON describing `baseUrl`, `headers`, and actions dictionary.
2. **SSRF & Egress Protection**:
   - `baseUrl` must resolve to a valid HTTPS URL (or HTTP in local dev).
   - Base URLs pointing to localhost (`127.0.0.1`), link-local AWS metadata (`169.254.169.254`), or private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are strictly rejected.
3. **Workspace Policy Check**:
   - The submitting user's workspace must have `allowMarketplacePublishing: true` in its `WorkspaceGovernancePolicy`.

---

## 4. Moderation & Review Guidelines

Platform administrators review submissions via `POST /api/v1/marketplace/listings/:id/review` with payload `{ decision: "APPROVE" | "REJECT", reason?: string }`:

### Approval Checklist
- [x] Documentation URL points to a legitimate developer portal or API guide.
- [x] Action parameter names and descriptions are clearly phrased and not misleading.
- [x] Payload templates do not exfiltrate sensitive environment parameters.
- [x] Rate limits and endpoint quotas match the provider's official API guidelines.

### Rejection Conditions
- Broken documentation links or non-existent endpoints.
- Base URLs pointing to dynamic DNS redirectors or unauthorized proxy services.
- Misleading titles imitating official brands without authorization.
