import { PrismaClient, IntegrationStatus, AuthType, WorkflowStatus } from "@prisma/client";
import * as crypto from "node:crypto";

const prisma = new PrismaClient();

// PBKDF2 hasher with 10000 iterations matching auth.ts
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log("🌱 Starting FlowForge database seed...");

  // 1. Integrations Catalog
  const integrations = [
    {
      key: "webhook",
      name: "Webhook Trigger",
      description: "Trigger workflows via custom incoming HTTP POST, PUT, or GET webhooks.",
      category: "CORE",
      status: IntegrationStatus.AVAILABLE,
      authType: AuthType.NONE,
      isBuiltin: true,
      iconName: "Webhook",
      accentColor: "#6366f1",
      metadata: {
        triggers: [
          {
            name: "Catch Hook",
            type: "TRIGGER",
            description: "Wait for a unique URL to receive an incoming HTTP request payload.",
            parameters: [
              { name: "method", label: "HTTP Method", type: "string", required: true },
              { name: "path", label: "Custom Path Slug", type: "string", required: false },
            ],
          },
        ],
        actions: [],
        authRequirements: {
          instructions: "No authentication required. Each webhook node generates a unique HMAC-secured URL endpoint.",
          fields: [],
        },
      },
    },
    {
      key: "http-request",
      name: "HTTP / REST Request",
      description: "Send flexible outgoing HTTP requests to any external API or webhook receiver.",
      category: "DEVELOPER",
      status: IntegrationStatus.AVAILABLE,
      authType: AuthType.NONE,
      isBuiltin: true,
      iconName: "Globe",
      accentColor: "#0ea5e9",
      metadata: {
        triggers: [],
        actions: [
          {
            name: "Send HTTP Request",
            type: "ACTION",
            description: "Execute GET, POST, PUT, PATCH, or DELETE with headers and custom body.",
            parameters: [
              { name: "url", label: "Target URL", type: "string", required: true },
              { name: "method", label: "Method", type: "string", required: true },
              { name: "headers", label: "Request Headers", type: "json", required: false },
              { name: "body", label: "JSON Body", type: "json", required: false },
            ],
          },
        ],
        authRequirements: {
          instructions: "Supports Basic Auth, Bearer Token, API Key header, or unauthenticated requests.",
          fields: [
            { name: "authType", label: "Authentication Type", type: "text", required: true },
          ],
        },
      },
    },
    {
      key: "schedule",
      name: "Schedule / Cron",
      description: "Trigger workflows on recurring intervals, cron expressions, or specific dates.",
      category: "CORE",
      status: IntegrationStatus.AVAILABLE,
      authType: AuthType.NONE,
      isBuiltin: true,
      iconName: "Clock",
      accentColor: "#10b981",
      metadata: {
        triggers: [
          {
            name: "Recurring Interval",
            type: "TRIGGER",
            description: "Triggers periodically every N minutes, hours, days, or via cron syntax.",
            parameters: [
              { name: "cronExpression", label: "Cron Expression", type: "string", required: true },
              { name: "timezone", label: "Timezone", type: "string", required: true },
            ],
          },
        ],
        actions: [],
        authRequirements: {
          instructions: "Built-in timer engine managed natively by FlowForge.",
          fields: [],
        },
      },
    },
    {
      key: "email",
      name: "Email (SMTP / Resend)",
      description: "Send transactional and alert emails directly from your automation steps.",
      category: "COMMUNICATION",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.API_KEY,
      isBuiltin: false,
      iconName: "Mail",
      accentColor: "#f59e0b",
      metadata: {
        triggers: [],
        actions: [
          {
            name: "Send Email",
            type: "ACTION",
            description: "Send an email with HTML/text body and attachments.",
            parameters: [
              { name: "to", label: "Recipient Email", type: "string", required: true },
              { name: "subject", label: "Email Subject", type: "string", required: true },
              { name: "body", label: "Message Body", type: "string", required: true },
            ],
          },
        ],
        authRequirements: {
          instructions: "Requires SMTP credentials or Resend/SendGrid API token in Phase 2.",
          fields: [
            { name: "apiKey", label: "Provider API Key", type: "password", required: true },
          ],
        },
      },
    },
    {
      key: "slack",
      name: "Slack",
      description: "Send messages, notifications, and alert channels via Slack Webhooks or Bot.",
      category: "COMMUNICATION",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.OAUTH2,
      isBuiltin: false,
      iconName: "MessageSquare",
      accentColor: "#ec4899",
      metadata: {
        triggers: [
          {
            name: "New Channel Message",
            type: "TRIGGER",
            description: "Fires whenever a message is posted to a selected Slack channel.",
            parameters: [{ name: "channel", label: "Channel ID", type: "string", required: true }],
          },
        ],
        actions: [
          {
            name: "Post Message",
            type: "ACTION",
            description: "Send formatted text or Block Kit cards to a Slack channel.",
            parameters: [
              { name: "channel", label: "Channel", type: "string", required: true },
              { name: "message", label: "Message Text", type: "string", required: true },
            ],
          },
        ],
        authRequirements: {
          instructions: "Requires Slack OAuth2 App authorization with 'chat:write' and 'channels:read' scopes.",
          fields: [
            { name: "clientId", label: "Slack Client ID", type: "text", required: true },
            { name: "clientSecret", label: "Slack Client Secret", type: "password", required: true },
          ],
        },
      },
    },
    {
      key: "google-sheets",
      name: "Google Sheets",
      description: "Read, append, update, and search rows in Google Spreadsheets.",
      category: "PRODUCTIVITY",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.OAUTH2,
      isBuiltin: false,
      iconName: "FileSpreadsheet",
      accentColor: "#22c55e",
      metadata: {
        triggers: [
          {
            name: "New or Updated Row",
            type: "TRIGGER",
            description: "Fires when new rows are added to a spreadsheet.",
            parameters: [{ name: "spreadsheetId", label: "Spreadsheet ID", type: "string", required: true }],
          },
        ],
        actions: [
          {
            name: "Append Row",
            type: "ACTION",
            description: "Inserts a new row with mapping data.",
            parameters: [
              { name: "spreadsheetId", label: "Spreadsheet ID", type: "string", required: true },
              { name: "values", label: "Row Values", type: "json", required: true },
            ],
          },
        ],
        authRequirements: {
          instructions: "Requires Google Cloud Console OAuth 2.0 Client credentials with Sheets scope.",
          fields: [
            { name: "clientId", label: "Google Client ID", type: "text", required: true },
            { name: "clientSecret", label: "Google Client Secret", type: "password", required: true },
          ],
        },
      },
    },
    {
      key: "google-drive",
      name: "Google Drive",
      description: "Upload, manage, and monitor files within your Google Drive folders.",
      category: "STORAGE",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.OAUTH2,
      isBuiltin: false,
      iconName: "HardDrive",
      accentColor: "#3b82f6",
      metadata: {
        triggers: [],
        actions: [],
        authRequirements: {
          instructions: "OAuth 2.0 with Google Drive file scope.",
          fields: [],
        },
      },
    },
    {
      key: "gmail",
      name: "Gmail",
      description: "Trigger on incoming emails or send emails from your personal/company Gmail.",
      category: "COMMUNICATION",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.OAUTH2,
      isBuiltin: false,
      iconName: "Inbox",
      accentColor: "#ef4444",
      metadata: {
        triggers: [],
        actions: [],
        authRequirements: {
          instructions: "OAuth 2.0 with Gmail send/read scope.",
          fields: [],
        },
      },
    },
    {
      key: "discord",
      name: "Discord",
      description: "Send channel messages and webhook announcements in Discord servers.",
      category: "COMMUNICATION",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.API_KEY,
      isBuiltin: false,
      iconName: "Gamepad2",
      accentColor: "#8b5cf6",
      metadata: {
        triggers: [],
        actions: [],
        authRequirements: {
          instructions: "Discord Webhook URL or Bot Token.",
          fields: [{ name: "webhookUrl", label: "Webhook URL", type: "password", required: true }],
        },
      },
    },
    {
      key: "telegram",
      name: "Telegram",
      description: "Send notifications and interact with users via Telegram Bot API.",
      category: "COMMUNICATION",
      status: IntegrationStatus.PLANNED,
      authType: AuthType.API_KEY,
      isBuiltin: false,
      iconName: "Send",
      accentColor: "#06b6d4",
      metadata: {
        triggers: [],
        actions: [],
        authRequirements: {
          instructions: "Telegram Bot Token obtained from @BotFather.",
          fields: [{ name: "botToken", label: "Bot Token", type: "password", required: true }],
        },
      },
    },
  ];

  for (const item of integrations) {
    await prisma.integrationDefinition.upsert({
      where: { key: item.key },
      update: item,
      create: item,
    });
  }
  console.log(`✅ Seeded ${integrations.length} integrations.`);

  // 2. Demo User and Workspace
  const demoEmail = "demo@flowforge.dev";
  let user = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: demoEmail,
        name: "Alex Rivera",
        passwordHash: hashPassword("Password123!"),
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: "Acme Automations",
        slug: "acme-automations",
        ownerId: user.id,
        memberships: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    // 3. Sample Workflow
    const sampleNodes = [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Catch Webhook",
          description: "Incoming lead submission from marketing site",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/leads" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 420, y: 150 },
        data: {
          label: "Verify Domain",
          description: "Check if company email is corporate",
          nodeType: "CONDITION",
          config: { field: "email", operator: "not_contains", value: "gmail.com" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 740, y: 100 },
        data: {
          label: "CRM Sync API",
          description: "Forward qualified lead to internal API",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://api.example.com/crm/leads", method: "POST" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1040, y: 150 },
        data: {
          label: "Complete Execution",
          description: "Successfully processed intake workflow",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ];

    const sampleEdges = [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3", label: "True" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ];

    const workflow = await prisma.workflow.create({
      data: {
        workspaceId: workspace.id,
        name: "Lead Intake & CRM Dispatcher",
        description: "Validates incoming webhook leads and dispatches corporate contacts to internal CRM.",
        status: WorkflowStatus.ACTIVE,
        triggerType: "Webhook",
        versions: {
          create: {
            version: 1,
            nodes: sampleNodes,
            edges: sampleEdges,
            viewport: { x: 50, y: 50, zoom: 0.95 },
            isValid: true,
          },
        },
      },
    });

    console.log(`✅ Seeded demo user (${demoEmail}) and sample workflow: ${workflow.name}`);
  } else {
    await prisma.user.update({
      where: { email: demoEmail },
      data: { passwordHash: hashPassword("Password123!") },
    });
    console.log("ℹ️ Updated demo user password hash to 10000 iterations.");
  }

  console.log("🎉 Seed finished successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
