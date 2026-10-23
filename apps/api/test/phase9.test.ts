import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";

describe("Phase 9: Integration Marketplace, Community Templates, Governance & Launch Readiness", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let memberToken: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register User A (Workspace A Owner)
    const userAEmail = `phase9_owner_${Date.now()}@example.com`;
    const regARes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 9 Enterprise Owner",
        email: userAEmail,
        password: "Password123!",
        workspaceName: "Acme Enterprise",
      },
    });
    const regABody = JSON.parse(regARes.body);
    userAToken = regABody.token;
    workspaceAId = regABody.user.activeWorkspaceId;
    userAId = regABody.user.id;

    // Register Member in Workspace A
    const memberEmail = `phase9_member_${Date.now()}@example.com`;
    const regMemRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Acme Team Member",
        email: memberEmail,
        password: "Password123!",
        workspaceName: "Member Personal WS",
      },
    });
    const regMemBody = JSON.parse(regMemRes.body);
    const memberUserId = regMemBody.user.id;

    // Add member to Workspace A as MEMBER role
    await prisma.workspaceMembership.create({
      data: {
        workspaceId: workspaceAId,
        userId: memberUserId,
        role: "MEMBER",
      },
    });

    // Generate JWT for member in Workspace A
    memberToken = server.jwt.sign({
      userId: memberUserId,
      workspaceId: workspaceAId,
    });

    // Register User B (Workspace B Owner for tenant boundary checks)
    const userBEmail = `phase9_userb_${Date.now()}@example.com`;
    const regBRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 9 Tenant B",
        email: userBEmail,
        password: "Password123!",
        workspaceName: "Tenant B Ops",
      },
    });
    const regBBody = JSON.parse(regBRes.body);
    userBToken = regBBody.token;
    workspaceBId = regBBody.user.activeWorkspaceId;
  });

  afterAll(async () => {
    await prisma.marketplaceInstallation.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.marketplaceListing.deleteMany({
      where: { publisherWorkspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.workspaceGovernancePolicy.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.workspaceRetentionPolicy.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.dataExportRequest.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.workspaceDeletionRequest.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.workspaceAuditLog.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await server.close();
  });

  // ==========================================
  // 1. Integration Marketplace Catalog & Details
  // ==========================================
  describe("1. Integration Marketplace Discovery & Catalog", () => {
    it("GET /marketplace auto-seeds standard platform integrations", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/marketplace",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const listings = JSON.parse(res.body);
      expect(listings.length).toBeGreaterThanOrEqual(6);

      const slugs = listings.map((l: any) => l.slug);
      expect(slugs).toContain("slack");
      expect(slugs).toContain("google-sheets");
      expect(slugs).toContain("gmail");
      expect(slugs).toContain("google-drive");
      expect(slugs).toContain("webhook");
      expect(slugs).toContain("http-request");
    });

    it("filters marketplace catalog by category", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/marketplace?category=Communication",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const listings = JSON.parse(res.body);
      expect(listings.length).toBeGreaterThanOrEqual(2);
      for (const item of listings) {
        expect(item.category).toBe("Communication");
      }
    });

    it("searches marketplace catalog by search text", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/marketplace?search=spreadsheet",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const listings = JSON.parse(res.body);
      expect(listings.length).toBeGreaterThanOrEqual(1);
      expect(listings[0].slug).toBe("google-sheets");
    });

    it("GET /marketplace/:slug returns detailed capabilities, triggers, and actions", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/marketplace/slack",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const listing = JSON.parse(res.body);
      expect(listing.title).toContain("Slack");
      expect(listing.supportedActions).toContain("send_message");
      expect(listing.authRequirements).toContain("OAuth 2.0");
      expect(listing.isInstalled).toBe(false);
    });
  });

  // ==========================================
  // 2. Installation Lifecycle & Safe Pinning
  // ==========================================
  describe("2. Marketplace Installation Lifecycle & Version Pinning", () => {
    let slackListingId: string;

    beforeAll(async () => {
      const listing = await prisma.marketplaceListing.findUnique({ where: { slug: "slack" } });
      slackListingId = listing!.id;
    });

    it("POST /marketplace/:id/install installs listing pinned to version without activating workflows", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/marketplace/${slackListingId}/install`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { version: 1 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.installation.installedVersion).toBe(1);
      expect(body.installation.status).toBe("ACTIVE");

      // Verify that installation does NOT automatically activate any workflows
      const activeWorkflows = await prisma.workflow.count({
        where: { workspaceId: workspaceAId, status: "ACTIVE" },
      });
      expect(activeWorkflows).toBe(0);

      // Verify listing details now report installed
      const detailRes = await server.inject({
        method: "GET",
        url: `/api/v1/marketplace/slack`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.isInstalled).toBe(true);
      expect(detail.installedVersion).toBe(1);
    });

    it("DELETE /marketplace/:id/install uninstalls listing from workspace", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: `/api/v1/marketplace/${slackListingId}/install`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);

      const detailRes = await server.inject({
        method: "GET",
        url: `/api/v1/marketplace/slack`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(JSON.parse(detailRes.body).isInstalled).toBe(false);
    });
  });

  // ==========================================
  // 3. Publishing, Review & Deprecation
  // ==========================================
  describe("3. Publisher Submission, Review & Deprecation Lifecycle", () => {
    let communityListingId: string;
    const communitySlug = `lead-sync-${Date.now()}`;

    it("enforces governance policy: rejects submission when publishing is disabled", async () => {
      // By default allowMarketplacePublishing is false
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/marketplace",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: "Custom Lead Syncer",
          slug: communitySlug,
          description: "Synchronizes enterprise inbound leads with internal data warehouses.",
          category: "CRM & Sales",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toContain("governance policy prohibits publishing");
    });

    it("submits a custom integration listing for review when policy permits", async () => {
      // Enable marketplace publishing in governance policy
      await server.inject({
        method: "PATCH",
        url: "/api/v1/governance/policy",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { allowMarketplacePublishing: true },
      });

      const res = await server.inject({
        method: "POST",
        url: "/api/v1/marketplace",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: "Custom Lead Syncer",
          slug: communitySlug,
          description: "Synchronizes enterprise inbound leads with internal data warehouses.",
          category: "CRM & Sales",
          visibility: "PUBLIC",
          supportedActions: ["sync_lead", "export_contacts"],
        },
      });

      expect(res.statusCode).toBe(201);
      const listing = JSON.parse(res.body);
      expect(listing.slug).toBe(communitySlug);
      expect(listing.reviewStatus).toBe("IN_REVIEW");
      expect(listing.publisherWorkspaceId).toBe(workspaceAId);

      communityListingId = listing.id;
    });

    it("prevents duplicate slug registration (409 Conflict)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/marketplace",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: "Duplicate Slug Listing",
          slug: communitySlug,
          description: "Another listing attempting to use the same unique slug identifier.",
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it("keeps IN_REVIEW listing hidden from other tenants until approved", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/marketplace/${communitySlug}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("admin review approves listing into PUBLISHED status", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/marketplace/${communityListingId}/review`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { decision: "APPROVE" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.reviewStatus).toBe("PUBLISHED");

      // Verify it is now discoverable by Tenant B
      const tenantBRes = await server.inject({
        method: "GET",
        url: `/api/v1/marketplace/${communitySlug}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(tenantBRes.statusCode).toBe(200);
    });

    it("deprecates an active listing", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/marketplace/${communityListingId}/deprecate`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).reviewStatus).toBe("DEPRECATED");
    });
  });

  // ==========================================
  // 4. Enterprise Governance Policies & Audit
  // ==========================================
  describe("4. Enterprise Governance Policies & Audit Trail", () => {
    it("GET /governance/policy retrieves current workspace policy", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/governance/policy",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const policy = JSON.parse(res.body);
      expect(policy.workspaceId).toBe(workspaceAId);
      expect(policy.requireHttpsWebhooks).toBe(true);
    });

    it("rejects policy modifications from non-admin workspace members (RBAC guard)", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/v1/governance/policy",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { requireHttpsWebhooks: false },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toContain("Only workspace Administrators or Owners");
    });

    it("admin updates governance policy and records audit log event", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/v1/governance/policy",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          requireHttpsWebhooks: true,
          maxApiKeyLifetimeDays: 90,
          restrictIntegrationsToAdmin: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.maxApiKeyLifetimeDays).toBe(90);
      expect(body.restrictIntegrationsToAdmin).toBe(true);

      // Verify audit log
      const auditRes = await server.inject({
        method: "GET",
        url: "/api/v1/governance/audit-logs?action=GOVERNANCE_POLICY_UPDATED",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(auditRes.statusCode).toBe(200);
      const auditData = JSON.parse(auditRes.body);
      expect(auditData.data.length).toBeGreaterThanOrEqual(1);
      expect(auditData.data[0].action).toBe("GOVERNANCE_POLICY_UPDATED");
      expect(auditData.data[0].actorId).toBe(userAId);
    });
  });

  // ==========================================
  // 5. Data Rights, Retention & Safe Exports
  // ==========================================
  describe("5. Customer Data Rights, Retention & Safe Exports", () => {
    it("GET /data-retention/policy retrieves default retention periods", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/data-retention/policy",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const policy = JSON.parse(res.body);
      expect(policy.executionRetentionDays).toBe(30);
      expect(policy.auditLogRetentionDays).toBe(90);
    });

    it("enforces plan limits when configuring audit retention days", async () => {
      // Free plan allows up to 30 days audit retention. Trying 365 fails without Business plan.
      const res = await server.inject({
        method: "PATCH",
        url: "/api/v1/data-retention/policy",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { auditLogRetentionDays: 365 },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toContain("exceeds your Free plan maximum");
    });

    it("POST /data-retention/cleanup triggers bounded data purge without deleting workflows", async () => {
      // Create a test workflow to ensure it is NOT deleted by retention cleanup
      const wf = await prisma.workflow.create({
        data: {
          workspaceId: workspaceAId,
          name: "Immortal Production Workflow",
          status: "DRAFT",
        },
      });

      const res = await server.inject({
        method: "POST",
        url: "/api/v1/data-retention/cleanup",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const cleanup = JSON.parse(res.body);
      expect(cleanup).toHaveProperty("executionsCleaned");
      expect(cleanup).toHaveProperty("deliveriesCleaned");

      // Verify workflow remains intact
      const dbWf = await prisma.workflow.findUnique({ where: { id: wf.id } });
      expect(dbWf).toBeDefined();
      expect(dbWf?.name).toBe("Immortal Production Workflow");

      await prisma.workflow.delete({ where: { id: wf.id } });
    });

    it("POST /data-retention/exports creates sanitized export bundle with zero plaintext secrets", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/data-retention/exports",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { includeExecutions: true },
      });

      expect(res.statusCode).toBe(201);
      const exportBody = JSON.parse(res.body);
      expect(exportBody.status).toBe("COMPLETED");
      expect(exportBody.downloadUrl).toBeDefined();
      expect(exportBody.sampleBundle).toBeDefined();

      const bundle = exportBody.sampleBundle;
      expect(bundle.formatVersion).toBe("flowforge-export-v1");
      expect(bundle.workspace.name).toBe("Acme Enterprise");

      // Verify zero sensitive credentials in export
      for (const account of bundle.connectedAccounts) {
        expect(account).not.toHaveProperty("credentials");
        expect(account).not.toHaveProperty("token");
        expect(account).not.toHaveProperty("apiKey");
      }
    });

    it("POST /data-retention/delete-workspace rejects if confirmation phrase does not match", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/data-retention/delete-workspace",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          reason: "Migrating off platform",
          confirmationPhrase: "Wrong Name",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Confirmation phrase does not match workspace name");
    });

    it("POST /data-retention/delete-workspace accepts matching phrase and sets 14-day grace period", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/data-retention/delete-workspace",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          reason: "Migrating off platform",
          confirmationPhrase: "Acme Enterprise",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("CONFIRMED");
      expect(body.scheduledDeletionAt).toBeDefined();
      expect(body.message).toContain("scheduled for permanent removal");
    });
  });

  // ==========================================
  // 6. Automated Launch Readiness & Diagnostics
  // ==========================================
  describe("6. Automated Production Launch Readiness Probe", () => {
    it("GET /health/readiness-check verifies DB, Redis, queues and security without disclosing secrets", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/health/readiness-check",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ready).toBe(true);
      expect(body.checks.database.status).toBe("OK");
      expect(body.checks.redis.status).toBe("OK");
      expect(body.checks.queues.executions.status).toBe("OK");
      expect(body.checks.queues.outboundWebhooks.status).toBe("OK");
      expect(body.checks.security.jwtConfigured).toBe(true);
      expect(body.checks.security.rateLimitingEnabled).toBe(true);

      // Verify no sensitive keys disclosed in response
      expect(body.checks.security).not.toHaveProperty("jwtSecret");
      expect(body.checks.security).not.toHaveProperty("encryptionKey");
      expect(body.checks.security).not.toHaveProperty("cookieSecret");
    });
  });
});
