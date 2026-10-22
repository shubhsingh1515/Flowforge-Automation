import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { validateWorkflowGraph } from "@flowforge/shared";
import { FastifyInstance } from "fastify";

describe("Workflow Graph Validation & Cycle Detection", () => {
  it("rejects graphs without a trigger node", () => {
    const nodes: any[] = [
      { id: "1", data: { label: "Action 1", nodeType: "ACTION" } },
      { id: "2", data: { label: "Action 2", nodeType: "ACTION" } },
    ];
    const edges: any[] = [{ id: "e1", source: "1", target: "2" }];
    const result = validateWorkflowGraph(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.type === "MISSING_TRIGGER")).toBe(true);
  });

  it("detects self loops on a node", () => {
    const nodes: any[] = [
      { id: "1", data: { label: "Trigger", nodeType: "TRIGGER" } },
    ];
    const edges: any[] = [{ id: "e1", source: "1", target: "1" }];
    const result = validateWorkflowGraph(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.type === "INVALID_CONNECTION")).toBe(true);
  });

  it("detects cycles in a directed graph", () => {
    const nodes: any[] = [
      { id: "1", data: { label: "Trigger", nodeType: "TRIGGER" } },
      { id: "2", data: { label: "Condition", nodeType: "CONDITION" } },
      { id: "3", data: { label: "Action", nodeType: "ACTION" } },
    ];
    // 1 -> 2 -> 3 -> 2 (Cycle between 2 and 3)
    const edges: any[] = [
      { id: "e1", source: "1", target: "2" },
      { id: "e2", source: "2", target: "3" },
      { id: "e3", source: "3", target: "2" },
    ];
    const result = validateWorkflowGraph(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.type === "CYCLE_DETECTED")).toBe(true);
  });

  it("validates a healthy acyclic workflow graph", () => {
    const nodes: any[] = [
      { id: "1", data: { label: "Webhook", nodeType: "TRIGGER" } },
      { id: "2", data: { label: "Condition", nodeType: "CONDITION" } },
      { id: "3", data: { label: "HTTP Call", nodeType: "HTTP_REQUEST" } },
      { id: "4", data: { label: "End", nodeType: "WORKFLOW_END" } },
    ];
    const edges: any[] = [
      { id: "e1", source: "1", target: "2" },
      { id: "e2", source: "2", target: "3" },
      { id: "e3", source: "3", target: "4" },
    ];
    const result = validateWorkflowGraph(nodes, edges);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.stats.triggerCount).toBe(1);
    expect(result.stats.totalNodes).toBe(4);
  });
});

describe("Backend API Endpoints", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workflowIdA: string;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/v1/health/live returns ok", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/health/live",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
  });

  it("GET /api/v1/health/ready verifies database connectivity", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/health/ready",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.database).toBe("connected");
  });

  it("rejects unauthenticated request to protected endpoints", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/workflows",
    });
    expect(res.statusCode).toBe(401);
  });

  it("registers user A and logs them in", async () => {
    const emailA = `tester-a-${Date.now()}@flowforge.dev`;
    const regRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "User Alpha",
        email: emailA,
        password: "Password123!",
        workspaceName: "Alpha Workspace",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.body);
    expect(body.token).toBeDefined();
    userAToken = body.token;
  });

  it("registers user B for tenant isolation testing", async () => {
    const emailB = `tester-b-${Date.now()}@flowforge.dev`;
    const regRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "User Beta",
        email: emailB,
        password: "Password123!",
        workspaceName: "Beta Workspace",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.body);
    expect(body.token).toBeDefined();
    userBToken = body.token;
  });

  it("creates a workflow under User A workspace", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: "Alpha Lead Processor",
        description: "Automated lead intake for Alpha",
        status: "ACTIVE",
        nodes: [
          {
            id: "n1",
            type: "custom",
            position: { x: 0, y: 0 },
            data: { label: "Alpha Webhook", nodeType: "TRIGGER" },
          },
        ],
        edges: [],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.workflow.id).toBeDefined();
    workflowIdA = body.workflow.id;
  });

  it("enforces tenant isolation: User B cannot access User A's workflow", async () => {
    const getRes = await server.inject({
      method: "GET",
      url: `/api/v1/workflows/${workflowIdA}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("enforces tenant isolation: User B cannot delete User A's workflow", async () => {
    const delRes = await server.inject({
      method: "DELETE",
      url: `/api/v1/workflows/${workflowIdA}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    expect(delRes.statusCode).toBe(404);
  });

  it("allows User A to update their workflow", async () => {
    const updateRes = await server.inject({
      method: "PUT",
      url: `/api/v1/workflows/${workflowIdA}`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: "Alpha Lead Processor (Updated)",
        status: "PAUSED",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const body = JSON.parse(updateRes.body);
    expect(body.workflow.name).toBe("Alpha Lead Processor (Updated)");
    expect(body.workflow.status).toBe("PAUSED");
  });

  it("allows User A to duplicate their workflow", async () => {
    const dupRes = await server.inject({
      method: "POST",
      url: `/api/v1/workflows/${workflowIdA}/duplicate`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    expect(dupRes.statusCode).toBe(201);
    const body = JSON.parse(dupRes.body);
    expect(body.workflow.name).toContain("Copy of Alpha Lead Processor");
  });

  it("lists dashboard real database metrics for User A", async () => {
    const dashRes = await server.inject({
      method: "GET",
      url: "/api/v1/dashboard/metrics",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    expect(dashRes.statusCode).toBe(200);
    const body = JSON.parse(dashRes.body);
    expect(body.totalWorkflows).toBeGreaterThanOrEqual(1);
    expect(body.successfulRuns).toBe(0); // Real db value
  });

  it("lists integrations catalog without authentication", async () => {
    const intRes = await server.inject({
      method: "GET",
      url: "/api/v1/integrations",
    });
    expect(intRes.statusCode).toBe(200);
    const body = JSON.parse(intRes.body);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("instantiates a template for User A", async () => {
    const tmplRes = await server.inject({
      method: "POST",
      url: "/api/v1/templates/webhook-http-relay/instantiate",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    expect(tmplRes.statusCode).toBe(201);
    const body = JSON.parse(tmplRes.body);
    expect(body.workflow.name).toBe("Webhook to HTTP API Relay");
  });
});
