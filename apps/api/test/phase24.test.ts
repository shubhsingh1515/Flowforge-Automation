import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { intelligenceContextService } from "../src/services/intelligenceContextService.js";
import { insightEngineService } from "../src/services/insightEngineService.js";
import { predictiveOutcomeService } from "../src/services/predictiveOutcomeService.js";
import { investigationService } from "../src/services/investigationService.js";
import { decisionAutomationService } from "../src/services/decisionAutomationService.js";
import { outcomeEvaluationService } from "../src/services/outcomeEvaluationService.js";

describe("Phase 24 Enterprise AI Intelligence, Predictive Insights & Governed Decision Support Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let memberToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let memberUserId: string;

  // Tenant B for multi-tenant isolation tests
  let tenantBToken: string;
  let workspaceBId: string;
  let userBId: string;

  let workflowId: string;
  let eventSubId: string;
  let eventDeliveryId: string;
  let intWorkspaceId: string;
  let testInsightId: string;
  let testProposalId: string;
  const unique = Date.now();

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace A Owner
    const owner = await prisma.user.create({
      data: {
        email: `p24_lead_${unique}@flowforge.dev`,
        name: "Principal Intelligence Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Enterprise Intelligence Core",
        slug: `intel-core-${unique}`,
        ownerId: owner.id,
        homeRegion: "us-east-1",
        dataResidency: "GLOBAL",
        failoverEpoch: 1,
      },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId: owner.id,
        role: "OWNER",
      },
    });

    ownerToken = app.jwt.sign(
      { userId: owner.id, email: owner.email, workspaceId, workspaceRole: "OWNER" },
      { expiresIn: "1h" }
    );

    // 2. Create Workspace A Member (non-admin, for role-gate tests)
    const member = await prisma.user.create({
      data: {
        email: `p24_member_${unique}@flowforge.dev`,
        name: "Junior Analyst",
        passwordHash: "hash123",
      },
    });
    memberUserId = member.id;

    await prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId: member.id,
        role: "MEMBER",
      },
    });

    memberToken = app.jwt.sign(
      { userId: member.id, email: member.email, workspaceId, workspaceRole: "MEMBER" },
      { expiresIn: "1h" }
    );

    // 3. Create Workspace B (Tenant B)
    const userB = await prisma.user.create({
      data: {
        email: `p24_tenant_b_${unique}@flowforge.dev`,
        name: "Tenant B Ops Lead",
        passwordHash: "hash123",
      },
    });
    userBId = userB.id;

    const workspaceB = await prisma.workspace.create({
      data: {
        name: "Tenant B Intelligence Lab",
        slug: `tenant-b-intel-${unique}`,
        ownerId: userB.id,
        homeRegion: "eu-west-1",
        dataResidency: "EU_ONLY",
        failoverEpoch: 1,
      },
    });
    workspaceBId = workspaceB.id;

    await prisma.workspaceMembership.create({
      data: {
        workspaceId: workspaceBId,
        userId: userB.id,
        role: "OWNER",
      },
    });

    tenantBToken = app.jwt.sign(
      { userId: userB.id, email: userB.email, workspaceId: workspaceBId, workspaceRole: "OWNER" },
      { expiresIn: "1h" }
    );

    // 4. Create sample telemetry in Workspace A
    const wf = await prisma.workflow.create({
      data: {
        name: "Payment Ingestion Service",
        workspaceId,
      },
    });
    workflowId = wf.id;

    // Create 4 failed executions and 1 succeeded execution to test insight detection & statistical forecasting
    const pastTimes = [
      new Date(Date.now() - 3600 * 1000 * 5),
      new Date(Date.now() - 3600 * 1000 * 4),
      new Date(Date.now() - 3600 * 1000 * 3),
      new Date(Date.now() - 3600 * 1000 * 2),
      new Date(Date.now() - 3600 * 1000 * 1),
    ];

    const durations = [1200, 1500, 1800, 2100, 2400];

    for (let i = 0; i < 5; i++) {
      await prisma.workflowExecution.create({
        data: {
          workflowId,
          status: i < 4 ? "FAILED" : "SUCCESS",
          startedAt: pastTimes[i],
          finishedAt: new Date(pastTimes[i].getTime() + durations[i]),
          durationMs: durations[i],
          errorSummary: i < 4 ? "Connection timeout downstream gateway" : null,
        },
      });
    }

    // Create an Event Subscription and Dead-letter delivery for cross-system correlation
    const evSub = await prisma.eventSubscription.create({
      data: {
        workspaceId,
        name: "Payments Event Relay",
        eventTypes: ["payment.failed", "payment.retry"],
        destinationType: "OUTBOUND_WEBHOOK",
        destinationConfig: { webhookUrl: "https://api.gateway.example.com/deadletter" },
      },
    });
    eventSubId = evSub.id;

    const plEvent = await prisma.platformEvent.create({
      data: {
        workspaceId,
        eventId: `evt-p24-${unique}`,
        eventType: "payment.failed",
        source: "payment-gateway",
        data: { amount: 2500, currency: "USD", secretKey: "sk_live_very_secret_key_123" },
      },
    });

    const delivery = await prisma.eventDelivery.create({
      data: {
        workspaceId,
        eventId: plEvent.id,
        subscriptionId: evSub.id,
        status: "DEAD_LETTER",
        attemptCount: 5,
        maxAttempts: 5,
        lastError: "Webhook endpoint 504 Gateway Timeout",
        lastErrorCategory: "HTTP_TIMEOUT",
      },
    });
    eventDeliveryId = delivery.id;
  });

  afterAll(async () => {
    try {
      await prisma.decisionOutcomeEvaluation.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.decisionProposal.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.rootCauseInvestigation.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.forecastRun.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.businessInsight.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.intelligenceWorkspace.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.eventDelivery.deleteMany({ where: { workspaceId } });
      await prisma.eventSubscription.deleteMany({ where: { workspaceId } });
      await prisma.platformEvent.deleteMany({ where: { workspaceId } });
      await prisma.workflowExecution.deleteMany({ where: { workflowId } });
      await prisma.workflow.deleteMany({ where: { workspaceId } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: [workspaceId, workspaceBId] } } });
      await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, workspaceBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, memberUserId, userBId] } } });
    } catch (e) {
      // Ignore cleanup error in test tear-down
    }
    await app.close();
  });

  // =========================================================================
  // 1. Intelligence Overview & Workspaces
  // =========================================================================
  describe("Intelligence Workspaces & Overview", () => {
    it("fetches intelligence overview metrics and assembled context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/intelligence/overview",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data).toBeDefined();
      expect(json.data.workspaceId).toBe(workspaceId);
      expect(json.data.metrics).toBeDefined();
      expect(json.data.evidence).toBeDefined();
      expect(json.data.metrics.failedExecutions).toBe(4);
    });

    it("creates a domain-specific intelligence workspace", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/workspaces",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: "Operations & Reliability Hub",
          description: "Tracks reliability regressions and pipeline latency",
          businessQuestion: "Why did reliability regress on payment workflows?",
          targetResources: [workflowId],
          timeRangeHours: 168,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.data.id).toBeDefined();
      expect(json.data.name).toBe("Operations & Reliability Hub");
      expect(json.data.businessQuestion).toBe("Why did reliability regress on payment workflows?");
      intWorkspaceId = json.data.id;
    });

    it("lists intelligence workspaces for tenant", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/intelligence/workspaces",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].id).toBe(intWorkspaceId);
    });
  });

  // =========================================================================
  // 2. Intelligence Context Assembly & Sensitive Redaction
  // =========================================================================
  describe("Intelligence Context Assembly & Redaction", () => {
    it("assembles unified context and securely redacts sensitive tokens", async () => {
      const context = await intelligenceContextService.assembleContext(workspaceId, {
        timeRangeHours: 24,
      });

      expect(context.workspaceId).toBe(workspaceId);
      expect(context.evidence.length).toBeGreaterThan(0);

      // Verify that workflow failure evidence was gathered
      const wfEvidence = context.evidence.find(
        (e) => e.sourceService === "workflow" && e.resourceId === workflowId
      );
      expect(wfEvidence).toBeDefined();

      // Verify event dead letter evidence was gathered
      const eventEvidence = context.evidence.find((e) => e.sourceService === "event");
      expect(eventEvidence).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Evidence-Grounded Insight Engine & Deduplication
  // =========================================================================
  describe("Insight Engine & Deduplication", () => {
    it("generates evidence-grounded insights for high failure rates", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/insights/analyze",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          intelligenceWorkspaceId: intWorkspaceId,
          timeRangeHours: 24,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.insightsGenerated).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(json.data.insights)).toBe(true);

      const reliabilityInsight = json.data.insights.find(
        (i: any) => i.category === "WORKFLOW_RELIABILITY_REGRESSION"
      );
      expect(reliabilityInsight).toBeDefined();
      expect(reliabilityInsight.severity).toBe("CRITICAL");
      expect(reliabilityInsight.confidence).toBeGreaterThanOrEqual(0.8);
      expect(reliabilityInsight.evidenceReferences.length).toBeGreaterThan(0);
      expect(reliabilityInsight.correlationKey).toBeDefined();

      testInsightId = reliabilityInsight.id;
    });

    it("deduplicates insights on subsequent analysis within the same window", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/insights/analyze",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          intelligenceWorkspaceId: intWorkspaceId,
          timeRangeHours: 24,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      // Second run updates lastObservedAt for existing correlationKey rather than duplicating
      const allInsights = await prisma.businessInsight.findMany({
        where: { workspaceId, category: "WORKFLOW_RELIABILITY_REGRESSION" },
      });
      expect(allInsights.length).toBe(1);
    });

    it("updates insight status to ACKNOWLEDGED", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/intelligence/insights/${testInsightId}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { status: "ACKNOWLEDGED" },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.status).toBe("ACKNOWLEDGED");
    });
  });

  // =========================================================================
  // 4. Statistical Predictive Outcome Forecasting
  // =========================================================================
  describe("Predictive Outcome Forecasting", () => {
    it("handles insufficient historical data gracefully without producing false certainty", async () => {
      // Create a brand new workflow with zero executions
      const emptyWf = await prisma.workflow.create({
        data: {
          name: "Fresh Empty Workflow",
          workspaceId,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/forecasts/run",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          targetMetric: "WORKFLOW_FAILURE_RISK",
          resourceType: "WORKFLOW",
          resourceId: emptyWf.id,
          horizonHours: 24,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.status).toBe("INSUFFICIENT_DATA");
      expect(json.data.sampleCount).toBe(0);
      expect(json.data.predictedValue).toBe(0);

      // Clean up empty workflow
      await prisma.workflow.delete({ where: { id: emptyWf.id } });
    });

    it("calculates statistically grounded forecast when sample size >= 3", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/forecasts/run",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          targetMetric: "WORKFLOW_FAILURE_RISK",
          resourceType: "WORKFLOW",
          resourceId: workflowId,
          horizonHours: 24,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.status).toBe("COMPLETED");
      expect(json.data.sampleCount).toBe(5);
      expect(json.data.predictedValue).toBe(0.8);
      expect(json.data.confidenceIntervalLower).toBeLessThanOrEqual(json.data.predictedValue);
      expect(json.data.confidenceIntervalUpper).toBeGreaterThanOrEqual(json.data.predictedValue);
      expect(json.data.metadata).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Cross-System Root-Cause Investigation
  // =========================================================================
  describe("Root-Cause Investigation", () => {
    it("initiates cross-system root-cause correlation timeline", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/investigations",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          insightId: testInsightId,
          title: "Payment Gateway Failure Investigation",
          issueDescription: "Payment ingestion cascade failures and webhook dead letters",
          resourceType: "WORKFLOW",
          resourceId: workflowId,
          timeRangeHours: 24,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.data.id).toBeDefined();
      expect(json.data.timeline.length).toBeGreaterThanOrEqual(1);
      expect(json.data.candidateExplanations.length).toBeGreaterThanOrEqual(1);
      expect(json.data.status).toBe("COMPLETED");
    });
  });

  // =========================================================================
  // 6. Governed Decision Automation & Lifecycle
  // =========================================================================
  describe("Decision Automation Proposal Lifecycle & Policy Gates", () => {
    it("creates a decision proposal with allowlisted action and preconditions", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/proposals",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          actionType: "REPLAY_EVENT_DELIVERY",
          targetResourceType: "EVENT_DELIVERY",
          targetResourceId: eventDeliveryId,
          parameters: { resetAttempts: true },
          rationale: "Downstream payment gateway has recovered, replaying dead-letter deliveries will restore consistency.",
          expectedBenefit: "Restores delayed payment notifications with zero manual edits",
          estimatedRisk: "LOW",
          insightId: testInsightId,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.data.id).toBeDefined();
      expect(json.data.status).toBe("PENDING_APPROVAL");
      expect(json.data.actionType).toBe("REPLAY_EVENT_DELIVERY");
      testProposalId = json.data.id;
    });

    it("rejects non-allowlisted action types gracefully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/intelligence/proposals",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          actionType: "DROP_DATABASE_TABLE",
          targetResourceType: "DATABASE",
          targetResourceId: "db-1",
          rationale: "Arbitrary Bash Execution attempt",
          expectedBenefit: "None",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("blocks execution without prior approval", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/proposals/${testProposalId}/execute`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      // Must be 400 because proposal is PENDING_APPROVAL, not APPROVED
      expect(res.statusCode).toBe(400);
    });

    it("enforces role-based gate: non-admin member cannot approve proposal", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/proposals/${testProposalId}/approve`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { comment: "Attempted member self-approval", executeImmediately: false },
      });

      expect(res.statusCode).toBe(403);
    });

    it("allows OWNER to approve decision proposal", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/proposals/${testProposalId}/approve`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { comment: "Authorized by Platform Principal", executeImmediately: false },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.status).toBe("APPROVED");
      expect(json.data.approvedAt).toBeDefined();
    });

    it("deterministically executes approved proposal and updates status to SUCCEEDED", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/proposals/${testProposalId}/execute`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.status).toBe("SUCCEEDED");
      expect(json.data.executionCompletedAt).toBeDefined();
      expect(json.data.executionResult).toBeDefined();
      expect(json.data.executionResult.replayed).toBe(true);

      // Verify execution attempted the replay
      const attempts = await prisma.eventDeliveryAttempt.findMany({
        where: { deliveryId: eventDeliveryId },
      });
      expect(attempts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 7. Post-Action Outcome Evaluation Feedback Loop
  // =========================================================================
  describe("Post-Action Outcome Evaluation", () => {
    it("evaluates post-action outcome verdict against baseline", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/outcomes/evaluate/${testProposalId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          targetMetric: "EVENT_DELIVERY_SUCCESS",
          evaluationWindowMinutes: 60,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.id).toBeDefined();
      expect(json.data.proposalId).toBe(testProposalId);
      expect(json.data.outcomeVerdict).toBeDefined();
      expect(["IMPROVED", "NEUTRAL", "WORSENED", "INSUFFICIENT_DATA"]).toContain(
        json.data.outcomeVerdict
      );
    });

    it("lists outcome evaluations for workspace", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/intelligence/outcomes",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 8. Strict Multi-Tenant Isolation
  // =========================================================================
  describe("Multi-Tenant Isolation", () => {
    it("prevents Tenant B from viewing Tenant A intelligence workspaces", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/intelligence/workspaces/${intWorkspaceId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("prevents Tenant B from viewing or approving Tenant A proposals", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/proposals/${testProposalId}/approve`,
        headers: { authorization: `Bearer ${tenantBToken}` },
        payload: { comment: "Cross-tenant intrusion attempt", executeImmediately: false },
      });

      expect(res.statusCode).toBe(404);
    });

    it("prevents Tenant B from evaluating Tenant A proposal outcomes", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/intelligence/outcomes/evaluate/${testProposalId}`,
        headers: { authorization: `Bearer ${tenantBToken}` },
        payload: { targetMetric: "EVENT_DELIVERY_SUCCESS" },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
