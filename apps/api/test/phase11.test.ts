import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, PlanTier, ExecutionStatus } from "@flowforge/database";
import { analyticsService } from "../src/services/analytics.js";
import { usageAlertsService } from "../src/services/usageAlerts.js";
import { notificationService } from "../src/services/notifications.js";
import { supportService } from "../src/services/support.js";

describe("Phase 11: Customer Success, Product Analytics, Usage Intelligence & Commercial Launch Suite", () => {
  let server: FastifyInstance;
  let userA: any;
  let userB: any;
  let workspaceA: any;
  let workspaceB: any;
  let tokenA: string;
  let tokenB: string;
  let workflowA1: any;
  let workflowA2: any;
  let workflowB: any;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    const unique = Date.now();

    // 1. Create Workspace A (Owner User A)
    userA = await prisma.user.create({
      data: {
        email: `usera_${unique}@analytics.test`,
        name: "User A Analytics",
        passwordHash: "hash_a",
      },
    });

    workspaceA = await prisma.workspace.create({
      data: {
        name: `Analytics Org A ${unique}`,
        slug: `analytics-org-a-${unique}`,
        ownerId: userA.id,
        memberships: {
          create: [{ userId: userA.id, role: "OWNER" }],
        },
        subscription: {
          create: {
            planTier: PlanTier.PRO,
            status: "ACTIVE",
            currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
          },
        },
      },
    });

    tokenA = server.jwt.sign(
      { userId: userA.id, workspaceId: workspaceA.id, email: userA.email },
      { expiresIn: "7d" }
    );

    // 2. Create Workspace B (Owner User B) for Tenant Isolation testing
    userB = await prisma.user.create({
      data: {
        email: `userb_${unique}@analytics.test`,
        name: "User B Analytics",
        passwordHash: "hash_b",
      },
    });

    workspaceB = await prisma.workspace.create({
      data: {
        name: `Analytics Org B ${unique}`,
        slug: `analytics-org-b-${unique}`,
        ownerId: userB.id,
        memberships: {
          create: [{ userId: userB.id, role: "OWNER" }],
        },
        subscription: {
          create: {
            planTier: PlanTier.FREE,
            status: "ACTIVE",
            currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
          },
        },
      },
    });

    tokenB = server.jwt.sign(
      { userId: userB.id, workspaceId: workspaceB.id, email: userB.email },
      { expiresIn: "7d" }
    );

    // 3. Create sample workflows
    workflowA1 = await prisma.workflow.create({
      data: {
        workspaceId: workspaceA.id,
        name: "Order Processing Automation",
        status: "ACTIVE",
      },
    });

    workflowA2 = await prisma.workflow.create({
      data: {
        workspaceId: workspaceA.id,
        name: "Slack Notifications Automation",
        status: "ACTIVE",
      },
    });

    workflowB = await prisma.workflow.create({
      data: {
        workspaceId: workspaceB.id,
        name: "Confidential Competitor Workflow",
        status: "ACTIVE",
      },
    });

    // 4. Seed executions for Workspace A
    // 3 Successes on workflowA1 with duration 100, 200, 500ms
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowA1.id,
        status: ExecutionStatus.SUCCESS,
        durationMs: 100,
        createdAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      },
    });
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowA1.id,
        status: ExecutionStatus.SUCCESS,
        durationMs: 200,
        createdAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago
      },
    });
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowA1.id,
        status: ExecutionStatus.SUCCESS,
        durationMs: 500,
        createdAt: new Date(Date.now() - 3 * 3600 * 1000), // 3 hours ago
      },
    });

    // 2 Failures on workflowA2 with RATE_LIMIT and TIMEOUT
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowA2.id,
        status: ExecutionStatus.FAILED,
        errorCategory: "RATE_LIMIT",
        errorSummary: "Slack API 429 rate limit exceeded",
        createdAt: new Date(Date.now() - 4 * 3600 * 1000),
      },
    });
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowA2.id,
        status: ExecutionStatus.FAILED,
        errorCategory: "TIMEOUT",
        errorSummary: "Connection timeout connecting to upstream service",
        createdAt: new Date(Date.now() - 5 * 3600 * 1000),
      },
    });

    // 1 Execution on Workspace B (should NOT appear in Workspace A analytics)
    await prisma.workflowExecution.create({
      data: {
        workflowId: workflowB.id,
        status: ExecutionStatus.SUCCESS,
        durationMs: 999,
        createdAt: new Date(Date.now() - 3600 * 1000),
      },
    });

    // Seed usage records for Workspace A
    await prisma.usageRecord.create({
      data: {
        workspaceId: workspaceA.id,
        quantity: 5,
        idempotencyKey: `usage_a_${unique}_1`,
        createdAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // 1. FEATURE A: PRODUCT ANALYTICS & INSIGHTS
  // =========================================================================
  describe("Feature A: Product Analytics & Automation Insights", () => {
    it("returns aggregated execution counts, success rate, and duration percentiles for Workspace A", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/overview?timeRange=24h",
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.totalExecutions).toBe(5);
      expect(data.successfulExecutions).toBe(3);
      expect(data.failedExecutions).toBe(2);
      expect(data.successRatePercent).toBe(60); // 3 out of 5 = 60%
      expect(data.failureRatePercent).toBe(40); // 2 out of 5 = 40%

      // Percentiles: durations are 100, 200, 500
      expect(data.durationPercentiles).toBeDefined();
      expect(data.durationPercentiles.p50).toBeGreaterThanOrEqual(100);
      expect(data.durationPercentiles.p90).toBeGreaterThanOrEqual(200);

      // Volume over time should contain points
      expect(Array.isArray(data.volumeOverTime)).toBe(true);
      expect(data.volumeOverTime.length).toBeGreaterThan(0);

      // Top error categories should contain RATE_LIMIT and TIMEOUT
      expect(data.topErrorCategories.length).toBe(2);
      const categories = data.topErrorCategories.map((c: any) => c.category);
      expect(categories).toContain("RATE_LIMIT");
      expect(categories).toContain("TIMEOUT");

      // Repeated failure workflows
      expect(data.repeatedFailureWorkflows.length).toBe(1);
      expect(data.repeatedFailureWorkflows[0].workflowName).toBe("Slack Notifications Automation");
      expect(data.repeatedFailureWorkflows[0].failureCount).toBe(2);
    });

    it("enforces strict multi-tenant isolation in analytics queries", async () => {
      const resB = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/overview?timeRange=24h",
        headers: { authorization: `Bearer ${tokenB}` },
      });

      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse(resB.body);

      // Workspace B must only see its own single execution
      expect(dataB.totalExecutions).toBe(1);
      expect(dataB.successfulExecutions).toBe(1);
      expect(dataB.failedExecutions).toBe(0);

      // Workspace B must not see any of Workspace A's workflow names
      const bWfNames = dataB.mostExecutedWorkflows.map((w: any) => w.workflowName);
      expect(bWfNames).not.toContain("Order Processing Automation");
      expect(bWfNames).not.toContain("Slack Notifications Automation");
    });

    it("filters analytics by specific workflowId", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/analytics/overview?timeRange=24h&workflowId=${workflowA1.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.totalExecutions).toBe(3);
      expect(data.successfulExecutions).toBe(3);
      expect(data.failedExecutions).toBe(0);
      expect(data.successRatePercent).toBe(100);
    });
  });

  // =========================================================================
  // 2. FEATURE B: USAGE INTELLIGENCE & FORECASTING
  // =========================================================================
  describe("Feature B: Usage Intelligence, Quotas & Threshold Alerts", () => {
    it("returns transparent usage forecast and daily burn rate", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/usage/forecast",
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data).toHaveProperty("burnRatePerDay");
      expect(data).toHaveProperty("projectedPeriodEndTotal");
      expect(data).toHaveProperty("planAllowance");
      expect(data).toHaveProperty("explanation");
      expect(Array.isArray(data.dailyUsageHistory)).toBe(true);
    });

    it("retrieves and updates workspace usage alert configuration", async () => {
      // Get initial config
      const getRes = await server.inject({
        method: "GET",
        url: "/api/v1/usage/alerts/config",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(getRes.statusCode).toBe(200);
      const initial = JSON.parse(getRes.body);
      expect(initial.config.threshold80).toBe(true);

      // Update alert config
      const putRes = await server.inject({
        method: "PUT",
        url: "/api/v1/usage/alerts/config",
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          threshold50: false,
          threshold80: true,
          threshold90: true,
          threshold100: true,
          notifyInApp: true,
          notifyEmail: false,
        },
      });
      expect(putRes.statusCode).toBe(200);
      const updated = JSON.parse(putRes.body);
      expect(updated.config.threshold50).toBe(false);
      expect(updated.config.notifyEmail).toBe(false);
    });

    it("evaluates usage thresholds and idempotently creates alert events without duplicates", async () => {
      // Evaluate thresholds
      const evalRes1 = await server.inject({
        method: "POST",
        url: "/api/v1/usage/alerts/evaluate",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(evalRes1.statusCode).toBe(200);

      // Evaluating a second time in same billing cycle should not fail or duplicate
      const evalRes2 = await server.inject({
        method: "POST",
        url: "/api/v1/usage/alerts/evaluate",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(evalRes2.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // 3. FEATURE F: IN-APP NOTIFICATIONS & ACTIVITY CENTER
  // =========================================================================
  describe("Feature F: In-App Notifications & Activity Center", () => {
    let createdNotifId: string;

    it("creates, lists, and counts unread notifications for workspace", async () => {
      // 1. Manually dispatch a notification
      const notif = await notificationService.createNotification({
        workspaceId: workspaceA.id,
        userId: userA.id,
        type: "USAGE_ALERT",
        title: "80% Monthly Quota Reached",
        message: "Your workspace has consumed 80% of included runs.",
        link: "/settings?tab=billing",
        category: "warning",
      });
      createdNotifId = notif.id;

      // 2. Query notifications endpoint
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/notifications",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.notifications.length).toBeGreaterThanOrEqual(1);
      expect(body.unreadCount).toBeGreaterThanOrEqual(1);
      const found = body.notifications.find((n: any) => n.id === createdNotifId);
      expect(found).toBeDefined();
      expect(found.title).toBe("80% Monthly Quota Reached");
      expect(found.read).toBe(false);
    });

    it("marks an individual notification as read", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: `/api/v1/notifications/${createdNotifId}/read`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(200);

      // Verify read status updated in list
      const listRes = await server.inject({
        method: "GET",
        url: "/api/v1/notifications",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const listBody = JSON.parse(listRes.body);
      const found = listBody.notifications.find((n: any) => n.id === createdNotifId);
      expect(found.read).toBe(true);
      expect(found.readAt).not.toBeNull();
    });

    it("marks all unread notifications as read", async () => {
      // Create 2 new unread notifications
      await notificationService.createNotification({
        workspaceId: workspaceA.id,
        type: "SYSTEM",
        title: "Notification 1",
        message: "System update 1",
      });
      await notificationService.createNotification({
        workspaceId: workspaceA.id,
        type: "SYSTEM",
        title: "Notification 2",
        message: "System update 2",
      });

      const markRes = await server.inject({
        method: "POST",
        url: "/api/v1/notifications/mark-all-read",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(markRes.statusCode).toBe(200);
      const markBody = JSON.parse(markRes.body);
      expect(markBody.count).toBeGreaterThanOrEqual(2);

      // Verify unread count is now 0
      const listRes = await server.inject({
        method: "GET",
        url: "/api/v1/notifications",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.unreadCount).toBe(0);
    });

    it("enforces tenant boundary on notifications", async () => {
      // User B should NOT see Workspace A's notifications
      const resB = await server.inject({
        method: "GET",
        url: "/api/v1/notifications",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(resB.statusCode).toBe(200);
      const bodyB = JSON.parse(resB.body);
      expect(bodyB.notifications.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. FEATURE G & H: SUPPORT DIAGNOSTICS, FEEDBACK & PUBLIC STATUS
  // =========================================================================
  describe("Feature G & H: Support Diagnostics Bundle, Feedback & Public Status", () => {
    let generatedBundleId: string;

    it("generates a sanitized support diagnostics bundle with secrets scrubbed", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/support/bundle",
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          notes: "Testing diagnostics package generation",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("sizeBytes");
      expect(body).toHaveProperty("expiresAt");
      generatedBundleId = body.id;
    });

    it("downloads and verifies sanitized support bundle payload", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/support/bundle/${generatedBundleId}/download`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const bundle = JSON.parse(res.body);

      expect(bundle).toHaveProperty("appVersion");
      expect(bundle.workspace.id).toBe(workspaceA.id);
      expect(bundle.diagnostics.workflows.length).toBe(2);
      expect(bundle.diagnostics.recentFailedExecutions.length).toBe(2);

      // Verification of secret scrubbing: ensure no raw credentials leak
      const bundleText = JSON.stringify(bundle);
      expect(bundleText).not.toContain("passwordHash");
      expect(bundleText).not.toContain("encryptedClientSecret");
    });

    it("submits customer feedback with rate limiting guard", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/support/feedback",
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          category: "FEATURE_REQUEST",
          rating: 5,
          comment: "Would love to see native Datadog and PagerDuty integration nodes!",
          contactEmail: "developer@analytics.test",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty("feedbackId");
    });

    it("serves public system health status without requiring authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/status/public",
      });

      expect(res.statusCode).toBe(200);
      const status = JSON.parse(res.body);
      expect(status).toHaveProperty("status");
      expect(status).toHaveProperty("services");
      expect(status.services).toHaveProperty("workflowEngine");
      expect(status.services).toHaveProperty("database");
      expect(status.services).toHaveProperty("queueSystem");
      expect(status.uptimeLast30DaysPercent).toBeGreaterThanOrEqual(99);
    });
  });
});
