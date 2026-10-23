import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { eventSchemaRegistryService } from "../src/services/eventSchemaRegistryService.js";
import { eventSubscriptionService } from "../src/services/eventSubscriptionService.js";
import { eventDeliveryService } from "../src/services/eventDeliveryService.js";
import { eventIngestionService } from "../src/services/eventIngestionService.js";
import { eventReplayService } from "../src/services/eventReplayService.js";
import { eventObservabilityService } from "../src/services/eventObservabilityService.js";

describe("Phase 22 Enterprise Event-Driven Integration Fabric Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;

  // Tenant B for cross-tenant isolation tests
  let tenantBToken: string;
  let workspaceBId: string;
  let userBId: string;

  let workflowId: string;
  let processDefinitionId: string;
  let subscriptionId: string;
  const unique = Date.now();

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace A Owner
    const owner = await prisma.user.create({
      data: {
        email: `p22_architect_${unique}@flowforge.dev`,
        name: "Principal Integration Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Event Fabric Testing Lab",
        slug: `event-fabric-${unique}`,
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

    // 2. Create Workspace B for Tenant Isolation Verification
    const userB = await prisma.user.create({
      data: {
        email: `tenant_b_${unique}@flowforge.dev`,
        name: "Tenant B User",
        passwordHash: "hash123",
      },
    });
    userBId = userB.id;

    const workspaceB = await prisma.workspace.create({
      data: {
        name: "Tenant B Isolated Lab",
        slug: `tenant-b-${unique}`,
        ownerId: userB.id,
        homeRegion: "eu-west-1",
        dataResidency: "EU",
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

    // 3. Create Workflow for event trigger target
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Order Fulfillment Pipeline",
        status: "ACTIVE",
      },
    });
    workflowId = wf.id;

    // 4. Create Business Process for Phase 21 integration target
    const proc = await prisma.businessProcessDefinition.create({
      data: {
        workspaceId,
        name: "Order Lifecycle Process",
        slug: `order-lifecycle-${unique}`,
        activeVersionNumber: 1,
        contentHash: "hash-initial",
      },
    });
    processDefinitionId = proc.id;

    await prisma.businessProcessVersion.create({
      data: {
        processDefinitionId: proc.id,
        versionNumber: 1,
        contentHash: "hash-initial",
        milestones: [
          {
            id: "m_order",
            name: "Order Processing",
            workflowId,
            order: 1,
            isEntry: true,
          },
        ] as any,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.eventDeliveryAttempt.deleteMany({
        where: { delivery: { workspaceId } },
      });
      await prisma.eventDelivery.deleteMany({ where: { workspaceId } });
      await prisma.eventReplayJob.deleteMany({ where: { workspaceId } });
      await prisma.eventSubscription.deleteMany({ where: { workspaceId } });
      await prisma.platformEvent.deleteMany({ where: { workspaceId } });
      await prisma.eventSchemaVersion.deleteMany({
        where: { schemaDefinition: { workspaceId } },
      });
      await prisma.eventSchemaDefinition.deleteMany({ where: { workspaceId } });
      await prisma.businessProcessVersion.deleteMany({
        where: { processDefinitionId },
      });
      await prisma.businessProcessDefinition.deleteMany({ where: { workspaceId } });
      await prisma.workflowExecution.deleteMany({ where: { workflowId } });
      await prisma.workflow.deleteMany({ where: { workspaceId } });
      await prisma.workspaceMembership.deleteMany({
        where: { workspaceId: { in: [workspaceId, workspaceBId] } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: [workspaceId, workspaceBId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerUserId, userBId] } },
      });
    } catch (_err) {}
    await app.close();
  });

  // ----------------------------------------------------
  // 1. Schema Registry & Governance
  // ----------------------------------------------------

  it("POST /api/v1/events/schemas - registers an event schema with initial published version and content hash", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/schemas",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "order.placed",
        description: "Emitted when a customer checkout is authorized",
        businessDomain: "FINANCE",
        dataClassification: "INTERNAL",
        compatibilityMode: "BACKWARD",
        jsonSchema: {
          type: "object",
          required: ["orderId", "amount"],
          properties: {
            orderId: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
          },
        },
        samplePayload: { orderId: "ord_101", amount: 250, currency: "USD" },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.eventType).toBe("order.placed");
    expect(body.data.activeVersionNumber).toBe(1);
    expect(body.data.activeVersion.status).toBe("PUBLISHED");
    expect(body.data.activeVersion.contentHash).toBeDefined();
  });

  it("GET /api/v1/events/schemas - lists event schema definitions in workspace", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/events/schemas",
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].eventType).toBe("order.placed");
  });

  it("POST /api/v1/events/schemas/:eventType/versions - enforces backward compatibility checks", async () => {
    // Proposing breaking change (adding new required field without default) should fail unless isBreaking is true
    const resBreaking = await app.inject({
      method: "POST",
      url: "/api/v1/events/schemas/order.placed/versions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        changeSummary: "Add mandatory shippingAddress field",
        isBreaking: false,
        jsonSchema: {
          type: "object",
          required: ["orderId", "amount", "shippingAddress"], // Added required field
          properties: {
            orderId: { type: "string" },
            amount: { type: "number" },
            shippingAddress: { type: "string" },
          },
        },
      },
    });

    expect(resBreaking.statusCode).toBe(500); // Throws compatibility violation

    // Overriding with isBreaking: true succeeds
    const resAllowed = await app.inject({
      method: "POST",
      url: "/api/v1/events/schemas/order.placed/versions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        changeSummary: "Add mandatory shippingAddress field with administrative approval",
        isBreaking: true,
        jsonSchema: {
          type: "object",
          required: ["orderId", "amount", "shippingAddress"],
          properties: {
            orderId: { type: "string" },
            amount: { type: "number" },
            shippingAddress: { type: "string" },
          },
        },
      },
    });

    expect(resAllowed.statusCode).toBe(201);
    const body = JSON.parse(resAllowed.payload);
    expect(body.data.version.versionNumber).toBe(2);
    expect(body.data.version.isBreaking).toBe(true);
  });

  // ----------------------------------------------------
  // 2. Subscriptions & Declarative Filter Routing
  // ----------------------------------------------------

  it("POST /api/v1/events/subscriptions - creates a subscription with declarative filter expression", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/subscriptions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "High Value Order Trigger",
        eventTypes: ["order.*"], // Wildcard pattern
        destinationType: "WORKFLOW_TRIGGER",
        destinationConfig: { workflowId },
        filterExpression: {
          operator: "AND",
          conditions: [
            { field: "data.amount", operator: "GREATER_THAN", value: 100 },
          ],
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe("High Value Order Trigger");
    expect(body.data.status).toBe("ACTIVE");

    subscriptionId = body.data.id;
  });

  it("GET /api/v1/events/subscriptions - lists active subscriptions", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/events/subscriptions",
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].id).toBe(subscriptionId);
  });

  // ----------------------------------------------------
  // 3. Event Ingestion & Idempotency
  // ----------------------------------------------------

  it("POST /api/v1/events/ingest - ingests valid event and dispatches matching workflow execution", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "order.placed",
        source: "com.flowforge.billing",
        correlationId: `corr_ord_${unique}`,
        deliveryKey: `idem_ord_${unique}`,
        data: {
          orderId: `ord_9901_${unique}`,
          amount: 250, // Matches filter (> 100)
          currency: "USD",
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe("ACCEPTED");
    expect(body.data.eventId).toBeDefined();
    expect(body.data.dispatchedDeliveriesCount).toBeGreaterThanOrEqual(1);

    // Verify workflow execution was queued
    const exec = await prisma.workflowExecution.findFirst({
      where: { workflowId, correlationId: `corr_ord_${unique}` },
    });
    expect(exec).toBeDefined();
    expect(exec?.status).toBe("PENDING");
  });

  it("POST /api/v1/events/ingest - handles duplicate event idempotently without duplicate dispatches", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "order.placed",
        deliveryKey: `idem_ord_${unique}`, // Duplicate key
        data: { orderId: `ord_9901_${unique}`, amount: 250 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe("DUPLICATE");
  });

  it("POST /api/v1/events/ingest - rejects event failing schema validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "order.placed",
        data: { currency: "USD" }, // Missing required 'orderId' and 'amount'
      },
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe("REJECTED");
    expect(body.data.validationErrors).toBeDefined();
    expect(body.data.validationErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/v1/events/ingest/batch - accepts bounded batch of events", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest/batch",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        events: [
          {
            eventType: "order.placed",
            data: { orderId: `batch_1_${unique}`, amount: 150 },
          },
          {
            eventType: "order.placed",
            data: { orderId: `batch_2_${unique}`, amount: 50 }, // Does not match filter (> 100)
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.total).toBe(2);
    expect(body.data.accepted).toBe(2);
  });

  // ----------------------------------------------------
  // 4. Phase 21 Business Process Integration
  // ----------------------------------------------------

  it("routes event to Phase 21 Business Process milestone deterministically", async () => {
    // Create subscription targeting PROCESS_MILESTONE
    const subRes = await app.inject({
      method: "POST",
      url: "/api/v1/events/subscriptions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Process Milestone Ingester",
        eventTypes: ["order.authorized"],
        destinationType: "PROCESS_MILESTONE",
        destinationConfig: {
          processDefinitionId,
          milestoneId: "m_order",
          correlationKeyField: "orderId",
        },
      },
    });
    expect(subRes.statusCode).toBe(201);

    // Ingest matching event
    const ingestRes = await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "order.authorized",
        correlationId: `proc_corr_${unique}`,
        data: {
          orderId: `proc_order_${unique}`,
          total: 500,
        },
      },
    });
    expect(ingestRes.statusCode).toBe(201);

    // Verify Phase 21 BusinessProcessInstance was created and moved to IN_PROGRESS
    const processInstance = await prisma.businessProcessInstance.findFirst({
      where: {
        workspaceId,
        processDefinitionId,
        correlationKey: `proc_order_${unique}`,
      },
    });
    expect(processInstance).toBeDefined();
    expect(processInstance?.status).toBe("IN_PROGRESS");
    expect(processInstance?.currentMilestoneId).toBe("m_order");
  });

  // ----------------------------------------------------
  // 5. Outbound Webhook SSRF Protection & Dead-Letter Handling
  // ----------------------------------------------------

  it("blocks SSRF attempts on outbound webhooks and marks delivery DEAD_LETTER", async () => {
    const subRes = await app.inject({
      method: "POST",
      url: "/api/v1/events/subscriptions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Malicious Webhook Target",
        eventTypes: ["security.alert"],
        destinationType: "OUTBOUND_WEBHOOK",
        destinationConfig: {
          webhookUrl: "http://127.0.0.1:8080/internal/keys", // Forbidden loopback address
        },
      },
    });
    const ssrfSubId = JSON.parse(subRes.payload).data.id;

    // Ingest event
    await app.inject({
      method: "POST",
      url: "/api/v1/events/ingest",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        eventType: "security.alert",
        data: { threat: "Test probe" },
      },
    });

    // Verify delivery failed with SSRF_BLOCKED and moved to DEAD_LETTER
    const delivery = await prisma.eventDelivery.findFirst({
      where: { subscriptionId: ssrfSubId },
    });
    expect(delivery).toBeDefined();
    expect(delivery?.status).toBe("DEAD_LETTER");
    expect(delivery?.lastErrorCategory).toBe("SSRF_BLOCKED");
  });

  // ----------------------------------------------------
  // 6. Dead-Letter Replay & Replay Jobs
  // ----------------------------------------------------

  it("POST /api/v1/events/replay-jobs - executes controlled dead-letter replay with dry-run support", async () => {
    // Dry run
    const dryRunRes = await app.inject({
      method: "POST",
      url: "/api/v1/events/replay-jobs",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Dry Run Dead-Letter Assessment",
        status: "DEAD_LETTER",
        isDryRun: true,
      },
    });

    expect(dryRunRes.statusCode).toBe(201);
    const dryRunBody = JSON.parse(dryRunRes.payload);
    expect(dryRunBody.data.isDryRun).toBe(true);
    expect(dryRunBody.data.totalEvents).toBeGreaterThanOrEqual(1);
    expect(dryRunBody.data.processedEvents).toBe(0);
  });

  // ----------------------------------------------------
  // 7. Cross-Tenant Isolation
  // ----------------------------------------------------

  it("enforces tenant boundary: Tenant B cannot access or replay Tenant A events or subscriptions", async () => {
    // Tenant B tries to get Tenant A's subscription
    const subRes = await app.inject({
      method: "GET",
      url: `/api/v1/events/subscriptions/${subscriptionId}`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });
    expect(subRes.statusCode).toBe(500); // Access denied in workspace

    // Tenant B tries to replay Tenant A's delivery
    const delivery = await prisma.eventDelivery.findFirst({
      where: { workspaceId },
    });
    const replayRes = await app.inject({
      method: "POST",
      url: `/api/v1/events/deliveries/${delivery!.id}/replay`,
      headers: { authorization: `Bearer ${tenantBToken}` },
    });
    expect(replayRes.statusCode).toBe(500); // Delivery not found in Tenant B workspace
  });

  // ----------------------------------------------------
  // 8. Pipeline Metrics & Observability
  // ----------------------------------------------------

  it("GET /api/v1/events/metrics - returns aggregated pipeline throughput and latency percentiles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/events/metrics?timeRangeHours=24",
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.ingestedCount).toBeGreaterThanOrEqual(1);
    expect(body.data.activeSubscriptions).toBeGreaterThanOrEqual(1);
    expect(body.data.medianLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
