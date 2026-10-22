import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";
import { encryptCredentials, decryptCredentials } from "../src/security/encryption.js";
import { generatePkcePair, createOAuthState, consumeOAuthState } from "../src/security/oauth-state.js";
import { tokenManager } from "../src/integrations/token-manager.js";
import { integrationRegistry } from "../src/integrations/registry.js";
import { slackProvider } from "../src/integrations/providers/slack.js";
import { googleSheetsProvider } from "../src/integrations/providers/google-sheets.js";
import { gmailProvider } from "../src/integrations/providers/gmail.js";
import { googleDriveProvider } from "../src/integrations/providers/google-drive.js";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { prisma, WorkflowStatus, ExecutionStatus } from "@flowforge/database";

describe("Phase 3 Integrations & OAuth Platform Suite", () => {
  let server: FastifyInstance;
  let userTokenA: string;
  let workspaceIdA: string;
  let userTokenB: string;
  let workspaceIdB: string;
  let slackConnIdA: string;
  let googleConnIdA: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // Register User Alpha (Tenant A)
    const emailA = `tenant-a-${Date.now()}@flowforge.dev`;
    const regResA = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "User Alpha",
        email: emailA,
        password: "Password123!",
        workspaceName: "Alpha Workspace",
      },
    });
    const regDataA = JSON.parse(regResA.body);
    userTokenA = regDataA.token;
    workspaceIdA = regDataA.user.activeWorkspaceId;

    // Register User Beta (Tenant B)
    const emailB = `tenant-b-${Date.now()}@flowforge.dev`;
    const regResB = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "User Beta",
        email: emailB,
        password: "Password123!",
        workspaceName: "Beta Workspace",
      },
    });
    const regDataB = JSON.parse(regResB.body);
    userTokenB = regDataB.token;
    workspaceIdB = regDataB.user.activeWorkspaceId;

    // Create active connected accounts for Tenant A
    const slackRes = await server.inject({
      method: "POST",
      url: "/api/v1/oauth/dev-connect",
      headers: { Authorization: `Bearer ${userTokenA}` },
      payload: { provider: "slack", name: "Alpha Slack Connection" },
    });
    const slackData = JSON.parse(slackRes.body);
    slackConnIdA = slackData.connection.id;

    const googleRes = await server.inject({
      method: "POST",
      url: "/api/v1/oauth/dev-connect",
      headers: { Authorization: `Bearer ${userTokenA}` },
      payload: { provider: "google-sheets", name: "Alpha Google Sheets Connection" },
    });
    const googleData = JSON.parse(googleRes.body);
    googleConnIdA = googleData.connection.id;
  });

  afterAll(async () => {
    await server.close();
  });

  // ==========================================
  // 1. AES-256-GCM Credential Encryption
  // ==========================================
  describe("Authenticated Encryption Vault (AES-256-GCM)", () => {
    it("encrypts and decrypts structured OAuth credentials securely", () => {
      const credentials = {
        accessToken: "xoxb-test-access-token-12345",
        refreshToken: "xoxe-test-refresh-token-67890",
        botUserId: "U_BOT_123",
        scopes: ["chat:write", "channels:read"],
        expiresIn: 3600,
      };

      const encrypted = encryptCredentials(credentials);
      expect(encrypted).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      const decrypted = decryptCredentials<typeof credentials>(encrypted);
      expect(decrypted).toEqual(credentials);
    });

    it("detects tampering with ciphertext and throws authentication error", () => {
      const original = { secretKey: "ultra_confidential_key" };
      const encrypted = encryptCredentials(original);

      // Tamper with ciphertext by modifying the last hex character
      const parts = encrypted.split(":");
      const tamperedCipher = parts[3].slice(0, -1) + (parts[3].endsWith("a") ? "b" : "a");
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`;

      expect(() => decryptCredentials(tampered)).toThrow();
    });

    it("handles empty or null credentials safely", () => {
      expect(encryptCredentials(null)).toBe("");
      expect(decryptCredentials("")).toEqual({});
    });
  });

  // ==========================================
  // 2. OAuth State Token & PKCE Security
  // ==========================================
  describe("OAuth State & PKCE Management", () => {
    it("generates RFC 7636 compliant PKCE code challenge and verifier", () => {
      const pkce = generatePkcePair();
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeChallenge).toBeDefined();
    });

    it("creates short-lived authorization state bound to workspace", async () => {
      const state = await createOAuthState({
        provider: "slack",
        workspaceId: workspaceIdA,
        userId: "usr_alpha",
        redirectUri: "http://localhost:4000/api/v1/oauth/slack/callback",
        usePkce: true,
      });

      expect(state.stateToken).toMatch(/^ff_slack_[0-9a-f]{48}$/);
      expect(state.codeVerifier).toBeDefined();
    });

    it("consumes state atomically preventing replay attacks", async () => {
      const state = await createOAuthState({
        provider: "slack",
        workspaceId: workspaceIdA,
        userId: "usr_alpha",
      });

      // First consumption succeeds
      const consumed = await consumeOAuthState(state.stateToken, "slack");
      expect(consumed.workspaceId).toBe(workspaceIdA);

      // Second consumption fails (anti-replay check)
      await expect(consumeOAuthState(state.stateToken, "slack")).rejects.toThrow(
        /Invalid or expired OAuth state token/
      );
    });

    it("rejects state token if provider does not match", async () => {
      const state = await createOAuthState({
        provider: "slack",
        workspaceId: workspaceIdA,
        userId: "usr_alpha",
      });

      await expect(consumeOAuthState(state.stateToken, "google-sheets")).rejects.toThrow(
        /OAuth provider mismatch/
      );
    });
  });

  // ==========================================
  // 3. Token Manager & Tenant Isolation
  // ==========================================
  describe("TokenManager Tenant Isolation & Credential Access", () => {
    it("allows access to credentials within the owning workspace", async () => {
      const creds = await tokenManager.getValidCredentials(workspaceIdA, slackConnIdA);
      expect(creds.accessToken).toBeDefined();
      expect(creds.accessToken).toContain("xoxb-");
    });

    it("STRICT TENANT ISOLATION: prevents Tenant B from accessing Tenant A connection", async () => {
      await expect(
        tokenManager.getValidCredentials(workspaceIdB, slackConnIdA)
      ).rejects.toThrow(/Connected account not found or access denied/);
    });
  });

  // ==========================================
  // 4. Slack Action Execution Handler
  // ==========================================
  describe("Slack Integration Provider", () => {
    const postMessageOp = slackProvider.operations.find((op) => op.id === "post_message")!;

    it("fails with AUTH_FAILURE if credentials are missing", async () => {
      const res = await postMessageOp.execute({
        workspaceId: workspaceIdA,
        parameters: { channel: "general", text: "Hello Slack" },
        stepContext: {
          nodeId: "n_slack",
          nodeName: "Slack Message",
          nodeType: "ACTION",
          config: {},
          context: { trigger: {}, steps: {} },
          executionId: "ex_1",
          workflowId: "wf_1",
          correlationId: "cor_1",
          attempt: 1,
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.errorCategory).toBe("AUTH_FAILURE");
    });

    it("fails with INVALID_INPUT if channel is missing", async () => {
      const res = await postMessageOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "xoxb-mock-token" },
        parameters: { channel: "", text: "Test Message" },
        stepContext: {
          nodeId: "n_slack",
          nodeName: "Slack Message",
          nodeType: "ACTION",
          config: {},
          context: { trigger: {}, steps: {} },
          executionId: "ex_1",
          workflowId: "wf_1",
          correlationId: "cor_1",
          attempt: 1,
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.errorCategory).toBe("INVALID_INPUT");
    });

    it("executes successfully and interpolates template variables", async () => {
      const res = await postMessageOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "xoxb-mock-token", botUserId: "U_BOT_1" },
        parameters: {
          channel: "leads",
          text: "New customer signup: {{trigger.body.leadEmail}} (Amount: ${{trigger.body.amount}})",
        },
        stepContext: {
          nodeId: "n_slack",
          nodeName: "Slack Message",
          nodeType: "ACTION",
          config: {},
          context: {
            trigger: {
              body: { leadEmail: "sarah@acme.com", amount: 450 },
            },
            steps: {},
          },
          executionId: "ex_1",
          workflowId: "wf_1",
          correlationId: "cor_1",
          attempt: 1,
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.ok).toBe(true);
      expect(res.outputData.channel).toBe("leads");
      expect(res.outputData.message.text).toBe("New customer signup: sarah@acme.com (Amount: $450)");
    });
  });

  // ==========================================
  // 5. Google Sheets Action Execution Handler
  // ==========================================
  describe("Google Sheets Integration Provider", () => {
    const appendRowOp = googleSheetsProvider.operations.find((op) => op.id === "append_row")!;

    it("appends row with mapped dynamic values", async () => {
      const res = await appendRowOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "ya29.mock-token" },
        parameters: {
          spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
          range: "Customers!A:C",
          values: ["{{trigger.body.name}}", "{{trigger.body.email}}", "{{trigger.body.plan}}"],
        },
        stepContext: {
          nodeId: "n_sheets",
          nodeName: "Google Sheets Append",
          nodeType: "ACTION",
          config: {},
          context: {
            trigger: {
              body: { name: "Bob Martin", email: "bob@example.com", plan: "Enterprise" },
            },
            steps: {},
          },
          executionId: "ex_2",
          workflowId: "wf_2",
          correlationId: "cor_2",
          attempt: 1,
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.spreadsheetId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
      expect(res.outputData.appendedValues).toEqual(["Bob Martin", "bob@example.com", "Enterprise"]);
    });
  });

  // ==========================================
  // 6. Gmail Action Execution Handler
  // ==========================================
  describe("Gmail Integration Provider", () => {
    const sendEmailOp = gmailProvider.operations.find((op) => op.id === "send_email")!;

    it("rejects invalid recipient email with INVALID_INPUT error", async () => {
      const res = await sendEmailOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "ya29.mock-token" },
        parameters: {
          to: "not-a-valid-email",
          subject: "Test Subject",
          body: "Hello",
        },
        stepContext: {
          nodeId: "n_gmail",
          nodeName: "Send Email",
          nodeType: "ACTION",
          config: {},
          context: { trigger: {}, steps: {} },
          executionId: "ex_3",
          workflowId: "wf_3",
          correlationId: "cor_3",
          attempt: 1,
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.errorCategory).toBe("INVALID_INPUT");
      expect(res.errorMessage).toContain("Invalid recipient email format");
    });

    it("dispatches email with valid recipient and dynamic variables", async () => {
      const res = await sendEmailOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "ya29.mock-token" },
        parameters: {
          to: "{{trigger.body.userEmail}}",
          subject: "Welcome to FlowForge!",
          body: "Hello {{trigger.body.userName}},\n\nYour account is ready.",
        },
        stepContext: {
          nodeId: "n_gmail",
          nodeName: "Send Email",
          nodeType: "ACTION",
          config: {},
          context: {
            trigger: {
              body: { userEmail: "client@acme.com", userName: "Client User" },
            },
            steps: {},
          },
          executionId: "ex_4",
          workflowId: "wf_4",
          correlationId: "cor_4",
          attempt: 1,
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.to).toBe("client@acme.com");
      expect(res.outputData.subject).toBe("Welcome to FlowForge!");
      expect(res.outputData.labelIds).toContain("SENT");
    });
  });

  // ==========================================
  // 7. Google Drive Integration Provider
  // ==========================================
  describe("Google Drive Integration Provider", () => {
    const listFilesOp = googleDriveProvider.operations.find((op) => op.id === "list_files")!;
    const getMetadataOp = googleDriveProvider.operations.find((op) => op.id === "get_file_metadata")!;

    it("lists accessible Drive files with query filtering", async () => {
      const res = await listFilesOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "ya29.mock-token" },
        parameters: { query: "mimeType = 'application/pdf'", pageSize: 5 },
        stepContext: {
          nodeId: "n_drive_list",
          nodeName: "Drive List",
          nodeType: "ACTION",
          config: {},
          context: { trigger: {}, steps: {} },
          executionId: "ex_5",
          workflowId: "wf_5",
          correlationId: "cor_5",
          attempt: 1,
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.files.length).toBeGreaterThan(0);
      expect(res.outputData.totalCount).toBeGreaterThan(0);
    });

    it("retrieves Drive file metadata by ID", async () => {
      const res = await getMetadataOp.execute({
        workspaceId: workspaceIdA,
        credentials: { accessToken: "ya29.mock-token" },
        parameters: { fileId: "drive_file_99" },
        stepContext: {
          nodeId: "n_drive_meta",
          nodeName: "Drive Metadata",
          nodeType: "ACTION",
          config: {},
          context: { trigger: {}, steps: {} },
          executionId: "ex_6",
          workflowId: "wf_6",
          correlationId: "cor_6",
          attempt: 1,
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.outputData.id).toBe("drive_file_99");
      expect(res.outputData.webViewLink).toBeDefined();
    });
  });

  // ==========================================
  // 8. OAuth Endpoints & Connections API
  // ==========================================
  describe("OAuth & Connections API Routes", () => {
    it("GET /api/v1/oauth/:provider/authorize initiates OAuth flow and returns URL", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/oauth/slack/authorize",
        headers: { Authorization: `Bearer ${userTokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.authorizationUrl).toContain("https://slack.com/oauth/v2/authorize");
      expect(data.state).toBeDefined();
    });

    it("GET /api/v1/connections lists safe redacted connections", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/connections",
        headers: { Authorization: `Bearer ${userTokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Verify sensitive tokens are NOT returned to the client
      for (const conn of body.data) {
        expect(conn.credentials).toBeUndefined();
        expect(conn.status).toBe("ACTIVE");
      }
    });

    it("POST /api/v1/connections/:id/refresh forces connection refresh", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/connections/${slackConnIdA}/refresh`,
        headers: { Authorization: `Bearer ${userTokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("DELETE /api/v1/connections/:id disconnects and removes account", async () => {
      // Create a temporary connection to delete
      const createRes = await server.inject({
        method: "POST",
        url: "/api/v1/oauth/dev-connect",
        headers: { Authorization: `Bearer ${userTokenA}` },
        payload: { provider: "slack", name: "Temporary Connection" },
      });
      const tempId = JSON.parse(createRes.body).connection.id;

      const delRes = await server.inject({
        method: "DELETE",
        url: `/api/v1/connections/${tempId}`,
        headers: { Authorization: `Bearer ${userTokenA}` },
      });

      expect(delRes.statusCode).toBe(200);

      // Confirm it's gone
      const verify = await prisma.connectedAccount.findUnique({ where: { id: tempId } });
      expect(verify).toBeNull();
    });
  });

  // ==========================================
  // 9. Full Engine Workflow Execution with Integration Node
  // ==========================================
  describe("Workflow Execution with Third-Party Integration Node", () => {
    it("runs complete workflow containing Slack action and persists step output", async () => {
      // Create workflow with Webhook trigger -> Slack post_message -> End
      const wf = await prisma.workflow.create({
        data: {
          workspaceId: workspaceIdA,
          name: "Slack Alert Pipeline",
          status: WorkflowStatus.ACTIVE,
          triggerType: "Webhook Trigger",
          versions: {
            create: {
              version: 1,
              isValid: true,
              nodes: [
                {
                  id: "n_trig",
                  type: "custom",
                  data: { label: "Webhook Trigger", nodeType: "TRIGGER" },
                },
                {
                  id: "n_slack_step",
                  type: "custom",
                  data: {
                    label: "Slack: Post Message",
                    nodeType: "ACTION",
                    integrationKey: "slack",
                    config: {
                      operationId: "post_message",
                      connectedAccountId: slackConnIdA,
                      parameters: {
                        channel: "alerts",
                        text: "Urgent alert for {{trigger.body.system}} from {{trigger.body.admin}}",
                      },
                    },
                  },
                },
                {
                  id: "n_end_step",
                  type: "custom",
                  data: { label: "Workflow End", nodeType: "WORKFLOW_END" },
                },
              ],
              edges: [
                { id: "e1", source: "n_trig", target: "n_slack_step" },
                { id: "e2", source: "n_slack_step", target: "n_end_step" },
              ],
            },
          },
        },
      });

      // Create execution record
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: wf.id,
          status: ExecutionStatus.PENDING,
          triggerEvent: { system: "PaymentGateway", admin: "alex@flowforge.dev" },
          correlationId: `test_slack_exec_${Date.now()}`,
        },
      });

      // Run execution through the engine runner
      const runResult = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: wf.id,
        triggerPayload: {
          body: { system: "PaymentGateway", admin: "alex@flowforge.dev" },
        },
        correlationId: execution.correlationId || "cor-slack",
      });

      expect(runResult.status).toBe("SUCCESS");
      expect(runResult.stepsExecuted).toBe(3);

      // Verify step execution in database
      const dbExec = await prisma.workflowExecution.findUnique({
        where: { id: execution.id },
        include: { steps: true },
      });

      expect(dbExec?.status).toBe(ExecutionStatus.SUCCESS);
      const slackStep = dbExec?.steps.find((s) => s.nodeId === "n_slack_step");
      expect(slackStep).toBeDefined();
      expect(slackStep?.status).toBe(ExecutionStatus.SUCCESS);
      expect((slackStep?.outputData as any)?.message?.text).toBe(
        "Urgent alert for PaymentGateway from alex@flowforge.dev"
      );
    });
  });
});
