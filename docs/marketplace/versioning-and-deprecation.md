# Integration Versioning, Upgrades, and Deprecation

## 1. Immutability Principle

Once an integration version is published (`reviewStatus = PUBLISHED`), its `specDefinition`, authentication requirements, and supported actions schema become **immutable**.

Updates to an integration must be released as a new version number (e.g., version `1` -> version `2`). This guarantees that active workflows running against version `1` are never broken by upstream modifications.

---

## 2. Workspace Installation Version Pinning

When a workspace installs an integration, the installation record captures:
- `installedVersion`: The specific version number chosen at installation time.
- `autoUpdate`: Configurable boolean (defaults to `false` for enterprise safety).

Workflows using the integration node resolve the connector definition corresponding to `installedVersion`.

---

## 3. Deprecation Lifecycle

When a service provider retires an API or an integration package is superseded:

1. Platform or workspace administrators invoke `POST /api/v1/marketplace/listings/:id/deprecate`:
   ```json
   {
     "notice": "Version 1 uses deprecated v1 endpoints. Please upgrade to Version 2 by Dec 31."
   }
   ```
2. The listing `reviewStatus` transitions to `DEPRECATED`.
3. In the marketplace UI:
   - Deprecation badges and amber alert banners appear on listing cards.
   - The listing is excluded from default search recommendations.
4. Active installations:
   - Existing workflows continue to function without interruption.
   - In-app configuration drawers display deprecation notices with links to the migration guide.
