import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { outboundWebhookService } from "../src/services/outboundWebhooks.js";

describe("Phase 8: Public API, Developer Platform, API Keys, Webhooks & Custom Integrations Suite", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register User A
    const userAEmail = `phase8_usera_${Date.now()}@example.com`;
    const regARes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 8 Developer A",
        email: userAEmail,
        password: "Password123!",
        workspaceName: "Dev Workspace A",
      },
    });
    const regABody = JSON.parse(regARes.body);
    userAToken = regABody.token;
    workspaceAId = regABody.user.activeWorkspaceId;
    userAId = regABody.user.id;

    // Register User B (for tenant isolation)
    const userBEmail = `phase8_userb_${Date.now()}@example.com`;
    const regBRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Phase 8 Developer B",
        email: userBEmail,
        password: "Password123!",
        workspaceName: "Dev Workspace B",
      },
    });
    const regBBody = JSON.parse(regBRes.body);
    userBToken = regBBody.token;
    workspaceBId = regBBody.user.activeWorkspaceId;
  });

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.outboundWebhook.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.apiKey.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await prisma.customIntegrationVersion.deleteMany({});
    await prisma.customIntegration.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId].filter(Boolean) } },
    });
    await server.close();
  });

  // ==========================================
  // 1. API Keys Lifecycle & Scopes
  // ==========================================
  describe("API Keys Lifecycle & Scope Authorization", () => {
    let readOnlyKeyId: string;
    let readOnlySecret: string;
    let fullAccessKeyId: string;
    let fullAccessSecret: string;

    it("creates a scoped API key and returns plaintext secret once", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Read-Only Workflows Key",
          scopes: ["workflows:read"],
          expiresInDays: 30,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.key.name).toBe("Read-Only Workflows Key");
      expect(body.key.scopes).toEqual(["workflows:read"]);
      expect(body.key.keyPrefix.startsWith("ffk_live_")).toBe(true);
      expect(body.secret.startsWith("ffk_live_")).toBe(true);

      readOnlyKeyId = body.key.id;
      readOnlySecret = body.secret;

      // Verify that secret is NEVER stored in database plaintext
      const dbKey = await prisma.apiKey.findUnique({ where: { id: readOnlyKeyId } });
      expect(dbKey?.keyHash).toBeDefined();
      expect(dbKey?.keyHash).not.toBe(readOnlySecret);
      expect(dbKey?.keyHash).toBe(crypto.createHash("sha256").update(readOnlySecret).digest("hex"));
    });

    it("creates a second API key with execution and write scopes", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Automation Full Access",
          scopes: ["workflows:read", "workflows:write", "executions:run", "executions:read"],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      fullAccessKeyId = body.key.id;
      fullAccessSecret = body.secret;
    });

    it("lists all API keys without exposing secrets or key hashes", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body[0]).toHaveProperty("keyPrefix");
      expect(body[0]).not.toHaveProperty("secret");
      expect(body[0]).not.toHaveProperty("keyHash");
    });

    it("authenticates programmatic requests using Authorization: Bearer ffk_...", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${readOnlySecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("data");
    });

    it("authenticates programmatic requests using X-API-Key: ffk_...", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/workflows",
        headers: { "x-api-key": readOnlySecret },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("data");
    });

    it("rejects action when API key lacks required scope (least privilege enforcement)", async () => {
      // readOnlySecret only has workflows:read, but POST /workflows requires workflows:write
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${readOnlySecret}` },
        payload: {
          name: "Unauthorized Pipeline",
          status: "DRAFT",
          nodes: [],
          edges: [],
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Forbidden");
      expect(body.message).toContain("API key lacks required scope: workflows:write");
      expect(body.requiredScope).toBe("workflows:write");
    });

    it("allows action when API key possesses the required scope", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${fullAccessSecret}` },
        payload: {
          name: "Programmatic Ingestion Pipeline",
          status: "DRAFT",
          nodes: [
            {
              id: "node_trig",
              type: "custom",
              position: { x: 100, y: 100 },
              data: { label: "Webhook Trigger", nodeType: "TRIGGER", integrationKey: "webhook" },
            },
          ],
          edges: [],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.workflow.name).toBe("Programmatic Ingestion Pipeline");
    });

    it("prevents an API key from creating other API keys (privilege escalation protection)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${fullAccessSecret}` },
        payload: {
          name: "Child Key Attempt",
          scopes: ["workflows:read"],
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("API keys cannot create other API keys");
    });

    it("rotates an API key: revokes old key and returns replacement secret", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/api-keys/${readOnlyKeyId}/rotate`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.secret).toBeDefined();
      expect(body.secret.startsWith("ffk_live_")).toBe(true);

      const rotatedNewSecret = body.secret;

      // Old secret must be immediately rejected
      const oldRes = await server.inject({
        method: "GET",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${readOnlySecret}` },
      });
      expect(oldRes.statusCode).toBe(401);

      // New secret works
      const newRes = await server.inject({
        method: "GET",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${rotatedNewSecret}` },
      });
      expect(newRes.statusCode).toBe(200);
    });

    it("revokes an API key immediately and blocks further requests", async () => {
      const delRes = await server.inject({
        method: "DELETE",
        url: `/api/v1/api-keys/${fullAccessKeyId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(delRes.statusCode).toBe(200);

      // Verification: fullAccessSecret is now revoked
      const testRes = await server.inject({
        method: "GET",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${fullAccessSecret}` },
      });
      expect(testRes.statusCode).toBe(401);
      const testBody = JSON.parse(testRes.body);
      expect(testBody.message).toContain("Invalid, expired, or revoked API key");
    });

    it("enforces tenant boundary: API key from Workspace A cannot access Workspace B", async () => {
      // Create new key for Workspace A
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Workspace A Key",
          scopes: ["workflows:read"],
        },
      });
      const wsASecret = JSON.parse(createRes.body).secret;

      // Create workflow in Workspace B
      const wfBRes = await server.inject({
        method: "POST",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          name: "Secret Workspace B Pipeline",
          status: "DRAFT",
          nodes: [],
          edges: [],
        },
      });
      const wfBId = JSON.parse(wfBRes.body).workflow.id;

      // Attempt to access Workspace B workflow with Workspace A's key
      const crossRes = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${wfBId}`,
        headers: { authorization: `Bearer ${wsASecret}` },
      });

      expect(crossRes.statusCode).toBe(404);
      const crossBody = JSON.parse(crossRes.body);
      expect(crossBody.message).toContain("Workflow not found in current workspace");
    });
  });

  // ==========================================
  // 2. Public REST API & Metadata Protection
  // ==========================================
  describe("Public REST API & Metadata Protection", () => {
    let wsASecret: string;

    beforeAll(async () => {
      await prisma.apiKey.deleteMany({ where: { workspaceId: workspaceAId } });
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Public API Test Key",
          scopes: ["workflows:read", "connections:read", "templates:read"],
        },
      });
      wsASecret = JSON.parse(res.body).secret;
    });

    it("GET /workspaces/current returns workspace metadata but protects member personal data from API keys", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/workspaces/current",
        headers: { authorization: `Bearer ${wsASecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.workspace.name).toBe("Dev Workspace A");
      expect(body.workspace.membersCount).toBeDefined();
      // Safeguard: members array must be omitted for API keys
      expect(body.workspace.members).toBeUndefined();
    });

    it("GET /connections returns safe connection metadata and zero plaintext secrets", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/connections",
        headers: { authorization: `Bearer ${wsASecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("data");
      // Verify no credential tokens leaked in data array
      for (const conn of body.data) {
        expect(conn).not.toHaveProperty("credentials");
        expect(conn).not.toHaveProperty("token");
        expect(conn).not.toHaveProperty("apiKey");
      }
    });

    it("OpenAPI documentation endpoint is available and exposes security schemes", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/docs/json",
      });

      expect(res.statusCode).toBe(200);
      const openApiSpec = JSON.parse(res.body);
      expect(openApiSpec.openapi).toBeDefined();
      expect(openApiSpec.components.securitySchemes.apiKeyAuth).toBeDefined();
      expect(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
    });
  });

  // ==========================================
  // 3. Outbound Webhooks & Delivery
  // ==========================================
  describe("Reliable Outbound Webhooks & Event Delivery", () => {
    let webhookId: string;
    let signingSecret: string;

    it("registers an outbound webhook endpoint and returns HMAC signing secret once", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/outbound-webhooks",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Slack Incoming Ops Alert",
          url: "https://example.com/webhooks/ops",
          events: ["workflow.created", "execution.succeeded", "execution.failed"],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.webhook.name).toBe("Slack Incoming Ops Alert");
      expect(body.webhook.url).toBe("https://example.com/webhooks/ops");
      expect(body.webhook.events).toContain("workflow.created");
      expect(body.secret.startsWith("whsec_")).toBe(true);

      webhookId = body.webhook.id;
      signingSecret = body.secret;
    });

    it("lists outbound webhooks for workspace", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/outbound-webhooks",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].id).toBe(webhookId);
    });

    it("updates webhook endpoint settings", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: `/api/v1/outbound-webhooks/${webhookId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Updated Slack Alert",
          active: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Updated Slack Alert");
    });

    it("rotates signing secret for an outbound webhook", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/outbound-webhooks/${webhookId}/rotate-secret`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.secret).toBeDefined();
      expect(body.secret.startsWith("whsec_")).toBe(true);
      expect(body.secret).not.toBe(signingSecret);

      signingSecret = body.secret;
    });

    it("dispatches a test ping event and records pending delivery", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/outbound-webhooks/${webhookId}/test`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.eventType).toBe("ping");
      expect(body.status).toBe("PENDING");
      expect(body.webhookId).toBe(webhookId);
    });

    it("lists delivery records for a webhook endpoint", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/outbound-webhooks/${webhookId}/deliveries`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].webhookId).toBe(webhookId);
    });

    it("creates durable delivery record when real platform event occurs (workflow.created)", async () => {
      // 1. Create a workflow
      const wfRes = await server.inject({
        method: "POST",
        url: "/api/v1/workflows",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: "Trigger Event Emitter Workflow",
          status: "DRAFT",
          nodes: [],
          edges: [],
        },
      });
      expect(wfRes.statusCode).toBe(201);
      const wfId = JSON.parse(wfRes.body).workflow.id;

      // 2. Verify that delivery record was created for workflow.created
      const deliveries = await prisma.webhookDelivery.findMany({
        where: {
          webhookId,
          eventType: "workflow.created",
        },
      });

      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      const lastDelivery = deliveries[deliveries.length - 1];
      expect(lastDelivery.payload).toMatchObject({
        workflowId: wfId,
        name: "Trigger Event Emitter Workflow",
      });
    });

    it("enforces tenant boundary on outbound webhooks", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/outbound-webhooks/${webhookId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ==========================================
  // 4. Declarative Custom Integrations
  // ==========================================
  describe("Declarative Custom Integration Framework", () => {
    let customIntegrationId: string;

    it("creates a custom integration definition in DRAFT status", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/custom-integrations",
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          key: "custom-crm",
          name: "Custom Enterprise CRM",
          description: "Internal REST API for customer account synchronization",
          definition: {
            actions: [
              {
                id: "create_lead",
                name: "Create CRM Lead",
                method: "POST",
                url: "https://httpbin.org/post",
                headers: { "Content-Type": "application/json" },
                bodyTemplate: '{"leadEmail": "{{input.email}}", "leadName": "{{input.name}}"}',
                inputSchema: { email: { type: "string" }, name: { type: "string" } },
              },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.key).toBe("custom-crm");
      expect(body.name).toBe("Custom Enterprise CRM");
      expect(body.status).toBe("DRAFT");
      expect(body.currentVersion).toBe(1);

      customIntegrationId = body.id;
    });

    it("lists custom integrations for the workspace", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/custom-integrations",
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].key).toBe("custom-crm");
    });

    it("executes a safe test run in sandbox with sample input", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/custom-integrations/${customIntegrationId}/test`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionId: "create_lead",
          sampleInput: {
            email: "test@example.com",
            name: "John Doe",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("durationMs");
    }, 15000);

    it("blocks custom integration test attempts targeting private or metadata IPs (SSRF protection)", async () => {
      // 1. Update draft action URL to point to private IP (e.g. AWS metadata 169.254.169.254)
      await server.inject({
        method: "PUT",
        url: `/api/v1/custom-integrations/${customIntegrationId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actions: [
            {
              id: "ssrf_exploit",
              name: "Exploit Attempt",
              method: "GET",
              url: "http://169.254.169.254/latest/meta-data/",
            },
          ],
        },
      });

      // 2. Test execution should fail with SSRF violation
      const testRes = await server.inject({
        method: "POST",
        url: `/api/v1/custom-integrations/${customIntegrationId}/test`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionId: "ssrf_exploit",
        },
      });

      expect(testRes.statusCode).toBe(200);
      const testBody = JSON.parse(testRes.body);
      expect(testBody.success).toBe(false);
      expect(testBody.errorMessage).toContain("cloud-metadata network range");
    });

    it("publishes draft version into an immutable published version", async () => {
      // Restore valid URL
      await server.inject({
        method: "PUT",
        url: `/api/v1/custom-integrations/${customIntegrationId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actions: [
            {
              id: "create_lead",
              name: "Create CRM Lead",
              method: "POST",
              url: "https://httpbin.org/post",
            },
          ],
        },
      });

      const pubRes = await server.inject({
        method: "POST",
        url: `/api/v1/custom-integrations/${customIntegrationId}/publish`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(pubRes.statusCode).toBe(200);
      const pubBody = JSON.parse(pubRes.body);
      expect(pubBody.status).toBe("PUBLISHED");
      expect(pubBody.versions[0].status).toBe("PUBLISHED");
    });

    it("enforces tenant boundary on custom integrations", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/custom-integrations/${customIntegrationId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
