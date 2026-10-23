import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { dataProductRegistryService } from "../src/services/dataProductRegistryService.js";
import { dataSourceAdapterService } from "../src/services/dataSourceAdapterService.js";
import { dataPipelineService } from "../src/services/dataPipelineService.js";
import { dataQualityService } from "../src/services/dataQualityService.js";
import { dataLineageService } from "../src/services/dataLineageService.js";
import { dataQueryService } from "../src/services/dataQueryService.js";

describe("Phase 23 Enterprise Data Intelligence Platform Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;

  // Tenant B for cross-tenant isolation tests
  let tenantBToken: string;
  let workspaceBId: string;
  let userBId: string;

  let workflowId: string;
  let productId: string;
  let sourceId: string;
  let pipelineId: string;
  const unique = Date.now();

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace A Owner
    const owner = await prisma.user.create({
      data: {
        email: `p23_architect_${unique}@flowforge.dev`,
        name: "Principal Data Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Data Intelligence Hub",
        slug: `data-hub-${unique}`,
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

    // 2. Create Workspace B (Tenant B)
    const userB = await prisma.user.create({
      data: {
        email: `p23_tenant_b_${unique}@flowforge.dev`,
        name: "Tenant B Data Steward",
        passwordHash: "hash123",
      },
    });
    userBId = userB.id;

    const workspaceB = await prisma.workspace.create({
      data: {
        name: "Tenant B Data Lab",
        slug: `tenant-b-data-${unique}`,
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

    // 3. Create a seed Workflow in Workspace A
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "E-Commerce Checkout Workflow",
        status: "ACTIVE",
      },
    });
    workflowId = wf.id;

    // Seed some executions for workflow
    await prisma.workflowExecution.create({
      data: {
        workflowId: wf.id,
        status: "SUCCESS",
        durationMs: 420,
        correlationId: `order-101-${unique}`,
      },
    });
    await prisma.workflowExecution.create({
      data: {
        workflowId: wf.id,
        status: "SUCCESS",
        durationMs: 380,
        correlationId: `order-102-${unique}`,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------
  // 1. DATA PRODUCT REGISTRY & VERSIONING
  // -------------------------------------------------------------
  it("creates a governed data product in DRAFT state with canonical hash", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/data-products",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        slug: `orders-lifecycle-${unique}`,
        name: "Orders Lifecycle Dataset",
        description: "Aggregated order completion and fulfillment dataset",
        businessDomain: "SALES",
        criticality: "HIGH",
        dataClassification: "INTERNAL",
        refreshStrategy: "SCHEDULED",
        initialSchema: {
          type: "object",
          properties: {
            orderId: { type: "string" },
            amount: { type: "number" },
            status: { type: "string" },
          },
          required: ["orderId", "amount"],
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.slug).toBe(`orders-lifecycle-${unique}`);
    expect(body.data.lifecycleStatus).toBe("DRAFT");
    expect(body.data.currentVersion).toBe(1);
    expect(body.data.canonicalHash).toBeDefined();
    expect(body.data.versions.length).toBe(1);

    productId = body.data.id;
  });

  it("evaluates schema diff and flags breaking vs compatible changes", () => {
    const oldSchema = {
      type: "object",
      properties: {
        orderId: { type: "string" },
        amount: { type: "number" },
      },
      required: ["orderId"],
    };

    // Compatible addition: optional field
    const compatibleNew = {
      type: "object",
      properties: {
        orderId: { type: "string" },
        amount: { type: "number" },
        customerNote: { type: "string" },
      },
      required: ["orderId"],
    };

    const diff1 = dataProductRegistryService.diffSchemas(oldSchema, compatibleNew);
    expect(diff1.isCompatible).toBe(true);
    expect(diff1.isBreaking).toBe(false);
    expect(diff1.addedFields).toContain("customerNote");

    // Breaking change: removed field & newly required field without default
    const breakingNew = {
      type: "object",
      properties: {
        orderId: { type: "string" },
        taxCode: { type: "string" },
      },
      required: ["orderId", "taxCode"],
    };

    const diff2 = dataProductRegistryService.diffSchemas(oldSchema, breakingNew);
    expect(diff2.isCompatible).toBe(false);
    expect(diff2.isBreaking).toBe(true);
    expect(diff2.removedFields).toContain("amount");
    expect(diff2.breakingReasons.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 2. DATA SOURCE REGISTRATION & ADAPTERS
  // -------------------------------------------------------------
  it("registers an authorized data source pointing to workflow executions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/data-sources",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        slug: `workflow-orders-source-${unique}`,
        name: "Checkout Workflow Execution Feed",
        sourceType: "WORKFLOW_EXECUTION",
        resourceReference: workflowId,
        dataClassification: "INTERNAL",
        allowedRegions: ["us-east-1", "GLOBAL"],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.slug).toBe(`workflow-orders-source-${unique}`);
    expect(body.data.sourceType).toBe("WORKFLOW_EXECUTION");
    sourceId = body.data.id;
  });

  it("enforces regional data residency on data source registration", async () => {
    // Attempt to register source in Tenant B (homeRegion: eu-west-1) requiring us-west-2
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/data-sources",
      headers: {
        authorization: `Bearer ${tenantBToken}`,
      },
      payload: {
        slug: `us-only-source-${unique}`,
        name: "US Restricted Source",
        sourceType: "CUSTOM_ADAPTER",
        resourceReference: "custom",
        allowedRegions: ["us-west-2"],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain("Workspace region 'eu-west-1' is not permitted");
  });

  // -------------------------------------------------------------
  // 3. DECLARATIVE PIPELINE & TRANSFORMATION ENGINE
  // -------------------------------------------------------------
  it("verifies safe in-memory declarative transformation operations", () => {
    const testRecords = [
      { id: "1", userEmail: "Alice@flowforge.dev", amount: 150, category: "ELECTRONICS", status: "NEW" },
      { id: "2", userEmail: "BOB@flowforge.dev", amount: 45, category: "BOOKS", status: "PENDING" },
      { id: "3", userEmail: "Charlie@flowforge.dev", amount: 200, category: "ELECTRONICS", status: "COMPLETED" },
    ];

    // Filter: amount > 50
    const filtered = dataPipelineService.applyOperation(testRecords, {
      type: "filter",
      condition: { field: "amount", operator: "GREATER_THAN", value: 50 },
    });
    expect(filtered.length).toBe(2);

    // Map: LOWERCASE email
    const mapped = dataPipelineService.applyOperation(filtered, {
      type: "map",
      field: "userEmail",
      transform: "LOWERCASE",
    });
    expect(mapped[0].userEmail).toBe("alice@flowforge.dev");

    // Redact: PARTIAL_EMAIL
    const redacted = dataPipelineService.applyOperation(mapped, {
      type: "redact",
      fields: ["userEmail"],
      maskStrategy: "PARTIAL_EMAIL",
    });
    expect(redacted[0].userEmail).toBe("al***@flowforge.dev");

    // Aggregate: Group by category, SUM amount
    const aggregated = dataPipelineService.applyOperation(testRecords, {
      type: "aggregate",
      groupBy: ["category"],
      aggregations: [
        { field: "amount", function: "SUM", as: "totalAmount" },
        { field: "id", function: "COUNT", as: "orderCount" },
      ],
    });
    expect(aggregated.length).toBe(2);
    const electronics = aggregated.find((a) => a.category === "ELECTRONICS");
    expect(electronics.totalAmount).toBe(350);
    expect(electronics.orderCount).toBe(2);
  });

  it("creates a declarative pipeline and executes transformation against source records", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/data-pipelines",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        slug: `order-enrichment-pipeline-${unique}`,
        name: "Order Workflow Enrichment Pipeline",
        dataProductId: productId,
        sourceId: sourceId,
        refreshMode: "FULL_REFRESH",
        initialOperations: [
          {
            type: "filter",
            condition: { field: "status", operator: "EQUALS", value: "SUCCESS" },
          },
          {
            type: "map",
            field: "correlationId",
            transform: "UPPERCASE",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.slug).toBe(`order-enrichment-pipeline-${unique}`);
    pipelineId = body.data.id;
  });

  it("executes the pipeline and materializes DataProductSnapshot in PostgreSQL", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/data-pipelines/${pipelineId}/run`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        runType: "MANUAL",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("SUCCESS");
    expect(body.data.recordsRead).toBeGreaterThanOrEqual(2);
    expect(body.data.recordsWritten).toBeGreaterThanOrEqual(2);
    expect(body.data.snapshotId).toBeDefined();

    // Verify snapshot in database
    const snapshot = await prisma.dataProductSnapshot.findUnique({
      where: { id: body.data.snapshotId },
    });
    expect(snapshot).toBeDefined();
    expect(snapshot?.recordCount).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(snapshot?.records)).toBe(true);
  });

  it("supports pipeline dry-run and small sample previews without snapshot commit", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/data-pipelines/${pipelineId}/preview`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        sampleSize: 5,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("SUCCESS");
    expect(body.data.isDryRun).toBe(true);
    expect(body.data.previewRecords.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 4. DATA QUALITY RULES & PUBLICATION GATES
  // -------------------------------------------------------------
  it("configures quality rules and evaluates them on materialized datasets", async () => {
    // 1. Create a passing rule: REQUIRED_FIELD correlationId
    const rulePassRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/quality-rules`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        name: "Correlation ID Required",
        ruleType: "REQUIRED_FIELD",
        configuration: { field: "correlationId" },
        severity: "ERROR",
        isBlocking: true,
      },
    });
    expect(rulePassRes.statusCode).toBe(201);

    // 2. Create a failing rule: ALLOWED_VALUES on correlationId to test quality gate
    const ruleFailRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/quality-rules`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        name: "Strict Order Prefix",
        ruleType: "ALLOWED_VALUES",
        configuration: { field: "correlationId", allowedValues: ["ORDER-EXPECTED-VALUE"] },
        severity: "CRITICAL",
        isBlocking: true,
      },
    });
    expect(ruleFailRes.statusCode).toBe(201);
    const failRuleId = ruleFailRes.json().data.id;

    // 3. Attempt to publish version 1 - should be BLOCKED by quality gate
    const pubFailRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/versions/1/publish`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        overrideQualityGate: false,
      },
    });
    expect(pubFailRes.statusCode).toBe(400);
    expect(pubFailRes.json().message).toContain("Publication blocked by Data Quality Gate");

    // 4. Now disable the failing rule
    await app.inject({
      method: "PATCH",
      url: `/api/v1/data-quality-rules/${failRuleId}`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        enabled: false,
      },
    });

    // 5. Publish version 1 successfully
    const pubSuccessRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/versions/1/publish`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        overrideQualityGate: false,
      },
    });
    expect(pubSuccessRes.statusCode).toBe(200);
    const published = pubSuccessRes.json().data;
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).toBeDefined();

    // Verify Product Definition lifecycle is updated
    const productCheck = await dataProductRegistryService.getProduct(workspaceId, productId);
    expect(productCheck.lifecycleStatus).toBe("PUBLISHED");
  });

  // -------------------------------------------------------------
  // 5. BOUNDED QUERY API
  // -------------------------------------------------------------
  it("queries the published data product with field selection, filter, and pagination", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/query`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        fields: ["correlationId", "status", "durationMs"],
        filter: {
          field: "status",
          operator: "EQUALS",
          value: "SUCCESS",
        },
        limit: 10,
        cursor: 0,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.product.status).toBe("PUBLISHED");
    expect(body.data.records.length).toBeGreaterThanOrEqual(2);
    expect(body.data.records[0].correlationId).toBeDefined();
    expect(body.data.records[0].status).toBe("SUCCESS");
    expect(body.data.snapshot.recordCount).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------
  // 6. END-TO-END DATA LINEAGE & GRAPH TRAVERSAL
  // -------------------------------------------------------------
  it("traces end-to-end data lineage from source to published data product", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/data-lineage?direction=BOTH&maxDepth=5`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.nodes.length).toBeGreaterThanOrEqual(2);
    expect(body.data.edges.length).toBeGreaterThanOrEqual(1);

    const productNode = body.data.nodes.find((n: any) => n.nodeType === "DATA_PRODUCT");
    expect(productNode).toBeDefined();

    const pipelineNode = body.data.nodes.find((n: any) => n.nodeType === "PIPELINE");
    expect(pipelineNode).toBeDefined();
  });

  // -------------------------------------------------------------
  // 7. DOWNSTREAM IMPACT & LIFECYCLE DEPRECATION
  // -------------------------------------------------------------
  it("analyzes downstream dependencies and executes deprecation and retirement", async () => {
    // Check impact
    const impactRes = await app.inject({
      method: "GET",
      url: `/api/v1/data-products/${productId}/impact`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(impactRes.statusCode).toBe(200);
    const impact = impactRes.json().data;
    expect(impact.productId).toBe(productId);

    // Deprecate product
    const depRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/deprecate`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: { reason: "Replaced by v2 orders dataset" },
    });
    expect(depRes.statusCode).toBe(200);
    expect(depRes.json().data.lifecycleStatus).toBe("DEPRECATED");

    // Retire product
    const retireRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/retire`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(retireRes.statusCode).toBe(200);
    expect(retireRes.json().data.lifecycleStatus).toBe("RETIRED");

    // Query on RETIRED product should fail
    const queryRetiredRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/query`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {},
    });
    expect(queryRetiredRes.statusCode).toBe(400);
    expect(queryRetiredRes.json().message).toContain("is RETIRED and no longer queryable");
  });

  // -------------------------------------------------------------
  // 8. STRICT TENANT ISOLATION
  // -------------------------------------------------------------
  it("enforces strict tenant isolation: Tenant B cannot access Tenant A data products or pipelines", async () => {
    // Tenant B attempts to read Tenant A data product
    const readRes = await app.inject({
      method: "GET",
      url: `/api/v1/data-products/${productId}`,
      headers: {
        authorization: `Bearer ${tenantBToken}`,
      },
    });
    expect(readRes.statusCode).toBe(404);
    expect(readRes.json().message).toContain("not found");

    // Tenant B attempts to run Tenant A pipeline
    const runRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-pipelines/${pipelineId}/run`,
      headers: {
        authorization: `Bearer ${tenantBToken}`,
      },
      payload: { runType: "MANUAL" },
    });
    expect(runRes.statusCode).toBe(404);
    expect(runRes.json().message).toContain("not found");

    // Tenant B attempts to query Tenant A published product
    const queryRes = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/query`,
      headers: {
        authorization: `Bearer ${tenantBToken}`,
      },
      payload: {},
    });
    expect(queryRes.statusCode).toBe(404);
    expect(queryRes.json().message).toContain("not found");
  });

  // -------------------------------------------------------------
  // 9. SCHEMA EVOLUTION & VERSIONING
  // -------------------------------------------------------------
  it("creates a new schema version draft and computes structural version diff", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/data-products/${productId}/versions`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        schemaDefinition: {
          type: "object",
          properties: {
            orderId: { type: "string" },
            amount: { type: "number" },
            status: { type: "string" },
            customerTier: { type: "string" },
          },
          required: ["orderId", "amount"],
        },
        changeSummary: "Added optional customerTier field for segmentation",
        isBreaking: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.version).toBe(2);
    expect(body.data.status).toBe("DRAFT");
    expect(body.data.isBreaking).toBe(false);
    expect(body.data.canonicalHash).toBeDefined();
  });

  // -------------------------------------------------------------
  // 10. PRIVACY & SENSITIVE FIELD REDACTION
  // -------------------------------------------------------------
  it("verifies sensitive fields redaction in data quality failure samples", async () => {
    // Evaluate quality on dataset with sensitive fields
    const sensitiveData = [
      { orderId: "", password: "superSecretPassword123", email: "sensitive_user@flowforge.dev" },
    ];

    const evalResults = await dataQualityService.evaluateRulesOnDataset(
      workspaceId,
      productId,
      sensitiveData
    );

    const requiredFieldEval = evalResults.find((r) => r.ruleType === "REQUIRED_FIELD");
    expect(requiredFieldEval).toBeDefined();
    expect(requiredFieldEval?.status).toBe("FAIL");
    expect(requiredFieldEval?.failureSamples.length).toBeGreaterThan(0);

    const sampleRow = requiredFieldEval?.failureSamples[0].row;
    expect(sampleRow.password).toBe("[REDACTED]");
    expect(sampleRow.email).toBe("se***@flowforge.dev");
  });
});
