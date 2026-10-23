import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import crypto from "crypto";

describe("Phase 14 Enterprise Collaboration, Governance & Operational Intelligence Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let adminUserId: string;
  let memberUserId: string;
  let testWorkflowId: string;

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    const unique = Date.now();

    // 1. Create users: Owner, Admin, Member
    const owner = await prisma.user.create({
      data: {
        email: `org_owner_${unique}@flowforge.dev`,
        name: "Enterprise Org Owner",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const admin = await prisma.user.create({
      data: {
        email: `workspace_admin_${unique}@flowforge.dev`,
        name: "Security Admin",
        passwordHash: "hash123",
      },
    });
    adminUserId = admin.id;

    const member = await prisma.user.create({
      data: {
        email: `workflow_author_${unique}@flowforge.dev`,
        name: "Workflow Author",
        passwordHash: "hash123",
      },
    });
    memberUserId = member.id;

    // 2. Create Workspace with memberships
    const ws = await prisma.workspace.create({
      data: {
        name: `Enterprise Governance Workspace ${unique}`,
        slug: `enterprise-ws-${unique}`,
        ownerId: ownerUserId,
        memberships: {
          create: [
            { userId: ownerUserId, role: "OWNER" },
            { userId: adminUserId, role: "ADMIN" },
            { userId: memberUserId, role: "MEMBER" },
          ],
        },
      },
    });
    workspaceId = ws.id;

    ownerToken = app.jwt.sign(
      { userId: ownerUserId, workspaceId, email: owner.email },
      { expiresIn: "7d" }
    );
    adminToken = app.jwt.sign(
      { userId: adminUserId, workspaceId, email: admin.email },
      { expiresIn: "7d" }
    );
    memberToken = app.jwt.sign(
      { userId: memberUserId, workspaceId, email: member.email },
      { expiresIn: "7d" }
    );

    // 3. Create test workflow in DRAFT state
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Critical Payment Reconciliation",
        description: "Reconciles stripe and ERP ledgers",
        status: "DRAFT",
        criticality: "CRITICAL",
        businessDomain: "FINANCE",
        triggerType: "WEBHOOK",
        versions: {
          create: {
            version: 1,
            nodes: [
              {
                id: "node_wh",
                type: "custom",
                position: { x: 100, y: 100 },
                data: { label: "Payment Webhook", nodeType: "TRIGGER" },
              },
              {
                id: "node_http",
                type: "custom",
                position: { x: 300, y: 100 },
                data: {
                  label: "Post ERP",
                  nodeType: "HTTP_REQUEST",
                  config: { url: "https://api.erp.internal/ledger" },
                },
              },
            ],
            edges: [{ id: "e1", source: "node_wh", target: "node_http" }],
            isValid: true,
          },
        },
      },
    });
    testWorkflowId = wf.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================
  // TEST 1: ORGANIZATION HIERARCHY & LAST OWNER PROTECTION
  // ==========================================
  describe("1. Organizations & Last-Owner Protection", () => {
    let orgId: string;
    let ownerMembershipId: string;
    let adminMembershipId: string;

    it("creates an organization and automatically assigns creator as OWNER", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/organizations",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "Acme Global Enterprise",
          slug: `acme-global-${Date.now()}`,
          tier: "ENTERPRISE",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe("Acme Global Enterprise");
      orgId = body.data.id;

      // Check memberships
      const membersRes = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(membersRes.statusCode).toBe(200);
      const members = membersRes.json().data;
      expect(members.length).toBe(1);
      expect(members[0].role).toBe("OWNER");
      ownerMembershipId = members[0].id;
    });

    it("adds an administrator to the organization", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          userId: adminUserId,
          role: "ADMIN",
        },
      });
      expect(res.statusCode).toBe(201);
      adminMembershipId = res.json().data.id;
    });

    it("enforces last-owner protection when attempting to remove the only organization owner", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/organizations/${orgId}/members/${ownerMembershipId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message.toLowerCase()).toContain("last active owner");
    });
  });

  // ==========================================
  // TEST 2: FUNCTIONAL TEAMS & PERMISSIONS
  // ==========================================
  describe("2. Teams & Fine-Grained Resource Permissions", () => {
    let teamId: string;
    let permissionId: string;

    it("creates a functional team in the workspace", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "DevOps & SRE Core",
          description: "Responsible for production pipelines",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe("DevOps & SRE Core");
      teamId = body.data.id;
    });

    it("adds a member to the functional team", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${teamId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          userId: memberUserId,
          teamRole: "MEMBER",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.userId).toBe(memberUserId);
    });

    it("grants granular resource permission to the team", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/permissions",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          subjectType: "TEAM",
          subjectId: teamId,
          resourceType: "WORKFLOW",
          resourceId: testWorkflowId,
          accessLevel: "EDIT",
        },
      });

      expect(res.statusCode).toBe(201);
      permissionId = res.json().data.id;
      expect(permissionId).toBeDefined();
    });

    it("lists granted permissions on the workflow", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/permissions?resourceType=WORKFLOW&resourceId=${testWorkflowId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const grants = res.json().data;
      expect(grants.length).toBeGreaterThanOrEqual(1);
      expect(grants.some((g: any) => g.id === permissionId)).toBe(true);
    });
  });

  // ==========================================
  // TEST 3: STEWARDSHIP & OWNERSHIP INTELLIGENCE
  // ==========================================
  describe("3. Workflow Stewardship & Ownership Intelligence", () => {
    it("reports the test workflow as unowned and orphaned", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/governance/ownership-intelligence",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const report = res.json().data;
      expect(report.totalWorkflows).toBeGreaterThanOrEqual(1);
      expect(report.orphanedWorkflows).toBeGreaterThanOrEqual(1);
    });

    it("updates workflow stewardship with designated owner and escalation contact", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/workflows/${testWorkflowId}/stewardship`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          ownerUserId: memberUserId,
          criticality: "CRITICAL",
          businessDomain: "FINANCE",
          escalationContact: "finance-sre@acme.com",
          lifecycleStatus: "DRAFT",
        },
      });

      expect(res.statusCode).toBe(200);
      const updated = res.json().data;
      expect(updated.ownerUserId).toBe(memberUserId);
      expect(updated.escalationContact).toBe("finance-sre@acme.com");
    });
  });

  // ==========================================
  // TEST 4: COLLABORATIVE REVIEWS & IMMUTABLE HASH VALIDATION
  // ==========================================
  describe("4. Collaborative Reviews & Stale Approval Invalidation", () => {
    let reviewId: string;

    it("submits a workflow version for review and binds it to graph hash", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/reviews",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          workflowId: testWorkflowId,
          workflowVersionNumber: 1,
          title: "Initial Ledger Posting Integration",
          changeSummary: "Connects ERP accounting webhook",
        },
      });

      expect(res.statusCode).toBe(201);
      const review = res.json().data;
      expect(review.id).toBeDefined();
      expect(review.contentHash).toBeDefined();
      expect(review.status).toBe("SUBMITTED");
      reviewId = review.id;
    });

    it("prevents self-approval by the review author", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/reviews/${reviewId}/decision`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          decision: "APPROVED",
          reason: "Self approval attempt",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().message).toContain("Self-approval is prohibited");
    });

    it("allows a workspace administrator to approve the review", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/reviews/${reviewId}/decision`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          decision: "APPROVED",
          reason: "Graph definitions and HTTPS endpoints verified",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("APPROVED");
    });

    it("invalidates the approved review (marks SUPERSEDED) when underlying workflow draft is modified", async () => {
      // Modify workflow draft nodes
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/v1/workflows/${testWorkflowId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          nodes: [
            {
              id: "node_wh",
              type: "custom",
              position: { x: 100, y: 100 },
              data: { label: "Payment Webhook", nodeType: "TRIGGER" },
            },
            {
              id: "node_http",
              type: "custom",
              position: { x: 300, y: 100 },
              data: {
                label: "Post ERP V2",
                nodeType: "HTTP_REQUEST",
                config: { url: "https://api.erp.internal/v2/ledger" },
              },
            },
          ],
        },
      });
      expect(updateRes.statusCode).toBe(200);

      // Verify that the previously APPROVED review is now marked SUPERSEDED
      const getRev = await app.inject({
        method: "GET",
        url: `/api/v1/reviews/${reviewId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(getRev.statusCode).toBe(200);
      expect(getRev.json().data.status).toBe("SUPERSEDED");
    });
  });

  // ==========================================
  // TEST 5: CENTRALIZED GOVERNANCE POLICY ENFORCEMENT
  // ==========================================
  describe("5. Centralized Governance Policy Enforcement", () => {
    it("updates workspace governance policy to require reviews for critical flows", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/governance/policy",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          requireWorkflowOwner: true,
          requireReviewForCritical: true,
          requireHttpsWebhooks: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const policy = res.json();
      expect(policy.requireWorkflowOwner).toBe(true);
      expect(policy.requireReviewForCritical).toBe(true);
    });

    it("evaluates policy against critical workflow and identifies missing approved review as blocking", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/governance/evaluate",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          workflowId: testWorkflowId,
          action: "ACTIVATE",
        },
      });

      expect(res.statusCode).toBe(200);
      const evaluation = res.json().data;
      expect(evaluation.compliant).toBe(false);
      expect(
        evaluation.violations.some((v: any) => v.rule === "REQUIRE_REVIEW_FOR_CRITICAL")
      ).toBe(true);
    });

    it("blocks workflow activation when governance policy is violated", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/workflows/${testWorkflowId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          status: "ACTIVE",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("GovernancePolicyViolation");
    });
  });

  // ==========================================
  // TEST 6: OPERATIONAL RELIABILITY OBJECTIVES (SLO)
  // ==========================================
  describe("6. Operational Reliability Objectives (SLO) & Statistical Sizing", () => {
    let sloId: string;

    it("creates a success rate SLO for the workflow", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/reliability/objectives",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "Payment Processing 99.0% SLO",
          targetMetric: "SUCCESS_RATE",
          targetValue: 99.0,
          timeWindowHours: 24,
          workflowId: testWorkflowId,
        },
      });

      expect(res.statusCode).toBe(201);
      sloId = res.json().data.id;
      expect(sloId).toBeDefined();
    });

    it("reports INSUFFICIENT_DATA when fewer than 5 sample executions exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/reliability/objectives/${sloId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const evaluation = res.json().data.evaluationSummary;
      expect(evaluation.insufficientData).toBe(true);
      expect(evaluation.sampleSize).toBeLessThan(5);
    });

    it("evaluates healthy status and remaining error budget when valid executions exist", async () => {
      // Seed 6 successful executions
      for (let i = 0; i < 6; i++) {
        await prisma.workflowExecution.create({
          data: {
            workflowId: testWorkflowId,
            status: "SUCCESS",
            attempt: 1,
            maxAttempts: 1,
            durationMs: 150,
            finishedAt: new Date(),
          },
        });
      }

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/reliability/objectives/${sloId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const report = res.json().data;
      expect(report.status).toBe("HEALTHY");
      expect(report.evaluationSummary.insufficientData).toBe(false);
      expect(report.evaluationSummary.currentValue).toBe(100);
      expect(report.evaluationSummary.errorBudgetRemainingPct).toBe(100);
    });
  });

  // ==========================================
  // TEST 7: MULTI-DIMENSIONAL AUDIT & COMPLIANCE EXPORT
  // ==========================================
  describe("7. Compliance Audit Search & Sanitized Export Package", () => {
    let downloadToken: string;

    it("searches audit logs with keyword filtering", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/compliance/audit-logs?keyword=Acme",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeDefined();
    });

    it("generates a sanitized compliance evidence export job valid for 48 hours", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/compliance/exports",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          startDate: new Date(Date.now() - 7 * 86400000).toISOString(),
          endDate: new Date().toISOString(),
          reason: "Annual SOC 2 Type II Security Audit",
          includePayloads: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const job = res.json().data;
      expect(job.downloadToken).toBeDefined();
      expect(job.status).toBe("COMPLETED");
      expect(job.expiresAt).toBeDefined();
      downloadToken = job.downloadToken;
    });

    it("downloads the sanitized compliance evidence package using download token", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/compliance/exports/${downloadToken}/download`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const payload = res.json();
      expect(payload.workspaceId).toBe(workspaceId);
      expect(payload.evidenceMetadata.reason).toBe("Annual SOC 2 Type II Security Audit");
      expect(payload.integritySha256).toBeDefined();
    });
  });
});
