import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, WorkflowStatus } from "@flowforge/database";

describe("Phase 7: Templates, Versioning, Import/Export, Onboarding & Collaboration Suite", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let workflowAId: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register User A
    const userAEmail = `phase7_usera_${Date.now()}@example.com`;
    const regARes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 7 User A",
        email: userAEmail,
        password: "Password123!",
        workspaceName: "Workspace A Phase 7",
      },
    });
    const regABody = JSON.parse(regARes.body);
    userAToken = regABody.token;
    workspaceAId = regABody.user.activeWorkspaceId;

    // Register User B (for tenant isolation tests)
    const userBEmail = `phase7_userb_${Date.now()}@example.com`;
    const regBRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 7 User B",
        email: userBEmail,
        password: "Password123!",
        workspaceName: "Workspace B Phase 7",
      },
    });
    const regBBody = JSON.parse(regBRes.body);
    userBToken = regBBody.token;
    workspaceBId = regBBody.user.activeWorkspaceId;

    // Create a base workflow for User A
    const wfRes = await server.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: "Order Processing Pipeline",
        description: "Intake customer orders and notify team",
        nodes: [
          {
            id: "node_orig_1",
            type: "custom",
            position: { x: 100, y: 100 },
            data: {
              label: "Order Webhook",
              nodeType: "TRIGGER",
              integrationKey: "webhook",
              config: { method: "POST", path: "/orders" },
            },
          },
          {
            id: "node_orig_2",
            type: "custom",
            position: { x: 400, y: 100 },
            data: {
              label: "Notify Slack",
              nodeType: "ACTION",
              integrationKey: "slack",
              config: { channel: "#orders", message: "New order: {{trigger.orderId}}" },
            },
          },
          {
            id: "node_orig_3",
            type: "custom",
            position: { x: 700, y: 100 },
            data: {
              label: "Finish Flow",
              nodeType: "WORKFLOW_END",
              config: {},
            },
          },
        ],
        edges: [
          { id: "e1-2", source: "node_orig_1", target: "node_orig_2" },
          { id: "e2-3", source: "node_orig_2", target: "node_orig_3" },
        ],
      },
    });
    const wfBody = JSON.parse(wfRes.body);
    workflowAId = wfBody.workflow.id;
  });

  afterAll(async () => {
    // Cleanup created test records
    const wsIds = [workspaceAId, workspaceBId].filter(Boolean);
    if (wsIds.length > 0) {
      await prisma.workflow.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.workflowTemplate.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: wsIds } },
      });
    }
    await prisma.user.deleteMany({
      where: { email: { contains: "phase7" } },
    });
    await server.close();
  });

  // =========================================================================
  // 1. TEMPLATE LIBRARY & SEARCH / FILTERING
  // =========================================================================
  describe("Workflow Template Library Catalog & Filtering", () => {
    it("returns platform starter templates with rich metadata", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/templates",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.templates)).toBe(true);
      expect(body.templates.length).toBeGreaterThanOrEqual(8);

      const slackTpl = body.templates.find((t: any) => t.slug === "webhook-lead-slack");
      expect(slackTpl).toBeDefined();
      expect(slackTpl.category).toBe("Notifications");
      expect(slackTpl.difficulty).toBe("BEGINNER");
      expect(slackTpl.isPlatform).toBe(true);
      expect(slackTpl.nodeCount).toBeGreaterThan(0);
    });

    it("filters templates by category", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/templates?category=Developer",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.templates.length).toBeGreaterThan(0);
      for (const t of body.templates) {
        expect(t.category).toBe("Developer");
      }
    });

    it("filters templates by search term", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/templates?search=Google",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.templates.length).toBeGreaterThan(0);
      const hasGoogle = body.templates.some(
        (t: any) => t.title.includes("Google") || t.description.includes("Google")
      );
      expect(hasGoogle).toBe(true);
    });

    it("retrieves template details by id or slug", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/templates/sheets-lead-recorder",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.template.slug).toBe("sheets-lead-recorder");
      expect(body.template.setupGuide).toContain("Google Sheets");
      expect(body.template.nodes.length).toBe(3);
    });
  });

  // =========================================================================
  // 2. TEMPLATE INSTANTIATION & SAFE ID REMAPPING
  // =========================================================================
  describe("Safe Template Instantiation", () => {
    it("instantiates a template with new unique IDs and draft status", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/templates/webhook-lead-slack/instantiate",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { name: "My New Sales Pipeline" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.workflow.name).toBe("My New Sales Pipeline");
      expect(body.workflow.status).toBe(WorkflowStatus.DRAFT);

      // Verify node IDs were remapped and do NOT match template raw IDs ("node-1", "node-2")
      const nodeIds = body.workflow.nodes.map((n: any) => n.id);
      expect(nodeIds.includes("node-1")).toBe(false);
      expect(nodeIds.includes("node-2")).toBe(false);

      // Verify edge source and target are properly mapped to the remapped node IDs
      const edge = body.workflow.edges[0];
      expect(nodeIds.includes(edge.source)).toBe(true);
      expect(nodeIds.includes(edge.target)).toBe(true);
    });

    it("marks integration nodes needing connections with placeholders", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/templates/webhook-lead-slack/instantiate",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      const slackNode = body.workflow.nodes.find((n: any) => n.data?.integrationKey === "slack");
      expect(slackNode).toBeDefined();
      expect(slackNode.data.needsConnection).toBe(true);
    });
  });

  // =========================================================================
  // 3. WORKFLOW DUPLICATION
  // =========================================================================
  describe("Workflow Duplication", () => {
    it("duplicates workflow with remapped IDs, clean draft state and attribution", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${workflowAId}/duplicate`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.workflow.name).toBe("Copy of Order Processing Pipeline");
      expect(body.workflow.status).toBe(WorkflowStatus.DRAFT);
      expect(body.workflow.id).not.toBe(workflowAId);

      // Fetch duplicated workflow details
      const detailRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${body.workflow.id}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const detailBody = JSON.parse(detailRes.body);
      const dupNodes = detailBody.workflow.nodes;
      expect(dupNodes.some((n: any) => n.id === "node_orig_1")).toBe(false);
    });
  });

  // =========================================================================
  // 4. SAVE WORKFLOW AS WORKSPACE TEMPLATE
  // =========================================================================
  describe("Save Workflow as Reusable Recipe", () => {
    it("saves a workflow as a reusable workspace template recipe", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${workflowAId}/save-as-template`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: "Standard Order Fulfillment Recipe",
          description: "Internal team recipe for order processing",
          category: "Operations",
          difficulty: "BEGINNER",
          tags: ["orders", "slack", "ops"],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.template.title).toBe("Standard Order Fulfillment Recipe");
      expect(body.template.category).toBe("Operations");

      // Verify it appears in workspace templates query
      const listRes = await server.inject({
        method: "GET",
        url: "/api/v1/templates?type=WORKSPACE",
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const listBody = JSON.parse(listRes.body);
      const recipe = listBody.templates.find((t: any) => t.id === body.template.id);
      expect(recipe).toBeDefined();
      expect(recipe.isPlatform).toBe(false);
    });

    it("prevents cross-workspace users from seeing private workspace templates", async () => {
      const listRes = await server.inject({
        method: "GET",
        url: "/api/v1/templates?type=WORKSPACE",
        headers: { authorization: `Bearer ${userBToken}` },
      });
      const listBody = JSON.parse(listRes.body);
      const leak = listBody.templates.some((t: any) => t.title === "Standard Order Fulfillment Recipe");
      expect(leak).toBe(false);
    });
  });

  // =========================================================================
  // 5. VERSION HISTORY, CONCURRENCY & SAFE ROLLBACK
  // =========================================================================
  describe("Workflow Version History & Safe Rollback", () => {
    it("creates an immutable version snapshot when checkpointing", async () => {
      const updateRes = await server.inject({
        method: "PUT",
        url: `/api/v1/workflows/${workflowAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          createVersion: true,
          changeSummary: "Added audit log step",
          nodes: [
            {
              id: "node_orig_1",
              type: "custom",
              position: { x: 100, y: 100 },
              data: { label: "Order Webhook", nodeType: "TRIGGER", config: {} },
            },
            {
              id: "node_orig_2",
              type: "custom",
              position: { x: 400, y: 100 },
              data: { label: "Notify Slack", nodeType: "ACTION", config: {} },
            },
            {
              id: "node_orig_audit",
              type: "custom",
              position: { x: 700, y: 100 },
              data: { label: "Audit Logger", nodeType: "HTTP_REQUEST", config: { url: "https://audit.example.com" } },
            },
            {
              id: "node_orig_3",
              type: "custom",
              position: { x: 1000, y: 100 },
              data: { label: "Finish Flow", nodeType: "WORKFLOW_END", config: {} },
            },
          ],
          edges: [
            { id: "e1-2", source: "node_orig_1", target: "node_orig_2" },
            { id: "e2-audit", source: "node_orig_2", target: "node_orig_audit" },
            { id: "eaudit-3", source: "node_orig_audit", target: "node_orig_3" },
          ],
        },
      });

      expect(updateRes.statusCode).toBe(200);

      // Verify versions list
      const versRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/versions`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(versRes.statusCode).toBe(200);
      const versBody = JSON.parse(versRes.body);
      expect(versBody.versions.length).toBeGreaterThanOrEqual(2);
      expect(versBody.versions[0].version).toBe(2);
      expect(versBody.versions[0].changeSummary).toBe("Added audit log step");
    });

    it("compares two versions and returns structural diff", async () => {
      const diffRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/versions/compare?from=1&to=2`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(diffRes.statusCode).toBe(200);
      const diffBody = JSON.parse(diffRes.body);
      expect(diffBody.fromVersion).toBe(1);
      expect(diffBody.toVersion).toBe(2);
      expect(diffBody.diff.addedNodeCount).toBe(1);
      expect(diffBody.diff.addedNodes[0].label).toBe("Audit Logger");
    });

    it("detects optimistic concurrency conflicts when expectedVersion is stale", async () => {
      const staleRes = await server.inject({
        method: "PUT",
        url: `/api/v1/workflows/${workflowAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          expectedVersion: 1, // Current is 2
          name: "Stale Overwrite Attempt",
        },
      });

      expect(staleRes.statusCode).toBe(409);
      const staleBody = JSON.parse(staleRes.body);
      expect(staleBody.error).toBe("Conflict");
      expect(staleBody.currentVersion).toBe(2);
    });

    it("safely rolls back to an earlier version as a new sequential version without destroying history", async () => {
      const rollbackRes = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${workflowAId}/versions/1/rollback`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(rollbackRes.statusCode).toBe(200);
      const rollbackBody = JSON.parse(rollbackRes.body);
      expect(rollbackBody.restoredVersion.version).toBe(3);
      expect(rollbackBody.restoredVersion.rolledBackFromVersion).toBe(1);
      expect(rollbackBody.workflow.status).toBe(WorkflowStatus.DRAFT);

      // Verify all versions (1, 2, 3) are preserved in history
      const versRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/versions`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const versBody = JSON.parse(versRes.body);
      expect(versBody.versions.length).toBe(3);
      expect(versBody.versions[0].version).toBe(3);
      expect(versBody.versions[1].version).toBe(2);
      expect(versBody.versions[2].version).toBe(1);
    });
  });

  // =========================================================================
  // 6. WORKFLOW IMPORT AND EXPORT
  // =========================================================================
  describe("Workflow Import & Export", () => {
    it("exports a sanitized workflow in flowforge/v1 format", async () => {
      const expRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/export`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(expRes.statusCode).toBe(200);
      const expBody = JSON.parse(expRes.body);
      expect(expBody.schemaVersion).toBe("flowforge/v1");
      expect(expBody.workflow.name).toBe("Order Processing Pipeline");
      expect(Array.isArray(expBody.workflow.nodes)).toBe(true);

      // Ensure no credentials, tokens, or webhook secrets are exported
      const jsonStr = JSON.stringify(expBody);
      expect(jsonStr.includes("webhookSecret")).toBe(false);
      expect(jsonStr.includes("connectionId")).toBe(false);
    });

    it("imports a valid workflow JSON definition into active workspace", async () => {
      const validExportPayload = {
        $schema: "https://flowforge.io/schemas/workflow-export-v1.json",
        schemaVersion: "flowforge/v1",
        exportedAt: new Date().toISOString(),
        workflow: {
          name: "Portable Client Intake",
          description: "Imported via FlowForge JSON",
          triggerType: "Webhook",
          nodes: [
            {
              id: "ext_node_1",
              type: "custom",
              position: { x: 50, y: 50 },
              data: { label: "Client Inbound", nodeType: "TRIGGER", integrationKey: "webhook", config: {} },
            },
            {
              id: "ext_node_2",
              type: "custom",
              position: { x: 350, y: 50 },
              data: { label: "Dispatch Call", nodeType: "HTTP_REQUEST", integrationKey: "http-request", config: { url: "https://api.example.com", method: "GET" } },
            },
            {
              id: "ext_node_3",
              type: "custom",
              position: { x: 650, y: 50 },
              data: { label: "Done", nodeType: "WORKFLOW_END", config: {} },
            },
          ],
          edges: [
            { id: "e1-2", source: "ext_node_1", target: "ext_node_2" },
            { id: "e2-3", source: "ext_node_2", target: "ext_node_3" },
          ],
        },
      };

      const impRes = await server.inject({
        method: "POST",
        url: "/api/v1/workflows/import",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: validExportPayload,
      });

      expect(impRes.statusCode).toBe(201);
      const impBody = JSON.parse(impRes.body);
      expect(impBody.workflow.name).toBe("[Imported] Portable Client Intake");
      expect(impBody.workflow.status).toBe(WorkflowStatus.DRAFT);
      expect(impBody.summary.nodeCount).toBe(3);
    });

    it("rejects import with unsupported schema version", async () => {
      const invalidVersionPayload = {
        schemaVersion: "flowforge/v999",
        workflow: { name: "Future Workflow", nodes: [], edges: [] },
      };

      const impRes = await server.inject({
        method: "POST",
        url: "/api/v1/workflows/import",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: invalidVersionPayload,
      });

      expect(impRes.statusCode).toBe(400);
      const impBody = JSON.parse(impRes.body);
      expect(impBody.message).toContain("Unsupported schemaVersion");
    });
  });

  // =========================================================================
  // 7. PERSISTENT ONBOARDING CHECKLIST
  // =========================================================================
  describe("Persistent Workspace Onboarding", () => {
    it("returns dynamically calculated onboarding milestones", async () => {
      const onbRes = await server.inject({
        method: "GET",
        url: "/api/v1/workspaces/onboarding",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(onbRes.statusCode).toBe(200);
      const onbBody = JSON.parse(onbRes.body);
      expect(onbBody.workspaceId).toBe(workspaceAId);
      expect(onbBody.steps.length).toBe(6);
      expect(onbBody.steps.find((s: any) => s.id === "create_workflow")?.completed).toBe(true);
      expect(onbBody.completionPercentage).toBeGreaterThan(0);
    });

    it("allows dismissing the onboarding banner", async () => {
      const dismissRes = await server.inject({
        method: "PATCH",
        url: "/api/v1/workspaces/onboarding",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { dismissed: true },
      });

      expect(dismissRes.statusCode).toBe(200);
      const dismissBody = JSON.parse(dismissRes.body);
      expect(dismissBody.dismissed).toBe(true);
    });
  });

  // =========================================================================
  // 8. MULTI-TENANT ISOLATION FOR PHASE 7
  // =========================================================================
  describe("Multi-Tenant Isolation", () => {
    it("rejects User B from exporting User A's workflow", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/export`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects User B from viewing User A's version history", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/versions`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects User B from rolling back User A's workflow", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/workflows/${workflowAId}/versions/1/rollback`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
