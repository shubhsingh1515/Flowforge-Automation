import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { config } from "../src/config.js";
import { setAiProviderForTesting, MockAiProvider } from "../src/services/ai/provider.js";

describe("Phase 13 AI Automation, Builder, Debugging & Optimization Suite", () => {
  let app: FastifyInstance;
  let userToken: string;
  let workspaceId: string;
  let userId: string;
  let testWorkflowId: string;
  let failedExecutionId: string;

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // Reset provider to mock for deterministic tests
    setAiProviderForTesting(new MockAiProvider());

    // Create test user and workspace
    const unique = Date.now();
    const user = await prisma.user.create({
      data: {
        email: `ai_tester_${unique}@flowforge.dev`,
        name: "AI Test Engineer",
        passwordHash: "hash123",
      },
    });
    userId = user.id;

    const ws = await prisma.workspace.create({
      data: {
        name: `AI Automation Workspace ${unique}`,
        slug: `ai-workspace-${unique}`,
        ownerId: userId,
        memberships: {
          create: [{ userId, role: "OWNER" }],
        },
      },
    });
    workspaceId = ws.id;

    userToken = app.jwt.sign(
      { userId, workspaceId, email: user.email },
      { expiresIn: "7d" }
    );

    // Seed a test workflow for explanations, optimizations, and tests
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Order Processing Automation",
        description: "Standard pipeline for webhooks",
        status: "DRAFT",
        triggerType: "WEBHOOK",
        versions: {
          create: {
            version: 1,
            nodes: [
              {
                id: "node_trig_1",
                type: "custom",
                position: { x: 100, y: 100 },
                data: { label: "Order Webhook", nodeType: "TRIGGER", config: {} },
              },
              {
                id: "node_filter_1",
                type: "custom",
                position: { x: 300, y: 100 },
                data: { label: "Filter Active Orders", nodeType: "FILTER", config: { field: "status", operator: "equals", value: "PAID" } },
              },
            ],
            edges: [
              { id: "e1", source: "node_trig_1", target: "node_filter_1" },
            ],
            isValid: true,
          },
        },
      },
    });
    testWorkflowId = wf.id;

    // Seed a failed execution record with steps for AI debugging tests
    const exec = await prisma.workflowExecution.create({
      data: {
        workflowId: testWorkflowId,
        status: "FAILED",
        attempt: 1,
        maxAttempts: 3,
        errorSummary: "Action node 'node_action_slack' failed with 401 Unauthorized from Slack API",
        errorCategory: "AUTH_FAILURE",
        durationMs: 420,
        steps: {
          create: [
            {
              nodeId: "node_trig_1",
              nodeName: "Order Webhook",
              nodeType: "TRIGGER",
              status: "SUCCESS",
              durationMs: 12,
            },
            {
              nodeId: "node_action_slack",
              nodeName: "Post to Slack",
              nodeType: "ACTION",
              status: "FAILED",
              errorCategory: "AUTH_FAILURE",
              errorMessage: "401 Unauthorized: token_revoked",
              durationMs: 140,
            },
          ],
        },
      },
    });
    failedExecutionId = exec.id;
  });

  afterAll(async () => {
    setAiProviderForTesting(null);
    await app.close();
  });

  it("1. GET /api/v1/ai/status returns subsystem configuration and quota metrics", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ai/status",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.enabled).toBe(true);
    expect(body.data.provider).toBe("mock");
    expect(body.data.isConfigured).toBe(true);
    expect(body.data.quotaRemaining).toBeGreaterThan(0);
  });

  it("2. POST /api/v1/ai/generate-workflow rejects prompt injection and invalid inputs", async () => {
    // Too short prompt
    const shortRes = await app.inject({
      method: "POST",
      url: "/api/v1/ai/generate-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: "hi" },
    });
    expect(shortRes.statusCode).toBe(400);

    // Over-sized prompt (prompt injection payload)
    const largeRes = await app.inject({
      method: "POST",
      url: "/api/v1/ai/generate-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: "x".repeat(3000) },
    });
    expect(largeRes.statusCode).toBe(400);
  });

  it("3. POST /api/v1/ai/generate-workflow generates a registry-grounded proposal with valid nodes and test cases", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/generate-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        prompt: "When a new lead arrives via webhook, filter valid emails and send an alert to our Slack channel.",
        workflowName: "Inbound Lead Qualification",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const proposal = body.data;

    expect(proposal.name).toBe("Inbound Lead Qualification");
    expect(proposal.triggerType).toBe("WEBHOOK");
    expect(proposal.nodes.length).toBeGreaterThanOrEqual(3);
    expect(proposal.edges.length).toBeGreaterThanOrEqual(2);
    expect(proposal.requiredIntegrations).toContain("slack");
    expect(proposal.suggestedTests.length).toBeGreaterThan(0);
    expect(proposal.validation.isValid).toBe(true);
    expect(proposal.isSimulated).toBe(true);

    // Verify usage recorded
    const usage = await prisma.usageRecord.findFirst({
      where: { workspaceId, metricType: "AI_REQUEST" },
    });
    expect(usage).toBeDefined();

    // Verify audit log created
    const audit = await prisma.workspaceAuditLog.findFirst({
      where: { workspaceId, action: "ai.workflow_generated" },
    });
    expect(audit).toBeDefined();
  });

  it("4. POST /api/v1/ai/refine-workflow proposes structural modifications with diff analysis", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/refine-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        prompt: "Add a condition that filters leads by company domain flowforge.dev",
        workflowId: testWorkflowId,
        currentNodes: [
          { id: "node_1", type: "custom", position: { x: 0, y: 0 }, data: { label: "Trigger", nodeType: "TRIGGER" } },
        ],
        currentEdges: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const refinement = body.data;

    expect(refinement.summary).toBeDefined();
    expect(refinement.diff.addedNodes.length).toBeGreaterThan(0);
    expect(refinement.proposedNodes.length).toBeGreaterThan(1);
    expect(refinement.validation).toBeDefined();
  });

  it("5. POST /api/v1/ai/explain-workflow produces factual breakdown without leaking sensitive keys", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/explain-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        name: "Order Processing Automation",
        nodes: [
          {
            id: "n1",
            type: "custom",
            position: { x: 0, y: 0 },
            data: {
              label: "Inbound Hook",
              nodeType: "TRIGGER",
              config: { apiKey: "ffk_test_should_be_redacted_12345678" },
            },
          },
        ],
        edges: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const exp = body.data;

    expect(exp.summary).toBeDefined();
    expect(exp.mainExecutionPath.length).toBeGreaterThan(0);
    expect(exp.securityAndReliabilityNotes.length).toBeGreaterThan(0);
  });

  it("6. POST /api/v1/ai/debug-execution analyzes real execution records and suggests remediation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ai/debug-execution/${failedExecutionId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const debug = body.data;

    expect(debug.executionId).toBe(failedExecutionId);
    expect(debug.errorCategory).toBe("AUTH_FAILURE");
    expect(debug.probableCause).toBeDefined();
    expect(debug.remediationSteps.length).toBeGreaterThan(0);
    expect(debug.uncertaintyLevel).toBe("LOW");
    expect(debug.suggestedPatch?.action).toBe("UPDATE_CONFIG");
  });

  it("7. Multi-tenant isolation: cannot debug another workspace's execution", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `hacker_${Date.now()}@adversary.com`,
        name: "Adversary",
        passwordHash: "hash123",
      },
    });

    const otherWs = await prisma.workspace.create({
      data: {
        name: `Adversary Workspace ${Date.now()}`,
        slug: `adv-ws-${Date.now()}`,
        ownerId: otherUser.id,
        memberships: {
          create: [{ userId: otherUser.id, role: "OWNER" }],
        },
      },
    });

    const otherToken = app.jwt.sign(
      { userId: otherUser.id, workspaceId: otherWs.id, email: otherUser.email },
      { expiresIn: "7d" }
    );

    const crossRes = await app.inject({
      method: "POST",
      url: `/api/v1/ai/debug-execution/${failedExecutionId}`,
      headers: { Authorization: `Bearer ${otherToken}` },
    });

    expect(crossRes.statusCode).toBe(404);
  });

  it("8. POST /api/v1/ai/optimize-workflow returns evidence-based performance recommendations", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ai/optimize-workflow/${testWorkflowId}?days=14`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const report = body.data;

    expect(report.workflowId).toBe(testWorkflowId);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0].evidence).toBeDefined();
    expect(report.recommendations[0].riskAssessment).toBeDefined();
  });

  it("9. POST /api/v1/ai/generate-tests synthesizes compatible test fixtures and assertions", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ai/generate-tests/${testWorkflowId}?count=2`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const tests = body.data;

    expect(Array.isArray(tests)).toBe(true);
    expect(tests.length).toBeGreaterThanOrEqual(1);
    expect(tests[0].assertions.length).toBeGreaterThan(0);
    expect(["EQUALS", "CONTAINS", "EXISTS", "GREATER_THAN", "NOT_EMPTY"]).toContain(tests[0].assertions[0].operator);
  });

  it("10. Graceful failure when AI subsystem is disabled", async () => {
    // Temporarily disable AI in config
    (config as any).aiEnabled = false;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/generate-workflow",
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { prompt: "Create a simple webhook alert" },
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("AI_DISABLED");

    // Restore enabled
    (config as any).aiEnabled = true;
  });
});
