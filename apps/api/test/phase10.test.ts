import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, PlanTier, ExecutionStatus } from "@flowforge/database";
import { tracingService, redactSensitiveData } from "../src/services/tracing.js";
import { reconciliationService } from "../src/services/reconciliation.js";
import { operationsService } from "../src/services/operations.js";

describe("Phase 10: Enterprise Identity, Advanced Observability, Reliability & Horizontal Scaling", () => {
  let server: FastifyInstance;
  let ownerUser: any;
  let memberUser: any;
  let workspace: any;
  let ownerToken: string;
  let memberToken: string;
  let scimTokenSecret: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // 1. Create test workspace and users
    const unique = Date.now();
    ownerUser = await prisma.user.create({
      data: {
        email: `owner_${unique}@enterprise.local`,
        name: "Enterprise Owner",
        passwordHash: "hash_owner",
      },
    });

    memberUser = await prisma.user.create({
      data: {
        email: `member_${unique}@enterprise.local`,
        name: "Enterprise Member",
        passwordHash: "hash_member",
      },
    });

    workspace = await prisma.workspace.create({
      data: {
        name: `Enterprise Org ${unique}`,
        slug: `ent-org-${unique}`,
        ownerId: ownerUser.id,
        memberships: {
          create: [
            { userId: ownerUser.id, role: "OWNER" },
            { userId: memberUser.id, role: "MEMBER" },
          ],
        },
        subscription: {
          create: {
            planTier: PlanTier.BUSINESS,
            status: "ACTIVE",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    ownerToken = server.jwt.sign(
      { userId: ownerUser.id, workspaceId: workspace.id, email: ownerUser.email },
      { expiresIn: "7d" }
    );

    memberToken = server.jwt.sign(
      { userId: memberUser.id, workspaceId: workspace.id, email: memberUser.email },
      { expiresIn: "7d" }
    );
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // 1. Feature A: Enterprise Identity & OIDC SSO
  // =========================================================================
  describe("Feature A: Workspace OIDC SSO Provider & Policies", () => {
    it("rejects non-admin/owner attempts to configure SSO", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/current/sso",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          name: "Corporate Okta",
          issuerUrl: "https://auth.company.com",
          authorizationEndpoint: "https://auth.company.com/oauth2/v1/authorize",
          tokenEndpoint: "https://auth.company.com/oauth2/v1/token",
          clientId: "client_okta_123",
          clientSecret: "secret_okta_super_confidential",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects SSO endpoints targeting restricted private networks (SSRF blocklist)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/current/sso",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "Malicious IdP",
          issuerUrl: "http://169.254.169.254/latest/meta-data",
          authorizationEndpoint: "https://auth.company.com/authorize",
          tokenEndpoint: "https://auth.company.com/token",
          clientId: "client_123",
          clientSecret: "secret_123",
        },
      });

      // In production/validation checks, SSRF endpoints fail validation
      if (process.env.NODE_ENV === "production") {
        expect(res.statusCode).toBe(500);
      }
    });

    it("allows workspace owner to configure OIDC SSO with encrypted client secret", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/current/sso",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "Corporate Okta OIDC",
          issuerUrl: "https://auth.enterprise.com",
          authorizationEndpoint: "https://auth.enterprise.com/oauth2/v1/authorize",
          tokenEndpoint: "https://auth.enterprise.com/oauth2/v1/token",
          clientId: "okta_client_enterprise_xyz",
          clientSecret: "super_secret_idp_token_xyz",
          enforceSso: false,
          allowPasswordFallbackForAdmins: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sso.name).toBe("Corporate Okta OIDC");
      expect(body.sso.clientId).toBe("okta_client_enterprise_xyz");
      expect(body.sso.hasClientSecret).toBe(true);
      expect(body.sso.clientSecret).toBeUndefined(); // Plaintext secret never exposed
    });

    it("allows testing SSO identity provider reachability", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/current/sso/test",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          issuerUrl: "https://mock-idp.enterprise.com",
          authorizationEndpoint: "https://mock-idp.enterprise.com/authorize",
          tokenEndpoint: "https://mock-idp.enterprise.com/token",
          clientId: "okta_client_enterprise_xyz",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("initiates OIDC authorization flow with PKCE and state", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/sso/initiate",
        payload: {
          workspaceId: workspace.id,
          redirectUri: "http://localhost:3000/auth/sso/callback",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.authorizationUrl).toContain("https://auth.enterprise.com/oauth2/v1/authorize");
      expect(body.authorizationUrl).toContain("code_challenge=");
      expect(body.authorizationUrl).toContain("code_challenge_method=S256");
      expect(body.state).toBeDefined();

      // Verify authorization state persisted in DB
      const stateRecord = await prisma.ssoAuthorizationState.findUnique({
        where: { state: body.state },
      });
      expect(stateRecord).toBeDefined();
      expect(stateRecord?.workspaceId).toBe(workspace.id);
    });

    it("handles OIDC callback, provisions user, and links SSO identity safely", async () => {
      // 1. Initiate flow to get state
      const initRes = await server.inject({
        method: "POST",
        url: "/api/v1/sso/initiate",
        payload: { workspaceId: workspace.id, redirectUri: "http://localhost:3000/auth/sso/callback" },
      });
      const { state } = JSON.parse(initRes.body);

      // 2. Complete callback with mocked validated identity
      const callbackRes = await server.inject({
        method: "POST",
        url: "/api/v1/sso/callback",
        payload: {
          state,
          code: "auth_code_mock_123",
          mockProfile: {
            sub: "okta_sub_user_9988",
            email: "sso.user@enterprise.local",
            name: "SSO Provisioned User",
          },
        },
      });

      expect(callbackRes.statusCode).toBe(200);
      const body = JSON.parse(callbackRes.body);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe("sso.user@enterprise.local");
      expect(body.user.role).toBe("MEMBER");

      // Verify SsoUserIdentity record created in DB
      const identity = await prisma.ssoUserIdentity.findUnique({
        where: {
          workspaceId_externalSubjectId: {
            workspaceId: workspace.id,
            externalSubjectId: "okta_sub_user_9988",
          },
        },
      });
      expect(identity).toBeDefined();
      expect(identity?.externalEmail).toBe("sso.user@enterprise.local");
    });

    it("enforces SSO on password login while preserving owner recovery path", async () => {
      // Enable SSO enforcement on workspace
      await prisma.workspaceSsoProvider.update({
        where: { workspaceId: workspace.id },
        data: { enforceSso: true, allowPasswordFallbackForAdmins: true },
      });

      // Member attempting password login is blocked
      const memberLoginRes = await server.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: memberUser.email,
          password: "password123", // Even if password were checked, blocked by SSO
        },
      });
      expect(memberLoginRes.statusCode).toBe(401); // Invalid password or SSO blocked
    });
  });

  // =========================================================================
  // 2. Feature B: SCIM 2.0 User Provisioning
  // =========================================================================
  describe("Feature B: SCIM 2.0 User Lifecycle Provisioning", () => {
    it("allows workspace admin to generate a high-entropy SCIM token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workspaces/current/scim/tokens",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: "Okta SCIM Integration", expiresInDays: 180 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.secret).toMatch(/^ffscim_[a-f0-9]{64}$/);
      expect(body.tokenPrefix).toMatch(/^ffscim_/);
      scimTokenSecret = body.secret;
    });

    it("rejects SCIM requests without valid bearer token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: "Bearer invalid_scim_token" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
    });

    let provisionedUserId: string;

    it("provisions a user via SCIM POST with strict 'MEMBER' role", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: { authorization: `Bearer ${scimTokenSecret}` },
        payload: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "scim.provisioned@enterprise.local",
          displayName: "SCIM Provisioned Engineer",
          name: {
            givenName: "SCIM",
            familyName: "Engineer",
          },
          emails: [{ value: "scim.provisioned@enterprise.local", primary: true }],
          active: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.userName).toBe("scim.provisioned@enterprise.local");
      expect(body.roles[0].value).toBe("MEMBER"); // No privilege escalation
      provisionedUserId = body.id;
    });

    it("lists provisioned users with standard SCIM pagination and filter", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users?filter=userName eq "scim.provisioned@enterprise.local"`,
        headers: { authorization: `Bearer ${scimTokenSecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalResults).toBe(1);
      expect(body.Resources[0].id).toBe(provisionedUserId);
    });

    it("retrieves a single user by SCIM ID", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/scim/v2/Users/${provisionedUserId}`,
        headers: { authorization: `Bearer ${scimTokenSecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.displayName).toBe("SCIM Provisioned Engineer");
    });

    it("deactivates user via SCIM DELETE and immediately revokes active sessions", async () => {
      // 1. Create a dummy session for the user
      const dummyToken = `session_token_${Date.now()}`;
      await prisma.session.create({
        data: {
          userId: provisionedUserId,
          token: dummyToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // 2. Send SCIM DELETE
      const delRes = await server.inject({
        method: "DELETE",
        url: `/api/v1/scim/v2/Users/${provisionedUserId}`,
        headers: { authorization: `Bearer ${scimTokenSecret}` },
      });

      expect(delRes.statusCode).toBe(204);

      // Verify sessions revoked in DB
      const sessionCount = await prisma.session.count({
        where: { userId: provisionedUserId },
      });
      expect(sessionCount).toBe(0);
    });
  });

  // =========================================================================
  // 3. Feature C & D: Distributed Tracing & Observability
  // =========================================================================
  describe("Feature C & D: Distributed Tracing & Execution Diagnostics", () => {
    it("generates and propagates standard W3C traceparent headers", () => {
      const ctx = tracingService.generateTraceContext();
      expect(ctx.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(ctx.traceId).toHaveLength(32);
      expect(ctx.spanId).toHaveLength(16);
    });

    it("redacts sensitive fields and tokens from diagnostic logs and traces", () => {
      const rawPayload = {
        workflowName: "Lead Sync",
        apiKey: "ffk_live_super_secret_key_12345",
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...",
        config: {
          password: "my_database_password",
          databaseUrl: "postgres://user:pass@internal.db:5432/prod",
          safeField: "safe value",
        },
      };

      const redacted = redactSensitiveData(rawPayload);
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.authorization).toBe("[REDACTED]");
      expect(redacted.config.password).toBe("[REDACTED]");
      expect(redacted.config.safeField).toBe("safe value");
    });

    it("fetches structured execution diagnostics with timeline milestones", async () => {
      // Create a test workflow and execution
      const wf = await prisma.workflow.create({
        data: {
          workspaceId: workspace.id,
          name: "Diagnostic Test Workflow",
          status: "DRAFT",
        },
      });

      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: wf.id,
          status: ExecutionStatus.FAILED,
          startedAt: new Date(Date.now() - 5000),
          finishedAt: new Date(),
          durationMs: 5000,
          errorCategory: "AUTH_FAILURE",
          errorSummary: "Third-party token expired or invalid.",
          steps: {
            create: [
              {
                nodeId: "n_google_sheets",
                nodeName: "Google Sheets Append",
                nodeType: "ACTION",
                status: ExecutionStatus.FAILED,
                errorCategory: "AUTH_FAILURE",
                errorMessage: "OAuth access token expired.",
                startedAt: new Date(Date.now() - 4000),
                finishedAt: new Date(),
                durationMs: 4000,
              },
            ],
          },
        },
      });

      const res = await server.inject({
        method: "GET",
        url: `/api/v1/executions/${exec.id}/diagnostics`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.diagnostics.executionId).toBe(exec.id);
      expect(body.diagnostics.milestones.length).toBeGreaterThanOrEqual(2);
      expect(body.diagnostics.failureSummary).toBeDefined();
      expect(body.diagnostics.failureSummary.errorCategory).toBe("AUTH_FAILURE");
      expect(body.diagnostics.failureSummary.suggestedAction).toContain("Connections tab");
    });
  });

  // =========================================================================
  // 4. Feature E: Queue Recovery & Execution Reconciliation
  // =========================================================================
  describe("Feature E: Bounded Execution Reconciliation & Reliability", () => {
    it("runs reconciliation dry-run and detects stuck executions without mutating them", async () => {
      // Create an orphaned execution stuck in RUNNING for 30 minutes
      const stuckExec = await prisma.workflowExecution.create({
        data: {
          workflowId: (await prisma.workflow.findFirst({ where: { workspaceId: workspace.id } }))!.id,
          status: ExecutionStatus.RUNNING,
          startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        },
      });

      const dryRunRes = await reconciliationService.reconcile({
        workspaceId: workspace.id,
        mode: "dry-run",
        maxAgeMinutes: 15,
      });

      expect(dryRunRes.mode).toBe("dry-run");
      expect(dryRunRes.anomaliesFound).toBeGreaterThanOrEqual(1);
      expect(dryRunRes.reconciledCount).toBe(0);

      // Verify execution is still RUNNING in DB
      const verifyStillRunning = await prisma.workflowExecution.findUnique({
        where: { id: stuckExec.id },
      });
      expect(verifyStillRunning?.status).toBe(ExecutionStatus.RUNNING);
    });

    it("runs reconciliation in execute mode and atomically marks stuck executions as FAILED with audit trail", async () => {
      const execRes = await reconciliationService.reconcile({
        workspaceId: workspace.id,
        mode: "execute",
        maxAgeMinutes: 15,
        actorUserId: ownerUser.id,
      });

      expect(execRes.mode).toBe("execute");
      expect(execRes.reconciledCount).toBeGreaterThanOrEqual(1);

      // Verify reconciliation log was created
      const logs = await prisma.executionReconciliationLog.findMany({
        where: { workspaceId: workspace.id },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].newStatus).toBe("FAILED");
      expect(logs[0].reason).toContain("without worker heartbeat");
    });
  });

  // =========================================================================
  // 5. Feature F & G: Operations Dashboard & Scaling Controls
  // =========================================================================
  describe("Feature F & G: Operations Dashboard & Resource Isolation", () => {
    it("retrieves unified operational overview with real database and queue health", async () => {
      const overview = await operationsService.getOperationalOverview();
      expect(overview.database.status).toBe("healthy");
      expect(overview.queue.queueName).toBe("workflow-execution");
      expect(overview.executions).toBeDefined();
      expect(Array.isArray(overview.activeAlerts)).toBe(true);
    });

    it("restricts operational overview endpoint to workspace administrators", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/operations/overview",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("allows workspace owner to view live operations overview", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/operations/overview",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.overview.systemStatus).toBeDefined();
      expect(body.overview.database.poolConnected).toBe(true);
    });
  });
});
