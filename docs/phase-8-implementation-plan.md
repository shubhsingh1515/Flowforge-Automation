# FlowForge Automation SaaS — Phase 8 Implementation Plan
## Public API, Developer Platform, API Keys, Custom Integrations, Outbound Webhooks, and Developer Experience

### 1. Executive Summary & Objectives
Phase 8 transforms FlowForge from a workflow automation platform with fixed built-in integrations into a developer-first, programmable platform. It provides:
1. **Workspace-Scoped API Keys**: Secure high-entropy tokens (`ffk_live_...`), SHA-256 verifiers, granular scopes, expiration, rotation, and one-time secret disclosure.
2. **Versioned Public REST API (`/api/v1`)**: Unified authentication (JWT session or API key), scope-based authorization, OpenAPI 3.0 specification (`/api/v1/docs`), and programmatic endpoints for workflows, executions, templates, connections metadata, and workspace info.
3. **Reliable Outbound Webhooks**: Asynchronous event dispatch queue in BullMQ (`outbound-webhooks`), durable delivery attempt logging in PostgreSQL (`WebhookDelivery`), HMAC-SHA256 signature verification (`X-FlowForge-Signature`), bounded retries with exponential backoff, and hardened SSRF protection.
4. **Declarative Custom Integration Framework**: Safe, bounded extension model for defining custom HTTP actions with typed input/output schemas, template interpolation, test execution runner, and immutable published versions.
5. **Developer Experience & Tooling**: In-app developer portal in Settings, OpenAPI explorer, comprehensive technical documentation, and copy-ready curl examples.
6. **Billing & Entitlements**: Server-authoritative plan quotas (`maxApiKeys`, `maxOutboundWebhooks`, `maxCustomIntegrations`) integrated into existing subscription tiers.

---

### 2. Baseline Status & Verification
- **Vitest Integration Suite**: 139 passed / 139 total (100%) across 7 test suites.
- **Playwright Browser Smoke Suite**: 36 passed / 36 total (100%) across Desktop Chrome & Mobile Chrome.
- **Active Daemons**:
  - `task-465`: Docker PostgreSQL & Redis backend
  - `task-2486`: API server daemon (port 4000)
  - `task-2894`: Next.js web application daemon (port 3000)

---

### 3. Architecture & Data Model Design (`schema.prisma`)

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  name        String
  keyPrefix   String    // e.g. "ffk_live_abcd"
  keyHash     String    @unique // SHA-256 hash of secret token
  workspaceId String
  createdById String
  scopes      String[]  @default([])
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([keyPrefix])
  @@map("api_keys")
}

model OutboundWebhook {
  id          String   @id @default(uuid())
  workspaceId String
  name        String
  url         String
  secret      String   // HMAC-SHA256 signing secret
  events      String[] // ["workflow.created", "execution.succeeded", ...]
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace  Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deliveries WebhookDelivery[]

  @@index([workspaceId, active])
  @@map("outbound_webhooks")
}

model WebhookDelivery {
  id           String    @id @default(uuid())
  webhookId    String
  workspaceId  String
  eventId      String
  eventType    String
  payload      Json
  status       String    @default("PENDING") // PENDING, SUCCESS, FAILED
  statusCode   Int?
  responseBody String?   // Bounded (max 1024 chars)
  errorMessage String?
  attempt      Int       @default(1)
  maxAttempts  Int       @default(3)
  durationMs   Int?
  nextRetryAt  DateTime?
  deliveredAt  DateTime?
  createdAt    DateTime  @default(now())

  webhook OutboundWebhook @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  @@index([webhookId, status])
  @@index([workspaceId, createdAt])
  @@index([eventId])
  @@map("webhook_deliveries")
}

model CustomIntegration {
  id             String   @id @default(uuid())
  workspaceId    String
  key            String   // unique slug per workspace
  name           String
  description    String?
  category       String   @default("Custom")
  status         String   @default("DRAFT") // DRAFT, PUBLISHED, DEPRECATED
  currentVersion Int      @default(1)
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  workspace Workspace                  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  versions  CustomIntegrationVersion[]

  @@unique([workspaceId, key])
  @@index([workspaceId])
  @@map("custom_integrations")
}

model CustomIntegrationVersion {
  id            String   @id @default(uuid())
  integrationId String
  version       Int      @default(1)
  definition    Json     // Actions, schemas, HTTP config
  status        String   @default("DRAFT") // DRAFT, PUBLISHED
  createdAt     DateTime @default(now())

  integration CustomIntegration @relation(fields: [integrationId], references: [id], onDelete: Cascade)

  @@unique([integrationId, version])
  @@map("custom_integration_versions")
}

model WorkspaceAuditLog {
  id          String   @id @default(uuid())
  workspaceId String
  actorId     String
  actorType   String   // "USER" | "API_KEY"
  action      String   // "api_key.create", "webhook.create", etc.
  targetType  String
  targetId    String
  metadata    Json?
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt])
  @@map("workspace_audit_logs")
}
```

---

### 4. Implementation Steps & Dependency Order

1. **Database Schema & Migrations**:
   - Update `packages/database/prisma/schema.prisma` with `ApiKey`, `OutboundWebhook`, `WebhookDelivery`, `CustomIntegration`, `CustomIntegrationVersion`, and `WorkspaceAuditLog`.
   - Run `npx prisma db push` and `npx prisma generate`.
2. **Shared Package Extensions (`@flowforge/shared`)**:
   - Update `packages/shared/src/plans.ts` with developer platform quotas (`maxApiKeys`, `maxOutboundWebhooks`, `maxCustomIntegrations`).
   - Add API key scope constants and validation schemas.
   - Rebuild shared package.
3. **API Key Authentication & Scopes Plugin (`apps/api`)**:
   - Enhance `apps/api/src/plugins/auth.ts` to support both JWT Bearer tokens and API key Bearer/X-API-Key headers.
   - Implement `requireScope(scope)` guard.
   - Implement `ApiKeyService` for key generation, hashing, verification, rotation, and revocation.
4. **Outbound Webhook System**:
   - Implement `apps/api/src/services/outboundWebhooks.ts`: subscription CRUD, event emission, and HMAC-SHA256 signature generation.
   - Implement BullMQ queue & worker: `apps/api/src/worker/outboundWebhookQueue.ts` and `apps/api/src/worker/outboundWebhookWorker.ts`.
   - Implement SSRF-safe HTTP delivery with redirect rejection, private IP filtering, timeouts, and delivery record persistence.
   - Wire event emission into real platform events (workflows, executions, approvals).
5. **Declarative Custom Integration System**:
   - Implement `apps/api/src/services/customIntegrations.ts`: integration CRUD, draft definition editing, schema validation, and immutable version publishing.
   - Implement test runner endpoint allowing sample input execution against configured HTTP actions.
   - Adapt custom integrations into node runner.
6. **Public API Endpoints & Routes**:
   - `/api/v1/api-keys`: list, create, rotate, revoke.
   - `/api/v1/outbound-webhooks`: list, create, get, update, delete, rotate secret, deliveries, retry, test ping.
   - `/api/v1/custom-integrations`: list, create, get, update, publish, test.
   - Ensure existing `/workflows`, `/executions`, `/templates`, and `/connections` routes honor API key scopes.
7. **Frontend Developer Platform & Settings Tabs (`apps/web`)**:
   - Add `api.apiKeys.*`, `api.webhooks.*`, and `api.customIntegrations.*` to `apps/web/src/lib/api.ts`.
   - Update `apps/web/src/app/settings/page.tsx` with "API Keys", "Webhooks", and "Custom Integrations" tabs.
   - Display one-time secret modals with copy buttons.
8. **Automated Testing Suite**:
   - `apps/api/test/phase8.test.ts` with comprehensive unit and integration tests.
   - `e2e/smoke.spec.ts` with browser smoke tests for API keys, webhooks, and custom integrations.
9. **Documentation**:
   - `docs/developer/public-api.md`
   - `docs/developer/api-authentication.md`
   - `docs/developer/api-key-scopes.md`
   - `docs/developer/outbound-webhooks.md`
   - `docs/developer/webhook-signature-verification.md`
   - `docs/developer/custom-integrations.md`
   - `docs/developer/api-errors-and-pagination.md`
   - `docs/security/phase-8-threat-model.md`
   - `docs/operations/outbound-webhook-operations.md`
   - `docs/phase-8-completion-report.md`
10. **Final Verification & Artifact**:
    - Run `npm test` and `npx playwright test`.
    - Generate conversation completion report artifact.
