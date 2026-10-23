import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { workflowDigitalTwinService } from "../src/services/workflowDigitalTwinService.js";
import { chaosEngineeringService } from "../src/services/chaosEngineeringService.js";
import { workflowOptimizationService } from "../src/services/workflowOptimizationService.js";
import { simulationGateService } from "../src/services/simulationGateService.js";
import { releaseService } from "../src/services/releases.js";

describe("Phase 20 Enterprise Workflow Digital Twin, Simulation, Chaos & Optimization Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let workflowId: string;
  let stagingEnvId: string;
  let prodEnvId: string;
  let releaseArtifactId: string;
  let contentHash: string;
  const unique = Date.now();

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace Owner
    const owner = await prisma.user.create({
      data: {
        email: `p20_twin_${unique}@flowforge.dev`,
        name: "Principal Reliability Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    // 2. Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: "Digital Twin & Simulation Lab",
        slug: `twin-p20-${unique}`,
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
      { expiresIn: "7d" }
    );

    // 4. Create Environments: Staging (Non-production) and Production
    const stagingEnv = await prisma.workflowEnvironment.create({
      data: {
        workspaceId,
        name: "Staging Test Lab",
        slug: `staging-${unique}`,
        type: "STAGING",
        policy: {
          create: {
            workspaceId,
            requireApproval: false,
            requirePassingTests: true,
            requireSimulationCoverage: true,
            prohibitUnsimulatableNodes: false,
            requireChaosExperimentEvidence: true,
          },
        },
      },
    });
    stagingEnvId = stagingEnv.id;

    const prodEnv = await prisma.workflowEnvironment.create({
      data: {
        workspaceId,
        name: "Production Cluster",
        slug: `prod-${unique}`,
        type: "PRODUCTION",
        policy: {
          create: {
            workspaceId,
            requireApproval: true,
            requirePassingTests: true,
            requireSimulationCoverage: true,
            prohibitUnsimulatableNodes: true,
            requireChaosExperimentEvidence: false,
          },
        },
      },
    });
    prodEnvId = prodEnv.id;

    // 5. Create Test Workflow with Trigger -> Condition -> Transform -> HTTP Action
    const initialNodes = [
      { id: "node-1", type: "trigger", data: { label: "Webhook Trigger", nodeType: "TRIGGER" } },
      {
        id: "node-2",
        type: "condition",
        data: {
          label: "Amount Check",
          nodeType: "CONDITION",
          config: { rules: [{ field: "amount", operator: "EQUALS", value: 100 }] },
        },
      },
      {
        id: "node-3",
        type: "transform",
        data: {
          label: "Format Invoice",
          nodeType: "TRANSFORM",
          config: { staticPayload: { currency: "USD" } },
        },
      },
      {
        id: "node-4",
        type: "http",
        data: {
          label: "Dispatch Webhook",
          nodeType: "HTTP",
          config: { url: "https://api.external-billing.example.com/charge" },
        },
      },
    ];

    const initialEdges = [
      { id: "e1-2", source: "node-1", target: "node-2" },
      { id: "e2-3", source: "node-2", target: "node-3", sourceHandle: "true" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ];

    const workflow = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Customer Billing Dispatch",
        status: "ACTIVE",
        triggerType: "WEBHOOK",
        versions: {
          create: {
            version: 1,
            nodes: initialNodes,
            edges: initialEdges,
            isValid: true,
          },
        },
      },
    });
    workflowId = workflow.id;

    // 6. Create immutable release artifact for this workflow
    const sanitized = releaseService.sanitizeDefinition(initialNodes, initialEdges, "WEBHOOK");
    contentHash = releaseService.calculateContentHash({
      formatVersion: "flowforge.release/v1",
      workflowName: workflow.name,
      nodes: sanitized.nodes,
      edges: sanitized.edges,
    });

    const artifact = await prisma.workflowReleaseArtifact.create({
      data: {
        workspaceId,
        workflowId: workflow.id,
        versionNumber: 1,
        releaseNumber: 1,
        formatVersion: "flowforge.release/v1",
        contentHash,
        canonicalDefinition: {
          formatVersion: "flowforge.release/v1",
          workflowName: workflow.name,
          nodes: sanitized.nodes,
          edges: sanitized.edges,
        },
        createdById: owner.id,
      },
    });
    releaseArtifactId = artifact.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ========================================================
  // 1. DIGITAL TWIN SIMULATION & SIDE-EFFECT ISOLATION
  // ========================================================

  it("should execute deterministic Digital Twin simulation without external side effects", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        syntheticTrigger: { amount: 100, customerId: "cust_999" },
        assertions: [
          { operator: "EXECUTION_STATUS_EQUALS", expectedValue: "SIMULATED_SUCCESS" },
          { operator: "PROHIBITED_SIDE_EFFECTS", expectedValue: true },
          { operator: "NO_UNSIMULATABLE_NODES", expectedValue: 0 },
          { operator: "NODE_EXECUTED", nodeId: "node-4" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.simulationRun.status).toBe("SIMULATED_SUCCESS");
    expect(body.simulationRun.allAssertionsPassed).toBe(true);
    expect(body.simulationRun.workflowArtifactHash).toBe(contentHash);
    expect(body.summary.sideEffectsBlockedCount).toBeGreaterThanOrEqual(1);

    // Verify HTTP node was simulated safely with side effects blocked
    const httpNodeOutcome = body.simulationRun.nodeOutcomes["node-4"];
    expect(httpNodeOutcome.status).toBe("SIMULATED_SUCCESS");
    expect(httpNodeOutcome.sideEffectsBlocked).toBe(true);
  });

  it("should evaluate conditional branch skipping deterministically", async () => {
    // Pass amount: 50 -> condition rules require 100 -> branch 'false' selected, node-3 and node-4 skipped
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        syntheticTrigger: { amount: 50 },
        assertions: [
          { operator: "NODE_SKIPPED", nodeId: "node-3" },
          { operator: "NODE_SKIPPED", nodeId: "node-4" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.simulationRun.nodeOutcomes["node-2"].branchTaken).toBe("false");
    expect(body.simulationRun.nodeOutcomes["node-3"].status).toBe("SKIPPED");
    expect(body.simulationRun.nodeOutcomes["node-4"].status).toBe("SKIPPED");
    expect(body.simulationRun.allAssertionsPassed).toBe(true);
  });

  // ========================================================
  // 2. CONTROLLED FAULT INJECTION SCENARIOS
  // ========================================================

  it("should inject HTTP 429 rate limit fault and capture simulated failure", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        syntheticTrigger: { amount: 100 },
        injectedFaults: [
          { nodeId: "node-4", type: "HTTP_429" },
        ],
        assertions: [
          { operator: "EXECUTION_STATUS_EQUALS", expectedValue: "SIMULATED_FAILURE" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.simulationRun.status).toBe("SIMULATED_FAILURE");
    const node4 = body.simulationRun.nodeOutcomes["node-4"];
    expect(node4.status).toBe("SIMULATED_FAILURE");
    expect(node4.error).toContain("HTTP 429 Too Many Requests");
    expect(node4.sideEffectsBlocked).toBe(true);
  });

  it("should inject network timeout and advance virtual clock without sleeping in real time", async () => {
    const startReal = Date.now();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        syntheticTrigger: { amount: 100 },
        injectedFaults: [
          { nodeId: "node-4", type: "TIMEOUT", delayMs: 30000 },
        ],
      },
    });
    const realDuration = Date.now() - startReal;

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.simulationRun.status).toBe("SIMULATED_TIMEOUT");
    expect(body.simulationRun.virtualDurationMs).toBeGreaterThanOrEqual(30000); // 30s in virtual time
    expect(realDuration).toBeLessThan(1000); // Real test execution took < 1s!
  });

  it("should inject cross-region residency boundary violation and return BLOCKED_BY_POLICY", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        syntheticTrigger: { amount: 100 },
        injectedFaults: [
          { nodeId: "node-4", type: "RESIDENCY_VIOLATION" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.simulationRun.status).toBe("BLOCKED_BY_POLICY");
    expect(body.simulationRun.nodeOutcomes["node-4"].status).toBe("BLOCKED_BY_POLICY");
  });

  // ========================================================
  // 3. REUSABLE SCENARIOS & ASSERTION ENGINE
  // ========================================================

  it("should create, list, and run simulation using a persistent scenario fixture", async () => {
    // 1. Create scenario
    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/scenarios`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Standard Invoice Verification",
        description: "Validates currency and successful dispatch",
        syntheticTrigger: { amount: 100, user: "charlie" },
        mockOutputs: {
          "node-4": { status: 200, confirmationCode: "INV-2026-X" },
        },
        expectedOutcome: "SIMULATED_SUCCESS",
        assertions: [
          { nodeId: "node-4", fieldPath: "confirmationCode", operator: "EQUALS", expectedValue: "INV-2026-X" },
        ],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const scenario = createRes.json().data;
    expect(scenario.name).toBe("Standard Invoice Verification");

    // 2. Run simulation using scenarioId
    const runRes = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        scenarioId: scenario.id,
      },
    });

    expect(runRes.statusCode).toBe(200);
    const runBody = runRes.json().data;
    expect(runBody.simulationRun.scenarioId).toBe(scenario.id);
    expect(runBody.simulationRun.status).toBe("SIMULATED_SUCCESS");
    expect(runBody.simulationRun.allAssertionsPassed).toBe(true);
  });

  // ========================================================
  // 4. CRYPTOGRAPHIC HASH BINDING & STALE EVIDENCE
  // ========================================================

  it("should bind simulation to workflow canonical hash and detect stale evidence when workflow changes", async () => {
    // Run simulation on current draft
    const runRes = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/simulations/run`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { syntheticTrigger: { amount: 100 } },
    });
    const runId = runRes.json().data.simulationRun.id;

    // Verify current hash matches -> not stale
    const check1 = await app.inject({
      method: "GET",
      url: `/api/v1/simulations/runs/${runId}/stale-check?contentHash=${contentHash}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(check1.json().isStale).toBe(false);

    // Verify modified / different hash -> stale!
    const check2 = await app.inject({
      method: "GET",
      url: `/api/v1/simulations/runs/${runId}/stale-check?contentHash=altered_sha256_hash_123456789`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(check2.json().isStale).toBe(true);
  });

  // ========================================================
  // 5. CHAOS ENGINEERING IN ISOLATED ENVIRONMENTS
  // ========================================================

  it("should reject chaos experiments targeting PRODUCTION environments", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chaos/experiments",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Dangerous Prod Drill",
        targetEnvironmentId: prodEnvId, // PRODUCTION
        faultType: "WORKER_LOSS",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("Chaos experiments are strictly prohibited against PRODUCTION environments");
  });

  it("should create, approve, execute, and automatically clean up non-production chaos drills", async () => {
    // 1. Create drill on STAGING
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/chaos/experiments",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Worker Failover & Queue Backpressure Drill",
        targetEnvironmentId: stagingEnvId,
        faultType: "WORKER_LOSS",
        maxDurationSeconds: 60,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const exp = createRes.json().data;
    expect(exp.status).toBe("PENDING_APPROVAL");
    expect(exp.cleanupStatus).toBe("PENDING");

    // 2. Approve drill
    const approveRes = await app.inject({
      method: "POST",
      url: `/api/v1/chaos/experiments/${exp.id}/approve`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().data.status).toBe("APPROVED");

    // 3. Execute drill
    const startRes = await app.inject({
      method: "POST",
      url: `/api/v1/chaos/experiments/${exp.id}/start`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(startRes.statusCode).toBe(200);
    const completedExp = startRes.json().data;
    expect(completedExp.status).toBe("COMPLETED");
    expect(completedExp.cleanupStatus).toBe("CLEANED_UP");
    expect(completedExp.recoveryMetrics.duplicateSideEffectsPrevented).toBeGreaterThanOrEqual(1);
    expect(completedExp.recoveryMetrics.outboxRecovered).toBe(true);
  });

  // ========================================================
  // 6. BASELINE COMPARISON & OPTIMIZATION CANDIDATES
  // ========================================================

  it("should compare candidate against baseline, generate structural diffs and recommendations", async () => {
    // Candidate workflow merges node-2 and node-3 into consolidated step
    const candidateNodes = [
      { id: "node-1", type: "trigger", data: { label: "Webhook Trigger", nodeType: "TRIGGER" } },
      {
        id: "node-23",
        type: "transform",
        data: {
          label: "Consolidated Filter & Format",
          nodeType: "TRANSFORM",
          config: { staticPayload: { currency: "USD" } },
        },
      },
      {
        id: "node-4",
        type: "http",
        data: {
          label: "Dispatch Webhook",
          nodeType: "HTTP",
          config: {
            url: "https://api.external-billing.example.com/charge",
            retryPolicy: { maxRetries: 3, backoffMultiplier: 2 },
          },
        },
      },
    ];

    const candidateEdges = [
      { id: "e1-23", source: "node-1", target: "node-23" },
      { id: "e23-4", source: "node-23", target: "node-4" },
    ];

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowId}/optimizations/candidates`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: "Consolidated Pipeline Optimization",
        summary: "Merges linear transforms and tunes retry policies",
        candidateNodes,
        candidateEdges,
      },
    });

    expect(res.statusCode).toBe(201);
    const candidate = res.json().data;
    expect(candidate.status).toBe("DRAFT");
    expect(candidate.structuralDiff.addedNodes.length).toBe(1); // node-23
    expect(candidate.structuralDiff.removedNodes.length).toBe(2); // node-2, node-3
    expect(candidate.recommendations.length).toBeGreaterThanOrEqual(1);

    // Promote candidate to new workflow draft version
    const promoteRes = await app.inject({
      method: "POST",
      url: `/api/v1/optimizations/candidates/${candidate.id}/promote`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().data.candidate.status).toBe("PROMOTED");
    expect(promoteRes.json().data.newVersion.version).toBe(2);
  });

  // ========================================================
  // 7. RELEASE SIMULATION & CHAOS DEPLOYMENT GATES
  // ========================================================

  it("should enforce simulation coverage and chaos evidence release gates in target environment", async () => {
    // 1. Evaluate release gates before running simulation on the release artifact
    // In staging: requirePassingTests=true, requireSimulationCoverage=true, requireChaosExperimentEvidence=true
    // (Test runs were not created yet for this artifact -> should fail gates)
    const gate1 = await app.inject({
      method: "GET",
      url: `/api/v1/releases/${releaseArtifactId}/simulation-gates/${stagingEnvId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(gate1.statusCode).toBe(200);
    expect(gate1.json().data.valid).toBe(false);
    expect(gate1.json().data.reasons.length).toBeGreaterThanOrEqual(1);

    // 2. Provide Passing Test Run
    await prisma.workflowTestRun.create({
      data: {
        workspaceId,
        workflowId,
        testCaseId: (await prisma.workflowTestCase.create({
          data: {
            workspaceId,
            workflowId,
            name: "Smoke Test Case",
          },
        })).id,
        releaseArtifactId,
        releaseContentHash: contentHash,
        status: "PASSED",
      },
    });

    // 3. Provide Passing Simulation Run bound to the EXACT contentHash
    await workflowDigitalTwinService.runSimulation(workspaceId, ownerUserId, {
      workflowId,
      releaseArtifactId,
      syntheticTrigger: { amount: 100 },
    });

    // 4. Re-evaluate release gates -> Now all gates pass!
    const gate2 = await app.inject({
      method: "GET",
      url: `/api/v1/releases/${releaseArtifactId}/simulation-gates/${stagingEnvId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(gate2.statusCode).toBe(200);
    expect(gate2.json().data.valid).toBe(true);
    expect(gate2.json().data.simulationPassed).toBe(true);
    expect(gate2.json().data.testRunPassed).toBe(true);
    expect(gate2.json().data.chaosEvidencePassed).toBe(true);
  });
});
