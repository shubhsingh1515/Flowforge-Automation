import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import { isUrlSafeFromSsrf } from "../src/engine/security/ssrf.js";
import { resolveExpressions, getNestedValue } from "../src/engine/mapping/resolver.js";
import { conditionHandler } from "../src/engine/nodes/condition.js";
import { transformHandler } from "../src/engine/nodes/transform.js";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { prisma, WorkflowStatus, ExecutionStatus } from "@flowforge/database";

describe("Phase 2 Execution Engine Suite", () => {
  let server: FastifyInstance;
  let userToken: string;
  let workspaceId: string;
  let activeWorkflowId: string;
  let webhookSlug: string;

  beforeAll(async () => {
    // Build server without auto-starting duplicate worker thread during test
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register test user
    const email = `exec-tester-${Date.now()}@flowforge.dev`;
    const regRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Execution Tester",
        email,
        password: "Password123!",
        workspaceName: "Execution WS",
      },
    });

    const regData = JSON.parse(regRes.body);
    userToken = regData.token;
    workspaceId = regData.user.activeWorkspaceId;

    // Create an active workflow with Webhook trigger, Condition, Action, and End
    webhookSlug = `wh_test_${Date.now()}`;
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Test Automation Pipeline",
        description: "Pipeline for integration execution test",
        status: WorkflowStatus.ACTIVE,
        triggerType: "Webhook Trigger",
        webhookSlug,
        versions: {
          create: {
            version: 1,
            isValid: true,
            nodes: [
              {
                id: "n_trigger",
                type: "custom",
                data: {
                  label: "Webhook Trigger",
                  nodeType: "TRIGGER",
                  config: { method: "POST" },
                },
              },
              {
                id: "n_cond",
                type: "custom",
                data: {
                  label: "Condition Filter",
                  nodeType: "CONDITION",
                  config: {
                    field: "trigger.body.amount",
                    operator: "greater_than",
                    value: "100",
                  },
                },
              },
              {
                id: "n_transform",
                type: "custom",
                data: {
                  label: "Data Transform",
                  nodeType: "ACTION",
                  config: {
                    actionType: "transform",
                    template: {
                      leadEmail: "{{trigger.body.email}}",
                      tier: "VIP",
                      calculatedAmount: "{{trigger.body.amount}}",
                    },
                  },
                },
              },
              {
                id: "n_end",
                type: "custom",
                data: {
                  label: "Workflow End",
                  nodeType: "WORKFLOW_END",
                  config: {},
                },
              },
            ],
            edges: [
              { id: "e1", source: "n_trigger", target: "n_cond" },
              { id: "e2", source: "n_cond", sourceHandle: "true", target: "n_transform" },
              { id: "e3", source: "n_transform", target: "n_end" },
            ],
          },
        },
      },
    });

    activeWorkflowId = wf.id;
  });

  afterAll(async () => {
    await server.close();
  });

  // ==========================================
  // 1. SSRF Security Validator Unit Tests
  // ==========================================
  describe("SSRF Protection Guard", () => {
    it("blocks IPv4 loopback (127.0.0.1)", async () => {
      const res = await isUrlSafeFromSsrf("http://127.0.0.1:8080/admin");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks localhost domain", async () => {
      const res = await isUrlSafeFromSsrf("http://localhost:3000/secret");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks RFC 1918 Class A private IP (10.0.0.1)", async () => {
      const res = await isUrlSafeFromSsrf("http://10.0.0.1/internal");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks RFC 1918 Class B private IP (172.16.0.5)", async () => {
      const res = await isUrlSafeFromSsrf("http://172.16.0.5/api");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks RFC 1918 Class C private IP (192.168.1.100)", async () => {
      const res = await isUrlSafeFromSsrf("http://192.168.1.100:9200");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks AWS / Cloud Instance Metadata IP (169.254.169.254)", async () => {
      const res = await isUrlSafeFromSsrf("http://169.254.169.254/latest/meta-data/");
      expect(res.safe).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it("blocks non-HTTP protocols (ftp, file, gopher)", async () => {
      const res1 = await isUrlSafeFromSsrf("file:///etc/passwd");
      expect(res1.safe).toBe(false);

      const res2 = await isUrlSafeFromSsrf("ftp://example.com/file");
      expect(res2.safe).toBe(false);
    });

    it("allows standard public HTTPS destinations", async () => {
      const res = await isUrlSafeFromSsrf("https://httpbin.org/get");
      expect(res.safe).toBe(true);
    });
  });

  // ==========================================
  // 2. Safe Expression Resolver Unit Tests
  // ==========================================
  describe("Safe Expression Resolver", () => {
    const context = {
      trigger: {
        body: {
          id: 42,
          email: "alex@example.com",
          user: {
            profile: {
              firstName: "Alex",
              lastName: "Rivera",
            },
          },
          tags: ["vip", "early-adopter"],
        },
      },
      steps: {
        http_step: {
          output: {
            status: 200,
            remoteId: "rem_999",
          },
        },
      },
    };

    it("retrieves nested properties safely", () => {
      expect(getNestedValue(context, "trigger.body.id")).toBe(42);
      expect(getNestedValue(context, "trigger.body.user.profile.firstName")).toBe("Alex");
      expect(getNestedValue(context, "steps.http_step.output.remoteId")).toBe("rem_999");
      expect(getNestedValue(context, "trigger.body.tags.0")).toBe("vip");
    });

    it("returns undefined for nonexistent paths without throwing", () => {
      expect(getNestedValue(context, "trigger.body.nonexistent.deep")).toBeUndefined();
      expect(getNestedValue(null, "foo.bar")).toBeUndefined();
    });

    it("substitutes exact single value tokens preserving type", () => {
      const resolvedNum = resolveExpressions("{{trigger.body.id}}", context);
      expect(resolvedNum).toBe(42);
    });

    it("substitutes interpolated strings with multiple tokens", () => {
      const template = "User {{trigger.body.user.profile.firstName}} has email {{trigger.body.email}}";
      const result = resolveExpressions(template, context);
      expect(result).toBe("User Alex has email alex@example.com");
    });

    it("recursively resolves nested objects and arrays", () => {
      const templateObj = {
        recipient: "{{trigger.body.email}}",
        meta: {
          code: "{{trigger.body.id}}",
          ref: "{{steps.http_step.output.remoteId}}",
        },
        items: ["Prefix-{{trigger.body.id}}"],
      };

      const result = resolveExpressions(templateObj, context);
      expect(result).toEqual({
        recipient: "alex@example.com",
        meta: {
          code: 42,
          ref: "rem_999",
        },
        items: ["Prefix-42"],
      });
    });

    it("leaves strings without template tokens untouched", () => {
      expect(resolveExpressions("Hello world 123", context)).toBe("Hello world 123");
    });
  });

  // ==========================================
  // 3. Condition Node Evaluation Unit Tests
  // ==========================================
  describe("Condition Node Evaluation", () => {
    const makeCtx = (config: any) => ({
      nodeId: "cond-1",
      nodeName: "Score Check",
      nodeType: "CONDITION" as const,
      config,
      context: {
        trigger: { body: { score: 85, tag: "beta_tester", emptyVal: null } },
        steps: {},
      },
      executionId: "ex-1",
      workflowId: "wf-1",
      correlationId: "cor-1",
      attempt: 1,
    });

    it("evaluates greater_than operator true branch", async () => {
      const res = await conditionHandler.execute(
        makeCtx({ field: "trigger.body.score", operator: "greater_than", value: "80" })
      );
      expect(res.status).toBe("SUCCESS");
      expect(res.selectedBranch).toBe("true");
      expect(res.outputData?.conditionMet).toBe(true);
    });

    it("evaluates greater_than operator false branch", async () => {
      const res = await conditionHandler.execute(
        makeCtx({ field: "trigger.body.score", operator: "greater_than", value: "90" })
      );
      expect(res.status).toBe("SUCCESS");
      expect(res.selectedBranch).toBe("false");
      expect(res.outputData?.conditionMet).toBe(false);
    });

    it("evaluates contains operator correctly", async () => {
      const res = await conditionHandler.execute(
        makeCtx({ field: "trigger.body.tag", operator: "contains", value: "beta" })
      );
      expect(res.selectedBranch).toBe("true");
      expect(res.outputData?.conditionMet).toBe(true);
    });

    it("evaluates is_null operator correctly", async () => {
      const res = await conditionHandler.execute(
        makeCtx({ field: "trigger.body.emptyVal", operator: "is_null" })
      );
      expect(res.selectedBranch).toBe("true");
      expect(res.outputData?.conditionMet).toBe(true);
    });
  });

  // ==========================================
  // 4. End-to-End Workflow Execution Engine Runner
  // ==========================================
  describe("Workflow Execution Engine Runner", () => {
    it("runs complete DAG workflow and persists step executions", async () => {
      // Create execution record
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: activeWorkflowId,
          status: ExecutionStatus.PENDING,
          triggerEvent: {
            email: "john@acme.corp",
            amount: 250,
          },
          correlationId: `test_corr_${Date.now()}`,
          attempt: 1,
          maxAttempts: 3,
        },
      });

      // Run execution through the engine runner
      const runResult = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: activeWorkflowId,
        triggerPayload: {
          body: {
            email: "john@acme.corp",
            amount: 250,
          },
        },
        correlationId: execution.correlationId || "cor-test",
      });

      expect(runResult.status).toBe("SUCCESS");
      expect(runResult.stepsExecuted).toBe(4);

      // Verify execution in database
      const updatedExec = await prisma.workflowExecution.findUnique({
        where: { id: execution.id },
        include: { steps: { orderBy: { startedAt: "asc" } } },
      });

      expect(updatedExec?.status).toBe(ExecutionStatus.SUCCESS);
      expect(updatedExec?.steps.length).toBe(4);

      // Verify Transform step output
      const transformStep = updatedExec?.steps.find((s) => s.nodeId === "n_transform");
      expect(transformStep).toBeDefined();
      expect(transformStep?.status).toBe(ExecutionStatus.SUCCESS);
      expect(transformStep?.outputData).toEqual({
        leadEmail: "john@acme.corp",
        tier: "VIP",
        calculatedAmount: 250,
      });
    });
  });

  // ==========================================
  // 5. Webhook Ingestion API Route & Deduplication
  // ==========================================
  describe("Webhook Ingestion Endpoint", () => {
    it("rejects webhooks targeting unknown or nonexistent slug with 404", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/webhooks/nonexistent_slug_12345",
        payload: { test: true },
      });
      expect(res.statusCode).toBe(404);
    });

    it("ingests webhook event and enqueues execution", async () => {
      const eventId = `evt_${Date.now()}`;
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/webhooks/${webhookSlug}`,
        headers: {
          "x-event-id": eventId,
        },
        payload: {
          customer: "Jane Doe",
          amount: 500,
        },
      });

      expect(res.statusCode).toBe(202);
      const data = JSON.parse(res.body);
      expect(data.status).toBe("queued");
      expect(data.executionId).toBeDefined();
      expect(data.workflowId).toBe(activeWorkflowId);
    });

    it("deduplicates identical incoming event within idempotency window", async () => {
      const eventId = `idemp_evt_${Date.now()}`;

      // First delivery
      const res1 = await server.inject({
        method: "POST",
        url: `/api/v1/webhooks/${webhookSlug}`,
        headers: {
          "x-event-id": eventId,
        },
        payload: { paymentId: "pay_100" },
      });
      expect(res1.statusCode).toBe(202);

      // Duplicate delivery with same event id
      const res2 = await server.inject({
        method: "POST",
        url: `/api/v1/webhooks/${webhookSlug}`,
        headers: {
          "x-event-id": eventId,
        },
        payload: { paymentId: "pay_100" },
      });

      expect(res2.statusCode).toBe(200);
      const data2 = JSON.parse(res2.body);
      expect(data2.status).toBe("duplicate");
      expect(data2.received).toBe(true);
      expect(data2.message).toContain("Duplicate event detected and safely ignored");
    });
  });

  // ==========================================
  // 6. Workflow Activation & Pause API Routes
  // ==========================================
  describe("Workflow State API Controls", () => {
    it("pauses an active workflow", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${activeWorkflowId}/pause`,
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.workflow.status).toBe(WorkflowStatus.PAUSED);
    });

    it("rejects webhook trigger when workflow is paused", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/webhooks/${webhookSlug}`,
        payload: { shouldFail: true },
      });

      expect(res.statusCode).toBe(409);
      const data = JSON.parse(res.body);
      expect(data.message).toContain("currently PAUSED");
    });

    it("reactivates the paused workflow", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${activeWorkflowId}/activate`,
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.workflow.status).toBe(WorkflowStatus.ACTIVE);
    });
  });

  // ==========================================
  // 7. Execution Retry & Worker Health
  // ==========================================
  describe("Execution Diagnostics, Retry & Worker Health", () => {
    let failedExecId: string;

    beforeAll(async () => {
      const failedExec = await prisma.workflowExecution.create({
        data: {
          workflowId: activeWorkflowId,
          status: ExecutionStatus.FAILED,
          triggerEvent: { test: true },
          errorCategory: "TIMEOUT",
          errorSummary: "Step timed out after 30000ms",
          correlationId: `corr_fail_${Date.now()}`,
          attempt: 1,
          maxAttempts: 3,
        },
      });
      failedExecId = failedExec.id;
    });

    it("retries a failed workflow execution", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/executions/${failedExecId}/retry`,
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(202);
      const data = JSON.parse(res.body);
      expect(data.status).toBe("queued");
      expect(data.executionId).toBeDefined();
      expect(data.attempt).toBe(2);
    });

    it("GET /api/v1/health/worker returns worker queue metrics", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/health/worker",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.status).toBe("healthy");
      expect(data.metrics).toBeDefined();
      expect(typeof data.metrics.waiting).toBe("number");
    });
  });
});
