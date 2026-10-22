import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import {
  evaluateConditionRule,
  evaluateConditionGroup,
  conditionHandler,
} from "../src/engine/nodes/condition.js";
import { filterHandler } from "../src/engine/nodes/filter.js";
import {
  executeTransformation,
  convertType,
  executeMath,
  setDeepValue,
  transformHandler,
} from "../src/engine/nodes/transform.js";
import { loopHandler } from "../src/engine/nodes/loop.js";
import { forkHandler } from "../src/engine/nodes/fork.js";
import { joinHandler } from "../src/engine/nodes/join.js";
import { approvalHandler } from "../src/engine/nodes/approval.js";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { prisma, WorkflowStatus, ExecutionStatus } from "@flowforge/database";

describe("Phase 4 Advanced Control Flow & State Platform Suite", () => {
  let server: FastifyInstance;
  let userTokenA: string;
  let workspaceIdA: string;
  let userTokenB: string;
  let workspaceIdB: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register Tenant A
    const regResA = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Architect Alpha",
        email: `alpha-p4-${Date.now()}@flowforge.dev`,
        password: "Password123!",
        workspaceName: "Alpha Workspace",
      },
    });
    const regDataA = JSON.parse(regResA.body);
    userTokenA = regDataA.token;
    workspaceIdA = regDataA.user.activeWorkspaceId;

    // Register Tenant B
    const regResB = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "User Beta",
        email: `beta-p4-${Date.now()}@flowforge.dev`,
        password: "Password123!",
        workspaceName: "Beta Workspace",
      },
    });
    const regDataB = JSON.parse(regResB.body);
    userTokenB = regDataB.token;
    workspaceIdB = regDataB.user.activeWorkspaceId;
  });

  afterAll(async () => {
    await server.close();
  });

  // ==========================================
  // 1. Multi-Condition Evaluator & Operators
  // ==========================================
  describe("Feature A: Condition Evaluator & Nested Groups", () => {
    it("evaluates equality and numeric operators with proper type coercion", () => {
      // Equals
      expect(evaluateConditionRule("active", "equals", "active")).toBe(true);
      expect(evaluateConditionRule("25", "equals", 25)).toBe(true);
      expect(evaluateConditionRule("active", "not_equals", "pending")).toBe(true);

      // Comparisons
      expect(evaluateConditionRule(100, "greater_than", 50)).toBe(true);
      expect(evaluateConditionRule("100", "greater_than", "50")).toBe(true);
      expect(evaluateConditionRule(50, "greater_than", 100)).toBe(false);
      expect(evaluateConditionRule(75, "greater_than_or_equal", 75)).toBe(true);
      expect(evaluateConditionRule(10, "less_than", 20)).toBe(true);
      expect(evaluateConditionRule(20, "less_than_or_equal", 20)).toBe(true);
    });

    it("evaluates presence, emptiness, and nullability operators", () => {
      expect(evaluateConditionRule("", "is_empty", null)).toBe(true);
      expect(evaluateConditionRule([], "is_empty", null)).toBe(true);
      expect(evaluateConditionRule({}, "is_empty", null)).toBe(true);
      expect(evaluateConditionRule(["lead@acme.com"], "is_not_empty", null)).toBe(true);
      expect(evaluateConditionRule("text", "exists", null)).toBe(true);
      expect(evaluateConditionRule("", "not_exists", null)).toBe(true);
      expect(evaluateConditionRule(null, "is_null", null)).toBe(true);
      expect(evaluateConditionRule("hello", "is_not_null", null)).toBe(true);
    });

    it("evaluates string containment, prefix, suffix, and list inclusion", () => {
      expect(evaluateConditionRule("support@flowforge.dev", "contains", "flowforge")).toBe(true);
      expect(evaluateConditionRule("support@flowforge.dev", "not_contains", "gmail")).toBe(true);
      expect(evaluateConditionRule("https://api.github.com", "starts_with", "https://")).toBe(true);
      expect(evaluateConditionRule("invoice.pdf", "ends_with", ".pdf")).toBe(true);
      expect(evaluateConditionRule("admin", "in_list", ["admin", "owner"])).toBe(true);
      expect(evaluateConditionRule("guest", "not_in_list", "admin, owner")).toBe(true);
    });

    it("evaluates boolean helpers and safe regular expressions", () => {
      expect(evaluateConditionRule(true, "is_true", null)).toBe(true);
      expect(evaluateConditionRule("true", "is_true", null)).toBe(true);
      expect(evaluateConditionRule(false, "is_false", null)).toBe(true);

      // Safe regex matching
      expect(evaluateConditionRule("INV-98234-US", "matches_regex", "^INV-\\d+-[A-Z]{2}$")).toBe(true);
      expect(evaluateConditionRule("invalid-token", "matches_regex", "^INV-\\d+-[A-Z]{2}$")).toBe(false);
      // Malformed regex returns false without throwing
      expect(evaluateConditionRule("test", "matches_regex", "[unclosed-bracket")).toBe(false);
    });

    it("evaluates nested AND/OR rule groups recursively", () => {
      const context = {
        trigger: {
          body: {
            user: { email: "sarah@acme.com", country: "DE", plan: "Enterprise", balance: 500 },
          },
        },
      };

      // Rule: (country equals 'DE' OR country equals 'FR') AND (balance >= 100 AND plan equals 'Enterprise')
      const group = {
        combinator: "AND" as const,
        rules: [
          {
            combinator: "OR" as const,
            rules: [
              { field: "trigger.body.user.country", operator: "equals", value: "DE" },
              { field: "trigger.body.user.country", operator: "equals", value: "FR" },
            ],
          },
          {
            combinator: "AND" as const,
            rules: [
              { field: "trigger.body.user.balance", operator: "greater_than_or_equal", value: 100 },
              { field: "trigger.body.user.plan", operator: "equals", value: "Enterprise" },
            ],
          },
        ],
      };

      expect(evaluateConditionGroup(group, context)).toBe(true);

      // Change country to US -> should fail
      context.trigger.body.user.country = "US";
      expect(evaluateConditionGroup(group, context)).toBe(false);
    });

    it("conditionHandler activates correct selectedBranch output", async () => {
      const resTrue = await conditionHandler.execute({
        nodeId: "cond_1",
        nodeName: "High Value Filter",
        nodeType: "CONDITION",
        config: {
          field: "trigger.body.amount",
          operator: "greater_than",
          value: 100,
        },
        context: { trigger: { body: { amount: 250 } }, steps: {} },
        executionId: "ex_1",
        workflowId: "wf_1",
        correlationId: "cor_1",
        attempt: 1,
      });

      expect(resTrue.status).toBe("SUCCESS");
      expect(resTrue.selectedBranch).toBe("true");

      const resFalse = await conditionHandler.execute({
        nodeId: "cond_1",
        nodeName: "High Value Filter",
        nodeType: "CONDITION",
        config: {
          field: "trigger.body.amount",
          operator: "greater_than",
          value: 100,
        },
        context: { trigger: { body: { amount: 45 } }, steps: {} },
        executionId: "ex_1",
        workflowId: "wf_1",
        correlationId: "cor_1",
        attempt: 1,
      });

      expect(resFalse.status).toBe("SUCCESS");
      expect(resFalse.selectedBranch).toBe("false");
    });
  });

  // ==========================================
  // 2. Filter Node
  // ==========================================
  describe("Feature A: Filter Node", () => {
    it("filters arrays based on condition rules and separates matching/rejected items", async () => {
      const items = [
        { id: "1", type: "pdf", sizeKb: 150 },
        { id: "2", type: "png", sizeKb: 50 },
        { id: "3", type: "pdf", sizeKb: 2000 },
        { id: "4", type: "docx", sizeKb: 80 },
      ];

      const res = await filterHandler.execute({
        nodeId: "filter_1",
        nodeName: "Filter PDF Documents",
        nodeType: "FILTER",
        config: {
          inputArray: "{{trigger.body.files}}",
          field: "type",
          operator: "equals",
          value: "pdf",
        },
        context: {
          trigger: { body: { files: items } },
          steps: {},
        },
        executionId: "ex_2",
        workflowId: "wf_2",
        correlationId: "cor_2",
        attempt: 1,
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.filteredCount).toBe(2);
      expect(res.outputData.totalCount).toBe(4);
      expect(res.outputData.matchingItems).toEqual([
        { id: "1", type: "pdf", sizeKb: 150 },
        { id: "3", type: "pdf", sizeKb: 2000 },
      ]);
    });
  });

  // ==========================================
  // 3. Safe Data Transformations & Expressions
  // ==========================================
  describe("Feature C: Data Transformations & Safe Expressions", () => {
    it("performs type conversion, math, and string operations safely without eval", () => {
      expect(convertType("42.5", "number")).toBe(42.5);
      expect(convertType("true", "boolean")).toBe(true);
      expect(convertType(12345, "string")).toBe("12345");
      expect(executeMath(10, "add", 5)).toBe(15);
      expect(executeMath(20, "multiply", 1.1)).toBeCloseTo(22);
      expect(executeMath(10, "divide", 2)).toBe(5);
    });

    it("transforms structured data mapping with full template interpolation (Prompt Example)", () => {
      const input = { firstName: "Sam", lastName: "Taylor", amount: 25 };
      const context = { trigger: { body: input }, steps: {} };

      const config = {
        fieldRules: [
          {
            targetField: "fullName",
            sourceExpression: "{{trigger.body.firstName}} {{trigger.body.lastName}}",
          },
          {
            targetField: "amountWithTax",
            sourceExpression: "{{trigger.body.amount}}",
            type: "number" as const,
            mathOp: "multiply" as const,
            mathOperand: 1.1,
          },
        ],
      };

      const result = executeTransformation(config, context);
      expect(result.fullName).toBe("Sam Taylor");
      expect(result.amountWithTax).toBeCloseTo(27.5);
    });

    it("POST /api/v1/workflows/preview-transform returns transformation preview safely", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workflows/preview-transform",
        headers: { Authorization: `Bearer ${userTokenA}` },
        payload: {
          sampleInput: { firstName: "Alex", lastName: "Rivera", score: 85 },
          config: {
            fieldRules: [
              { targetField: "displayName", sourceExpression: "Agent: {{trigger.body.firstName}} {{trigger.body.lastName}}" },
              { targetField: "adjustedScore", sourceExpression: "{{trigger.body.score}}", type: "number", mathOp: "add", mathOperand: 10 },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.result.displayName).toBe("Agent: Alex Rivera");
      expect(data.result.adjustedScore).toBe(95);
    });
  });

  // ==========================================
  // 4. For Each Loop & Iteration Control
  // ==========================================
  describe("Feature B: For Each Loop & Iteration Context", () => {
    it("iterates array with scoped context: loop.item, loop.index, loop.length", async () => {
      const items = ["Apple", "Banana", "Cherry"];

      const res = await loopHandler.execute({
        nodeId: "loop_1",
        nodeName: "Process Fruits",
        nodeType: "LOOP",
        config: {
          arrayExpression: "{{trigger.body.fruits}}",
          itemTransform: {
            fieldRules: [
              { targetField: "name", sourceExpression: "{{loop.item}}" },
              { targetField: "position", sourceExpression: "{{loop.index}}", type: "number", mathOp: "add", mathOperand: 1 },
              { targetField: "total", sourceExpression: "{{loop.length}}" },
            ],
          },
        },
        context: {
          trigger: { body: { fruits: items } },
          steps: {},
        },
        executionId: "ex_loop_1",
        workflowId: "wf_loop_1",
        correlationId: "cor_loop_1",
        attempt: 1,
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.totalItems).toBe(3);
      expect(res.outputData.results).toEqual([
        { name: "Apple", position: 1, total: 3 },
        { name: "Banana", position: 2, total: 3 },
        { name: "Cherry", position: 3, total: 3 },
      ]);
    });

    it("respects maxIterations limit to prevent unbounded execution", async () => {
      const largeArray = Array.from({ length: 150 }, (_, i) => `item_${i}`);

      const res = await loopHandler.execute({
        nodeId: "loop_2",
        nodeName: "Bounded Loop",
        nodeType: "LOOP",
        config: {
          arrayExpression: "{{trigger.body.items}}",
          maxIterations: 10,
        },
        context: {
          trigger: { body: { items: largeArray } },
          steps: {},
        },
        executionId: "ex_loop_2",
        workflowId: "wf_loop_2",
        correlationId: "cor_loop_2",
        attempt: 1,
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.processedCount).toBe(10);
      expect(res.outputData.truncated).toBe(true);
    });

    it("returns INVALID_INPUT when input is not an array", async () => {
      const res = await loopHandler.execute({
        nodeId: "loop_3",
        nodeName: "Bad Loop",
        nodeType: "LOOP",
        config: {
          arrayExpression: "{{trigger.body.notAnArray}}",
        },
        context: {
          trigger: { body: { notAnArray: "a string, not a list" } },
          steps: {},
        },
        executionId: "ex_loop_3",
        workflowId: "wf_loop_3",
        correlationId: "cor_loop_3",
        attempt: 1,
      });

      expect(res.status).toBe("FAILED");
      expect(res.errorCategory).toBe("INVALID_INPUT");
    });
  });

  // ==========================================
  // 5. Fork & Join Synchronization
  // ==========================================
  describe("Feature D: Fork & Join Synchronization", () => {
    it("forkHandler and joinHandler aggregate upstream branches into a combined map", async () => {
      const forkRes = await forkHandler.execute({
        nodeId: "fork_1",
        nodeName: "Parallel Fork",
        nodeType: "FORK",
        config: {},
        context: { trigger: {}, steps: {} },
        executionId: "ex_fj",
        workflowId: "wf_fj",
        correlationId: "cor_fj",
        attempt: 1,
      });
      expect(forkRes.status).toBe("SUCCESS");

      // Join node collects all upstream completed steps
      const joinRes = await joinHandler.execute({
        nodeId: "join_1",
        nodeName: "Sync Branches",
        nodeType: "JOIN",
        config: { joinPolicy: "WAIT_ALL" },
        context: {
          trigger: {},
          steps: {
            step_slack: { output: { messageId: "msg_123", channel: "alerts" }, status: "SUCCESS" },
            step_sheets: { output: { rowInserted: 45, status: "OK" }, status: "SUCCESS" },
          },
        },
        executionId: "ex_fj",
        workflowId: "wf_fj",
        correlationId: "cor_fj",
        attempt: 1,
      });

      expect(joinRes.status).toBe("SUCCESS");
      expect(joinRes.outputData.branchesJoined).toBe(2);
      expect(joinRes.outputData.branches.step_slack.messageId).toBe("msg_123");
      expect(joinRes.outputData.branches.step_sheets.rowInserted).toBe(45);
    });
  });

  // ==========================================
  // 6. Human Approval & Pausable Workflows
  // ==========================================
  describe("Feature E: Human Approval & Durable Pause/Resume", () => {
    let approvalWfId: string;
    let approvalExecId: string;
    let createdApprovalId: string;

    beforeAll(async () => {
      // Create a workflow with: Webhook Trigger -> Approval Node -> Transform Action -> End
      const wf = await prisma.workflow.create({
        data: {
          workspaceId: workspaceIdA,
          name: "High Value Payment Approval Flow",
          status: WorkflowStatus.ACTIVE,
          versions: {
            create: {
              version: 1,
              isValid: true,
              nodes: [
                {
                  id: "n_trig",
                  type: "custom",
                  data: { label: "Incoming Payment", nodeType: "TRIGGER" },
                },
                {
                  id: "n_approval",
                  type: "custom",
                  data: {
                    label: "Manager Sign-off",
                    nodeType: "APPROVAL",
                    config: {
                      title: "Authorize ${{trigger.body.amount}} transfer to {{trigger.body.vendor}}",
                      description: "Please confirm invoice number #{{trigger.body.invoiceNo}}",
                      timeoutSeconds: 86400,
                    },
                  },
                },
                {
                  id: "n_post_approval",
                  type: "custom",
                  data: {
                    label: "Process Transfer",
                    nodeType: "ACTION",
                    config: {
                      template: { status: "DISPATCHED", vendor: "{{trigger.body.vendor}}" },
                    },
                  },
                },
              ],
              edges: [
                { id: "e1", source: "n_trig", target: "n_approval" },
                { id: "e2", source: "n_approval", target: "n_post_approval" },
              ],
            },
          },
        },
      });
      approvalWfId = wf.id;
    });

    it("pauses workflow execution at approval node with WAITING_APPROVAL status", async () => {
      // Create pending execution
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: approvalWfId,
          status: ExecutionStatus.PENDING,
          triggerEvent: { amount: 50000, vendor: "AWS Corp", invoiceNo: "INV-2026-99" },
          correlationId: `test_appr_${Date.now()}`,
        },
      });
      approvalExecId = exec.id;

      // Run execution
      const runResult = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: approvalWfId,
        triggerPayload: {
          body: {
            amount: 50000,
            vendor: "AWS Corp",
            invoiceNo: "INV-2026-99",
          },
        },
      });

      // Workflow runner must return WAITING_APPROVAL status
      expect(runResult.status).toBe("WAITING_APPROVAL");

      // Verify database execution record is WAITING_APPROVAL
      const dbExec = await prisma.workflowExecution.findUnique({
        where: { id: exec.id },
      });
      expect(dbExec?.status).toBe(ExecutionStatus.WAITING_APPROVAL);

      // Verify approval record was created
      const approval = await prisma.workflowApproval.findFirst({
        where: { executionId: exec.id },
      });
      expect(approval).toBeDefined();
      expect(approval?.status).toBe("PENDING");
      expect(approval?.title).toBe("Authorize $50000 transfer to AWS Corp");
      expect(approval?.description).toBe("Please confirm invoice number #INV-2026-99");
      createdApprovalId = approval!.id;
    });

    it("GET /api/v1/approvals lists pending approvals for active workspace", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/approvals?status=PENDING",
        headers: { Authorization: `Bearer ${userTokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      const found = body.data.find((a: any) => a.id === createdApprovalId);
      expect(found).toBeDefined();
      expect(found.title).toContain("Authorize $50000 transfer");
    });

    it("STRICT TENANT ISOLATION: Tenant B cannot view or decide Tenant A approvals", async () => {
      // Tenant B tries to view Tenant A's approval
      const viewRes = await server.inject({
        method: "GET",
        url: `/api/v1/approvals/${createdApprovalId}`,
        headers: { Authorization: `Bearer ${userTokenB}` },
      });
      expect(viewRes.statusCode).toBe(404);

      // Tenant B tries to decide Tenant A's approval
      const decideRes = await server.inject({
        method: "POST",
        url: `/api/v1/approvals/${createdApprovalId}/decide`,
        headers: { Authorization: `Bearer ${userTokenB}` },
        payload: { decision: "APPROVED" },
      });
      expect(decideRes.statusCode).toBe(404);
    });

    it("POST /api/v1/approvals/:id/decide approves request, and execution resumes to completion", async () => {
      const decideRes = await server.inject({
        method: "POST",
        url: `/api/v1/approvals/${createdApprovalId}/decide`,
        headers: { Authorization: `Bearer ${userTokenA}` },
        payload: {
          decision: "APPROVED",
          comment: "Verified with finance VP. Approved.",
        },
      });

      expect(decideRes.statusCode).toBe(200);
      const body = JSON.parse(decideRes.body);
      expect(body.success).toBe(true);
      expect(body.decision).toBe("APPROVED");

      // Verify approval status in DB
      const updatedApproval = await prisma.workflowApproval.findUnique({
        where: { id: createdApprovalId },
      });
      expect(updatedApproval?.status).toBe("APPROVED");
      expect(updatedApproval?.comment).toBe("Verified with finance VP. Approved.");

      // Resume execution via engine runner
      const resumeResult = await runWorkflowExecution({
        executionId: approvalExecId,
        workflowId: approvalWfId,
        triggerPayload: {
          body: { amount: 50000, vendor: "AWS Corp", invoiceNo: "INV-2026-99" },
        },
        resumeNodeId: "n_approval",
      });

      expect(resumeResult.status).toBe("SUCCESS");

      // Confirm final database state is SUCCESS
      const finalDbExec = await prisma.workflowExecution.findUnique({
        where: { id: approvalExecId },
      });
      expect(finalDbExec?.status).toBe(ExecutionStatus.SUCCESS);
    });

    it("ANTI-REPLAY: rejects replayed decisions on already finalized approvals", async () => {
      const reDecideRes = await server.inject({
        method: "POST",
        url: `/api/v1/approvals/${createdApprovalId}/decide`,
        headers: { Authorization: `Bearer ${userTokenA}` },
        payload: { decision: "REJECTED" },
      });

      expect(reDecideRes.statusCode).toBe(400);
      const body = JSON.parse(reDecideRes.body);
      expect(body.message).toContain("already been finalized");
    });
  });

  // ==========================================
  // 7. Workflow Run Cancellation
  // ==========================================
  describe("Feature F: Workflow Cancellation", () => {
    it("POST /api/v1/executions/:id/cancel cancels active run and marks pending approvals", async () => {
      // Create a pending execution
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: (await prisma.workflow.findFirst({ where: { workspaceId: workspaceIdA } }))!.id,
          status: ExecutionStatus.RUNNING,
          correlationId: `canc_test_${Date.now()}`,
        },
      });

      // Create a pending approval linked to it
      await prisma.workflowApproval.create({
        data: {
          workspaceId: workspaceIdA,
          workflowId: exec.workflowId,
          executionId: exec.id,
          nodeId: "n_appr_cancel",
          title: "To Be Cancelled",
          status: "PENDING",
        },
      });

      const cancelRes = await server.inject({
        method: "POST",
        url: `/api/v1/executions/${exec.id}/cancel`,
        headers: { Authorization: `Bearer ${userTokenA}` },
        payload: { reason: "Customer requested cancellation of workflow" },
      });

      expect(cancelRes.statusCode).toBe(200);
      const body = JSON.parse(cancelRes.body);
      expect(body.status).toBe("CANCELLED");

      // Verify DB state
      const dbExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
      expect(dbExec?.status).toBe(ExecutionStatus.CANCELLED);
      expect(dbExec?.cancellationReason).toBe("Customer requested cancellation of workflow");

      // Verify linked approval marked as CANCELLED
      const dbAppr = await prisma.workflowApproval.findFirst({ where: { executionId: exec.id } });
      expect(dbAppr?.status).toBe("CANCELLED");
    });
  });
});
