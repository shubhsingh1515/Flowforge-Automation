import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { processDefinitionService } from "../src/services/processDefinitionService.js";
import { processInstanceService } from "../src/services/processInstanceService.js";
import { processMiningService } from "../src/services/processMiningService.js";
import { processSlaService } from "../src/services/processSlaService.js";

describe("Phase 21 Business Process Intelligence, Cross-Workflow Orchestration & Process Mining Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let workflowId1: string;
  let workflowId2: string;
  let processDefinitionId: string;
  const unique = Date.now();

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace Owner
    const owner = await prisma.user.create({
      data: {
        email: `p21_architect_${unique}@flowforge.dev`,
        name: "Principal Process Mining Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    // 2. Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: "Enterprise Process Intelligence Lab",
        slug: `bpi-p21-${unique}`,
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

    // 3. Issue Token
    ownerToken = app.jwt.sign(
      { userId: owner.id, email: owner.email, workspaceId, workspaceRole: "OWNER" },
      { expiresIn: "1h" }
    );

    // 4. Create Workflows for milestone mapping
    const wf1 = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Order Processing Service",
        status: "ACTIVE",
      },
    });
    workflowId1 = wf1.id;

    const wf2 = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Invoice & Payment Settlement",
        status: "ACTIVE",
      },
    });
    workflowId2 = wf2.id;
  });

  afterAll(async () => {
    try {
      await prisma.businessProcessEvent.deleteMany({ where: { workspaceId } });
      await prisma.processSlaEvaluation.deleteMany({ where: { workspaceId } });
      await prisma.businessProcessInstance.deleteMany({ where: { workspaceId } });
      await prisma.processSlaPolicy.deleteMany({ where: { workspaceId } });
      await prisma.businessProcessVersion.deleteMany({
        where: { processDefinition: { workspaceId } },
      });
      await prisma.businessProcessDefinition.deleteMany({ where: { workspaceId } });
      await prisma.workflow.deleteMany({ where: { workspaceId } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: ownerUserId } });
    } catch (_err) {}
    await app.close();
  });

  // ----------------------------------------------------
  // 1. Process Definition & Versioning
  // ----------------------------------------------------

  it("POST /api/v1/processes - creates a business process definition with canonical hash and default SLA", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/processes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Order To Cash Fulfillment",
        slug: `order-to-cash-${unique}`,
        description: "Cross-workflow revenue recognition and fulfillment lifecycle",
        businessDomain: "FINANCE",
        criticality: "MISSION_CRITICAL",
        targetSlaDurationMs: 60000,
        milestones: [
          {
            id: "m_order",
            name: "Order Capture",
            workflowId: workflowId1,
            order: 1,
            isEntry: true,
          },
          {
            id: "m_payment",
            name: "Payment Charge",
            workflowId: workflowId2,
            order: 2,
            isTerminal: true,
          },
        ],
        correlationRules: [
          {
            milestoneId: "m_order",
            correlationField: "orderId",
            sourceType: "TRIGGER",
          },
        ],
        outcomeMappings: [
          {
            name: "FULFILLED_SUCCESS",
            milestoneId: "m_payment",
            condition: {
              field: "paymentStatus",
              operator: "EQUALS",
              value: "CAPTURED",
            },
            isSuccess: true,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBeDefined();
    expect(body.data.activeVersionNumber).toBe(1);
    expect(body.data.contentHash).toBeDefined();
    expect(body.data.contentHash.length).toBe(64); // SHA-256

    processDefinitionId = body.data.id;
  });

  it("GET /api/v1/processes - lists business process definitions filterable by domain", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/processes?businessDomain=FINANCE",
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].businessDomain).toBe("FINANCE");
  });

  it("GET /api/v1/processes/:id - retrieves definition by ID and by slug", async () => {
    // By ID
    const res1 = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.data.id).toBe(processDefinitionId);
    expect(body1.data.activeVersion).toBeDefined();

    // By slug
    const res2 = await app.inject({
      method: "GET",
      url: `/api/v1/processes/order-to-cash-${unique}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.data.id).toBe(processDefinitionId);
  });

  it("PATCH /api/v1/processes/:id - updates process governance attributes", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/processes/${processDefinitionId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        criticality: "HIGH",
        escalationContact: "sre-finance@flowforge.dev",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.criticality).toBe("HIGH");
    expect(body.data.escalationContact).toBe("sre-finance@flowforge.dev");
  });

  it("POST /api/v1/processes/:id/versions - publishes an immutable version 2 and updates content hash", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/processes/${processDefinitionId}/versions`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        milestones: [
          {
            id: "m_order",
            name: "Order Capture",
            workflowId: workflowId1,
            order: 1,
            isEntry: true,
          },
          {
            id: "m_fraud",
            name: "Risk & Fraud Review",
            workflowId: workflowId1,
            order: 2,
            requiredApprovals: 1,
          },
          {
            id: "m_payment",
            name: "Payment Charge",
            workflowId: workflowId2,
            order: 3,
            isTerminal: true,
          },
        ],
        targetSlaDurationMs: 90000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.version.versionNumber).toBe(2);
    expect(body.data.definition.activeVersionNumber).toBe(2);
    expect(body.data.version.contentHash).toBeDefined();
  });

  it("GET /api/v1/processes/:id/versions/diff - computes structural differences between versions", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/versions/diff?v1=1&v2=2`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.hasChanged).toBe(true);
    expect(body.data.milestones.added).toHaveLength(1);
    expect(body.data.milestones.added[0].id).toBe("m_fraud");
  });

  // ----------------------------------------------------
  // 2. Cross-Workflow Execution Correlation & Event Ingestion
  // ----------------------------------------------------

  it("POST /api/v1/processes/events/ingest - ingests milestone start event and advances status to IN_PROGRESS", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/processes/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        processDefinitionId,
        correlationKey: `order_corr_101_${unique}`,
        milestoneId: "m_order",
        eventType: "MILESTONE_STARTED",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.instance.status).toBe("IN_PROGRESS");
    expect(body.data.instance.currentMilestoneId).toBe("m_order");
    expect(body.data.deduplicated).toBe(false);
  });

  it("POST /api/v1/processes/events/ingest - provides idempotent ingestion without duplicate records", async () => {
    const idemKey = `idem_evt_101_${unique}`;

    // First ingestion
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/processes/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        processDefinitionId,
        correlationKey: `order_corr_101_${unique}`,
        milestoneId: "m_fraud",
        eventType: "APPROVAL_WAITING",
        idempotencyKey: idemKey,
      },
    });

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.data.deduplicated).toBe(false);
    expect(body1.data.instance.status).toBe("WAITING");

    // Second duplicate ingestion
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/processes/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        processDefinitionId,
        correlationKey: `order_corr_101_${unique}`,
        milestoneId: "m_fraud",
        eventType: "APPROVAL_WAITING",
        idempotencyKey: idemKey,
      },
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.data.deduplicated).toBe(true);
    expect(body2.data.event.id).toBe(body1.data.event.id);
  });

  it("POST /api/v1/processes/events/ingest - completes instance on terminal milestone", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/processes/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        processDefinitionId,
        correlationKey: `order_corr_101_${unique}`,
        milestoneId: "m_payment",
        eventType: "MILESTONE_COMPLETED",
        durationMs: 1450,
        details: { paymentStatus: "CAPTURED", amount: 250 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.instance.status).toBe("COMPLETED");
    expect(body.data.instance.completedAt).toBeDefined();
    expect(body.data.instance.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/v1/processes/:id/instances - lists process instances with status filtering", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/instances?status=COMPLETED`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].correlationKey).toBe(`order_corr_101_${unique}`);
  });

  it("GET /api/v1/processes/instances/:instanceId - returns instance details with events timeline", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/instances`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const instanceId = JSON.parse(listRes.payload).data.items[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/instances/${instanceId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(instanceId);
    expect(body.data.events.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /api/v1/processes/instances/:instanceId/cancel - explicitly cancels an active instance", async () => {
    // Create new active instance
    await app.inject({
      method: "POST",
      url: "/api/v1/processes/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        processDefinitionId,
        correlationKey: `cancel_test_${unique}`,
        milestoneId: "m_order",
        eventType: "MILESTONE_STARTED",
      },
    });

    const inst = await prisma.businessProcessInstance.findFirst({
      where: { workspaceId, correlationKey: `cancel_test_${unique}` },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/processes/instances/${inst!.id}/cancel`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { reason: "Customer requested cancellation" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe("CANCELLED");
    expect(body.data.terminalOutcome).toBe("MANUAL_CANCELLATION");
  });

  // ----------------------------------------------------
  // 3. Process Mining, Bottlenecks & Data Sufficiency Standard
  // ----------------------------------------------------

  it("GET /api/v1/processes/:id/mining - returns INSUFFICIENT_DATA when sample size < 3", async () => {
    // Only 1 completed instance so far
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/mining`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.dataSufficiency).toBe("INSUFFICIENT_DATA");
    expect(body.data.observedPaths).toHaveLength(0);
  });

  it("GET /api/v1/processes/:id/mining - discovers observed paths, stage latency, and bottleneck recommendations when sample >= 3", async () => {
    // Ingest 2 more completed instances with approval wait to reach sample >= 3
    for (let i = 2; i <= 4; i++) {
      const cKey = `order_corr_${i}_${unique}`;
      await app.inject({
        method: "POST",
        url: "/api/v1/processes/events/ingest",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          processDefinitionId,
          correlationKey: cKey,
          milestoneId: "m_order",
          eventType: "MILESTONE_STARTED",
          durationMs: 800,
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/processes/events/ingest",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          processDefinitionId,
          correlationKey: cKey,
          milestoneId: "m_fraud",
          eventType: "APPROVAL_WAITING",
          durationMs: 15000, // Long approval wait to trigger recommendation
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/processes/events/ingest",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          processDefinitionId,
          correlationKey: cKey,
          milestoneId: "m_payment",
          eventType: "MILESTONE_COMPLETED",
          durationMs: 1200,
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/mining`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.dataSufficiency).toBe("SUFFICIENT");
    expect(body.data.instancesExamined).toBeGreaterThanOrEqual(3);
    expect(body.data.observedPaths.length).toBeGreaterThanOrEqual(1);

    // Verify bottleneck detection on approval wait
    expect(body.data.bottlenecks.length).toBeGreaterThanOrEqual(1);
    expect(body.data.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(body.data.recommendations[0].safeToApply).toBe(true);
  });

  it("GET /api/v1/processes/:id/metrics - aggregates end-to-end performance and attainment rates", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/processes/${processDefinitionId}/metrics`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.totalInstances).toBeGreaterThanOrEqual(4);
    expect(body.data.completionRate).toBeGreaterThan(0);
    expect(body.data.medianDurationMs).toBeGreaterThanOrEqual(0);
  });

  // ----------------------------------------------------
  // 4. End-to-End SLA Policies & Incident Integration
  // ----------------------------------------------------

  it("POST /api/v1/processes/:id/sla-policies - configures SLA target and warning threshold", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/processes/${processDefinitionId}/sla-policies`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Order Processing Standard SLA",
        targetDurationMs: 5000, // 5s target to test breach evaluation
        warningThresholdMs: 3000,
        maxApprovalWaitMs: 2000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.targetDurationMs).toBe(5000);
    expect(body.data.warningThresholdMs).toBe(3000);
  });

  it("evaluates breached SLA and triggers deduplicated operational incident", async () => {
    // Create an instance whose startedAt is 10 seconds in the past
    const overdueInstance = await prisma.businessProcessInstance.create({
      data: {
        workspaceId,
        processDefinitionId,
        processVersionId: (await prisma.businessProcessVersion.findFirst({
          where: { processDefinitionId },
        }))!.id,
        correlationKey: `breach_test_${unique}`,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 10000), // 10s ago, target is 5s
      },
    });

    const evalResult = await processSlaService.evaluateInstance(overdueInstance.id);
    expect(evalResult.status).toBe("BREACHED");
    expect(evalResult.isBreached).toBe(true);

    // Verify instance transitioned to AT_RISK
    const updatedInst = await prisma.businessProcessInstance.findUnique({
      where: { id: overdueInstance.id },
    });
    expect(updatedInst?.status).toBe("AT_RISK");

    // Verify operational incident was created
    const incidents = await prisma.operationalIncident.findMany({
      where: {
        workspaceId,
        correlationKey: `sla_breach_${processDefinitionId}_${overdueInstance.correlationKey}`,
      },
    });
    expect(incidents.length).toBe(1);
    expect(incidents[0].title).toContain("SLA Breached");
  });
});
