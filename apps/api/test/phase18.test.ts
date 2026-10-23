import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, ExecutionStatus, WorkflowStatus } from "@flowforge/database";
import { sloEngine } from "../src/services/sloEngine.js";
import { incidentService } from "../src/services/incidentService.js";
import { remediationEngine } from "../src/services/remediationEngine.js";
import { predictiveCapacityService } from "../src/services/predictiveCapacityService.js";
import { unifiedHealthService } from "../src/services/unifiedHealthService.js";

describe("Phase 18 Enterprise Observability 2.0, SLOs & Self-Healing Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let testWorkflowId: string;
  let testVersionId: string;

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    const unique = Date.now();

    // 1. Create Workspace Owner
    const owner = await prisma.user.create({
      data: {
        email: `p18_sre_${unique}@flowforge.dev`,
        name: "Principal SRE",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    // 2. Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: "Observability 2.0 Test Workspace",
        slug: `observability-p18-${unique}`,
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

    // 3. Issue Token and Session
    ownerToken = app.jwt.sign(
      { userId: owner.id, email: owner.email, workspaceId, workspaceRole: "OWNER" },
      { expiresIn: "7d" }
    );

    await prisma.session.create({
      data: {
        token: ownerToken,
        userId: owner.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // 4. Create Workflow
    const workflow = await prisma.workflow.create({
      data: {
        name: "SRE Critical Workflow",
        workspaceId,
        status: WorkflowStatus.ACTIVE,
      },
    });
    testWorkflowId = workflow.id;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        nodes: [
          {
            id: "step_start",
            type: "customNode",
            data: { label: "Trigger Node", nodeType: "TRIGGER" },
          },
        ],
        edges: [],
      },
    });
    testVersionId = version.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ========================================================
  // 1. SLO ENGINE & ERROR BUDGET MONITORING
  // ========================================================
  describe("SLO Engine & Error Budget Tracking", () => {
    it("returns INSUFFICIENT_DATA when sample size is below threshold (< 3 executions)", async () => {
      const obj = await prisma.reliabilityObjective.create({
        data: {
          workspaceId,
          workflowId: testWorkflowId,
          name: "Checkout 99% Success SLO",
          targetMetric: "SUCCESS_RATE",
          targetValue: 99.0,
          evaluationWindowDays: 14,
        },
      });

      const res = await sloEngine.evaluateObjective(obj);
      expect(res.status).toBe("INSUFFICIENT_DATA");
      expect(res.sampleCount).toBe(0);
      expect(res.incidentCreated).toBeFalsy();
    });

    it("evaluates SLO breach, depletes error budget, and triggers automated incident", async () => {
      // Create 4 executions: 3 SUCCESS, 1 FAILED (75% success rate vs 99.0% target)
      await prisma.workflowExecution.createMany({
        data: [
          { workflowId: testWorkflowId, versionId: testVersionId, status: ExecutionStatus.SUCCESS, durationMs: 120 },
          { workflowId: testWorkflowId, versionId: testVersionId, status: ExecutionStatus.SUCCESS, durationMs: 130 },
          { workflowId: testWorkflowId, versionId: testVersionId, status: ExecutionStatus.SUCCESS, durationMs: 150 },
          {
            workflowId: testWorkflowId,
            versionId: testVersionId,
            status: ExecutionStatus.FAILED,
            errorSummary: "HTTP 429 Too Many Requests from external billing API",
            durationMs: 500,
          },
        ],
      });

      const obj = await prisma.reliabilityObjective.findFirst({
        where: { workspaceId, targetMetric: "SUCCESS_RATE" },
      });
      expect(obj).toBeDefined();

      const res = await sloEngine.evaluateObjective(obj!);
      expect(res.status).toBe("BREACHED");
      expect(res.currentValue).toBe(75.0);
      expect(res.errorBudgetRemaining).toBe(0);
      expect(res.sampleCount).toBe(4);
      expect(res.incidentCreated).toBe(true);

      // Verify incident record in database
      const incident = await prisma.operationalIncident.findFirst({
        where: { workspaceId, category: "SLO_BREACH" },
        include: { timelineEvents: true },
      });

      expect(incident).toBeDefined();
      expect(incident?.severity).toBe("CRITICAL");
      expect(incident?.status).toBe("OPEN");
      expect(incident?.timelineEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("suppresses redundant incident creation during alert cooldown period", async () => {
      const obj = await prisma.reliabilityObjective.findFirst({
        where: { workspaceId, targetMetric: "SUCCESS_RATE" },
      });
      expect(obj).toBeDefined();

      const res = await sloEngine.evaluateObjective(obj!);
      // Even though still breached, alert cooldown prevents duplicate incident creation
      expect(res.status).toBe("BREACHED");
      expect(res.incidentCreated).toBe(false);
    });
  });

  // ========================================================
  // 2. INCIDENT LIFECYCLE & CORRELATION
  // ========================================================
  describe("Incident Lifecycle & Correlation Engine", () => {
    let incidentId: string;

    it("deduplicates alerts matching active correlationKey and appends timeline event", async () => {
      const correlationKey = `integration:stripe:429:${workspaceId}`;

      const first = await incidentService.reportIncident({
        workspaceId,
        title: "Stripe Webhook Delivery Degradation",
        severity: "HIGH",
        category: "INTEGRATION_ERROR",
        sourceService: "WEBHOOK_DISPATCHER",
        correlationKey,
        affectedWorkflows: [testWorkflowId],
      });

      expect(first.status).toBe("OPEN");
      incidentId = first.id;

      // Report duplicate alert
      const second = await incidentService.reportIncident({
        workspaceId,
        title: "Stripe Webhook Delivery Degradation (Repeated)",
        severity: "HIGH",
        category: "INTEGRATION_ERROR",
        sourceService: "WEBHOOK_DISPATCHER",
        correlationKey,
        affectedWorkflows: [testWorkflowId],
      });

      expect(second.id).toBe(first.id);

      const timeline = await prisma.operationalIncidentTimelineEvent.findMany({
        where: { incidentId: first.id },
      });
      expect(timeline.length).toBe(2);
      expect((timeline[1].details as any)?.deduplicated).toBe(true);
    });

    it("advances incident through state machine lifecycle and records timeline events", async () => {
      // 1. OPEN -> ACKNOWLEDGED
      const ack = await incidentService.updateStatus(
        workspaceId,
        incidentId,
        "ACKNOWLEDGED",
        ownerUserId,
        "Investigating elevated 429 backoff"
      );
      expect(ack.status).toBe("ACKNOWLEDGED");
      expect(ack.acknowledgedAt).toBeDefined();

      // 2. ACKNOWLEDGED -> INVESTIGATING
      const inv = await incidentService.updateStatus(workspaceId, incidentId, "INVESTIGATING", ownerUserId);
      expect(inv.status).toBe("INVESTIGATING");

      // 3. INVESTIGATING -> RESOLVED
      const res = await incidentService.updateStatus(
        workspaceId,
        incidentId,
        "RESOLVED",
        ownerUserId,
        "Upstream vendor rate limits mitigated"
      );
      expect(res.status).toBe("RESOLVED");
      expect(res.resolvedAt).toBeDefined();

      // 4. RESOLVED -> CLOSED
      const closed = await incidentService.updateStatus(workspaceId, incidentId, "CLOSED", ownerUserId);
      expect(closed.status).toBe("CLOSED");
      expect(closed.closedAt).toBeDefined();
    });

    it("supports operator assignments and notes", async () => {
      const inc = await incidentService.getIncident(workspaceId, incidentId);
      expect(inc).toBeDefined();

      const assigned = await incidentService.assignIncident(
        workspaceId,
        incidentId,
        ownerUserId,
        ownerUserId,
        "Assigned to on-call lead"
      );
      expect(assigned.assignedToUserId).toBe(ownerUserId);

      const note = await incidentService.addNote(
        workspaceId,
        incidentId,
        "External vendor confirmed issue resolved on their end.",
        ownerUserId
      );
      expect(note.eventType).toBe("NOTE_ADDED");
    });

    it("runs evidence-backed root cause analysis identifying failure hypotheses", async () => {
      const analyzed = await incidentService.analyzeRootCause(workspaceId, incidentId);

      expect(analyzed.rootCauseSummary).toBeDefined();
      expect(analyzed.suggestedAction).toBeDefined();
      expect(Array.isArray(analyzed.candidateCauses)).toBe(true);

      const causes = analyzed.candidateCauses as any[];
      expect(causes.length).toBeGreaterThan(0);
      expect(causes[0].hypothesis).toBeDefined();
      expect(causes[0].evidenceStrength).toMatch(/HIGH|MEDIUM|LOW/);
    });
  });

  // ========================================================
  // 3. SAFE SELF-HEALING & REMEDIATION ENGINE
  // ========================================================
  describe("Safe Self-Healing & Remediation Engine", () => {
    let failedExecutionId: string;

    beforeAll(async () => {
      // Create a candidate failed execution for remediation
      const failedExec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.FAILED,
          attempt: 1,
          maxAttempts: 3,
          errorSummary: "Transient worker timeout",
        },
      });
      failedExecutionId = failedExec.id;
    });

    it("provisions default remediation policy with OBSERVE_ONLY autonomy mode", async () => {
      const policy = await remediationEngine.getOrCreatePolicy(workspaceId);
      expect(policy.autonomyMode).toBe("OBSERVE_ONLY");
      expect(policy.allowedActions).toContain("RETRY_RETRYABLE_EXECUTION");
      expect(policy.maxAutomatedActionsPerIncident).toBe(3);
    });

    it("rejects non-allowlisted dangerous actions", async () => {
      await expect(
        remediationEngine.requestRemediation(
          workspaceId,
          {
            actionKey: "DROP_DATABASE_TABLE" as any,
            targetType: "DATABASE",
            targetId: "all",
          },
          ownerUserId
        )
      ).rejects.toThrow(/not an allowlisted remediation operation/i);
    });

    it("holds action in PENDING_APPROVAL status when policy is OBSERVE_ONLY", async () => {
      const op = await remediationEngine.requestRemediation(
        workspaceId,
        {
          actionKey: "RETRY_RETRYABLE_EXECUTION",
          targetType: "EXECUTION",
          targetId: failedExecutionId,
        },
        ownerUserId
      );

      expect(op.status).toBe("PENDING_APPROVAL");
      expect(op.approvedByUserId).toBeNull();
      expect(op.resultSummary).toMatch(/OBSERVE_ONLY/i);
    });

    it("executes action upon manual operator approval and verifies outcome", async () => {
      // Request new operation
      const pendingOp = await remediationEngine.requestRemediation(
        workspaceId,
        {
          actionKey: "RETRY_RETRYABLE_EXECUTION",
          targetType: "EXECUTION",
          targetId: failedExecutionId,
        },
        ownerUserId
      );

      // Operator approves
      const approvedOp = await remediationEngine.approveRemediation(
        workspaceId,
        pendingOp.id,
        true,
        ownerUserId,
        "Approved for retry in SRE console"
      );

      expect(approvedOp.status).toMatch(/COMPLETED|VERIFIED/);
      expect(approvedOp.approvedByUserId).toBe(ownerUserId);

      // Verify a retry execution was spawned with retryOfId pointing to target
      const retryExec = await prisma.workflowExecution.findFirst({
        where: { retryOfId: failedExecutionId },
      });
      expect(retryExec).toBeDefined();
      expect(retryExec?.attempt).toBe(2);
    });

    it("supports operator rejection of risky actions", async () => {
      const pendingOp = await remediationEngine.requestRemediation(
        workspaceId,
        {
          actionKey: "PAUSE_FAILING_DEPLOYMENT",
          targetType: "WORKFLOW",
          targetId: testWorkflowId,
        },
        ownerUserId
      );

      const rejectedOp = await remediationEngine.approveRemediation(
        workspaceId,
        pendingOp.id,
        false,
        ownerUserId,
        "Not needed; vendor resolved incident"
      );

      expect(rejectedOp.status).toBe("REJECTED");
      expect(rejectedOp.resultSummary).toMatch(/vendor resolved/i);
    });

    it("executes allowlisted actions automatically when policy is POLICY_AUTOMATED", async () => {
      // Switch autonomy mode to POLICY_AUTOMATED
      await remediationEngine.updatePolicy(workspaceId, {
        autonomyMode: "POLICY_AUTOMATED",
      });

      // Create a dead-letter outbox event
      const deadLetterEvent = await prisma.transactionalOutboxEvent.create({
        data: {
          workspaceId,
          eventType: "webhook.delivery",
          payload: { test: true },
          idempotencyKey: `outbox_p18_${Date.now()}`,
          status: "DEAD_LETTER",
          attempts: 5,
          maxAttempts: 5,
        },
      });

      const autoOp = await remediationEngine.requestRemediation(
        workspaceId,
        {
          actionKey: "REPLAY_FAILED_OUTBOX_EVENT",
          targetType: "OUTBOX_EVENT",
          targetId: deadLetterEvent.id,
        },
        ownerUserId
      );

      expect(autoOp.status).toMatch(/COMPLETED|VERIFIED/);
      expect(autoOp.approvedByUserId).toBe("SYSTEM_POLICY");

      // Verify outbox event was re-queued to PENDING
      const updatedEvent = await prisma.transactionalOutboxEvent.findUnique({
        where: { id: deadLetterEvent.id },
      });
      expect(updatedEvent?.status).toBe("PENDING");
      expect(updatedEvent?.attempts).toBe(0);
    });
  });

  // ========================================================
  // 4. PREDICTIVE CAPACITY & UNIFIED HEALTH SCORECARD
  // ========================================================
  describe("Predictive Capacity & Unified Health Scorecard", () => {
    it("evaluates predictive signals and tracks capacity warnings", async () => {
      const warnings = await predictiveCapacityService.evaluatePredictiveSignals(workspaceId);
      expect(Array.isArray(warnings)).toBe(true);

      const allWarnings = await predictiveCapacityService.getWarnings(workspaceId);
      expect(Array.isArray(allWarnings)).toBe(true);
    });

    it("generates comprehensive multi-subsystem unified health scorecard", async () => {
      const scorecard = await unifiedHealthService.getUnifiedHealthSummary(workspaceId);

      expect(scorecard.overallStatus).toMatch(/HEALTHY|DEGRADED|UNAVAILABLE/);
      expect(scorecard.timestamp).toBeDefined();

      // Subsystems
      expect(scorecard.services.workers).toBeDefined();
      expect(scorecard.services.workers.status).toMatch(/HEALTHY|DEGRADED|UNAVAILABLE/);

      expect(scorecard.services.queues).toBeDefined();
      expect(scorecard.services.queues.status).toMatch(/HEALTHY|DEGRADED|UNAVAILABLE/);

      expect(scorecard.services.executionEngine).toBeDefined();
      expect(scorecard.services.executionEngine.successRate24h).toBeGreaterThanOrEqual(0);

      expect(scorecard.services.outbox).toBeDefined();
      expect(scorecard.services.database).toBeDefined();
      expect(scorecard.services.regions).toBeDefined();
      expect(scorecard.services.regions.authoritativeRegion).toBe("us-east-1");

      expect(typeof scorecard.activeIncidentCount).toBe("number");
      expect(typeof scorecard.sloAttainmentPct).toBe("number");
    });
  });

  // ========================================================
  // 5. HTTP REST API ENDPOINTS
  // ========================================================
  describe("HTTP API Endpoints", () => {
    it("GET /api/v1/incidents lists workspace incidents", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/incidents",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it("POST /api/v1/incidents/simulate triggers a drill incident", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/incidents/simulate",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          title: "Synthetic Chaos Injection Incident",
          severity: "HIGH",
          category: "INTEGRATION_ERROR",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe("Synthetic Chaos Injection Incident");
      expect(body.data.severity).toBe("HIGH");
      expect(body.data.status).toBe("OPEN");
    });

    it("GET /api/v1/remediation/policy retrieves active workspace policy", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/remediation/policy",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.autonomyMode).toBeDefined();
    });

    it("PUT /api/v1/remediation/policy updates policy autonomy settings", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/v1/remediation/policy",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          autonomyMode: "APPROVAL_REQUIRED",
          cooldownMinutes: 20,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.autonomyMode).toBe("APPROVAL_REQUIRED");
      expect(body.data.cooldownMinutes).toBe(20);
    });

    it("GET /api/v1/observability/unified-health returns 200 with full health scorecard", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/observability/unified-health",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.overallStatus).toBeDefined();
      expect(body.data.services.workers).toBeDefined();
      expect(body.data.services.queues).toBeDefined();
      expect(body.data.services.executionEngine).toBeDefined();
    });

    it("GET /api/v1/observability/slos evaluates and returns reliability objectives", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/observability/slos",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].targetMetric).toBe("SUCCESS_RATE");
    });
  });
});
