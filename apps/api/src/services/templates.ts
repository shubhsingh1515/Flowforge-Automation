import { prisma, WorkflowStatus } from "@flowforge/database";
import { validateWorkflowGraph } from "@flowforge/shared";

export interface StarterTemplateDef {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  triggerType: string;
  actionType: string;
  requiredIntegrations: string[];
  setupGuide: string;
  nodes: any[];
  edges: any[];
}

export const STARTER_TEMPLATES: StarterTemplateDef[] = [
  {
    slug: "webhook-http-relay",
    title: "Webhook to HTTP API Relay",
    description: "Receive incoming JSON payloads via webhook and forward enriched data to a downstream REST API.",
    category: "Developer",
    tags: ["webhook", "http", "relay", "api"],
    difficulty: "BEGINNER",
    triggerType: "Webhook",
    actionType: "HTTP Request",
    requiredIntegrations: ["webhook", "http-request"],
    setupGuide: "1. Configure your downstream HTTP API URL.\n2. Send a POST request to the Webhook URL.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Receive Webhook",
          description: "Incoming HTTP POST trigger",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/relay" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Send to External API",
          description: "Dispatch payload via HTTP POST",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://api.example.com/v1/events", method: "POST" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Workflow Complete",
          description: "Execution finished successfully",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
    ],
  },
  {
    slug: "webhook-lead-slack",
    title: "Webhook Lead Intake to Slack",
    description: "Receive incoming prospect leads via HTTP webhook and format notifications for a designated Slack channel.",
    category: "Notifications",
    tags: ["webhook", "slack", "leads", "notifications"],
    difficulty: "BEGINNER",
    triggerType: "Webhook",
    actionType: "Slack",
    requiredIntegrations: ["webhook", "slack"],
    setupGuide: "1. Connect your Slack workspace.\n2. Select the destination notification channel (e.g. #sales-leads).\n3. Copy the generated Webhook URL and post customer lead JSON.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Inbound Lead Webhook",
          description: "Receives prospect JSON payload",
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
        position: { x: 450, y: 150 },
        data: {
          label: "Post to Slack Channel",
          description: "Formats and posts lead details",
          nodeType: "ACTION",
          integrationKey: "slack",
          config: { channel: "#sales-leads", message: "🚀 *New Lead Received*\nName: {{trigger.name}}\nEmail: {{trigger.email}}" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Workflow Complete",
          description: "Lead broadcast recorded",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
    ],
  },
  {
    slug: "sheets-lead-recorder",
    title: "Append Webhook Events to Google Sheets",
    description: "Automatically log incoming customer events, transactions, or contact inquiries into a Google Spreadsheet.",
    category: "Data Sync",
    tags: ["webhook", "sheets", "crm", "spreadsheet"],
    difficulty: "BEGINNER",
    triggerType: "Webhook",
    actionType: "Google Sheets",
    requiredIntegrations: ["webhook", "google-sheets"],
    setupGuide: "1. Authorize your Google Sheets account via OAuth.\n2. Enter your Spreadsheet ID and target sheet name.\n3. Map payload properties to spreadsheet column values.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Customer Event Trigger",
          description: "Captures customer event webhook",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/customer-events" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Append Row in Google Sheets",
          description: "Adds customer record to spreadsheet",
          nodeType: "ACTION",
          integrationKey: "google-sheets",
          config: { spreadsheetId: "lead_tracker_sheet", range: "Sheet1!A:E" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "End Ingestion",
          description: "Spreadsheet sync finished",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
    ],
  },
  {
    slug: "approval-gmail-dispatch",
    title: "Manager Approval Before Sending Gmail",
    description: "Pause pipeline execution until a workspace admin reviews and approves outgoing customer email content.",
    category: "Operations",
    tags: ["gmail", "approval", "compliance", "human-in-the-loop"],
    difficulty: "INTERMEDIATE",
    triggerType: "Webhook",
    actionType: "Gmail",
    requiredIntegrations: ["webhook", "approval", "gmail"],
    setupGuide: "1. Connect your Gmail account via OAuth.\n2. Configure approval prompt title and required workspace role (e.g. ADMIN).\n3. Approvers will review incoming proposals in the Approvals queue before Gmail sends.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Inbound Email Proposal",
          description: "Webhook carrying client outreach proposal",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/proposals" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 400, y: 150 },
        data: {
          label: "Manager Review & Approval",
          description: "Halts run until admin reviews proposal",
          nodeType: "APPROVAL",
          config: {
            title: "Approve Client Outreach",
            description: "Review email template and proposed recipient list",
            requiredRole: "ADMIN",
            timeoutSeconds: 86400,
          },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 750, y: 150 },
        data: {
          label: "Dispatch Gmail Outreach",
          description: "Sends email once approved",
          nodeType: "ACTION",
          integrationKey: "gmail",
          config: { to: "{{trigger.recipient}}", subject: "Approved Proposal: FlowForge Partnership" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1050, y: 150 },
        data: {
          label: "Pipeline Finished",
          description: "Dispatch successfully concluded",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
  {
    slug: "drive-backup-alert",
    title: "Google Drive File Upload to Slack Channel",
    description: "Periodically backup operational logs to Google Drive and notify your engineering team on Slack.",
    category: "Productivity",
    tags: ["drive", "slack", "files", "backup"],
    difficulty: "INTERMEDIATE",
    triggerType: "Schedule",
    actionType: "Google Drive",
    requiredIntegrations: ["schedule", "google-drive", "slack"],
    setupGuide: "1. Connect your Google Drive and Slack accounts.\n2. Configure destination folder name in Google Drive.\n3. Specify Slack channel for confirmation alerts.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Daily Backup Schedule",
          description: "Runs every night at midnight",
          nodeType: "TRIGGER",
          integrationKey: "schedule",
          config: { cronExpression: "0 0 * * *", timezone: "UTC" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Save Report to Google Drive",
          description: "Uploads snapshot to Drive folder",
          nodeType: "ACTION",
          integrationKey: "google-drive",
          config: { fileName: "daily-report.json", folderId: "root" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Alert Team on Slack",
          description: "Posts Drive file link to channel",
          nodeType: "ACTION",
          integrationKey: "slack",
          config: { channel: "#ops-notifications", message: "✅ Daily report uploaded to Google Drive." },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1100, y: 150 },
        data: {
          label: "End Backup Pipeline",
          description: "Backup cycle recorded",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
  {
    slug: "conditional-filtering-pipeline",
    title: "Filter Incoming Events Before REST API Dispatch",
    description: "Inspect incoming webhook attributes, discard noise or invalid payloads, and only forward qualifying records.",
    category: "Developer",
    tags: ["filter", "http", "api", "routing"],
    difficulty: "BEGINNER",
    triggerType: "Webhook",
    actionType: "Filter",
    requiredIntegrations: ["webhook", "http-request"],
    setupGuide: "1. Specify filter condition rule (e.g. status equals 'active' or priority equals 'high').\n2. Configure destination REST API endpoint.\n3. Discarded events stop at the filter node without incurring downstream costs.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Incoming Event Webhook",
          description: "Accepts JSON payload",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/events" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Filter Priority High",
          description: "Only continue if priority == 'high'",
          nodeType: "FILTER",
          config: { field: "priority", operator: "equals", value: "high" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Dispatch to REST API",
          description: "POSTs qualified event downstream",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://api.example.com/v1/high-priority-events", method: "POST" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1100, y: 150 },
        data: {
          label: "Pipeline Complete",
          description: "Finished filtering cycle",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
  {
    slug: "json-data-transformation",
    title: "Normalize & Transform JSON Payload",
    description: "Reshape, compute, and map nested webhook properties into clean JSON schemas before forwarding to downstream systems.",
    category: "Developer",
    tags: ["transform", "json", "etl", "data-mapping"],
    difficulty: "INTERMEDIATE",
    triggerType: "Webhook",
    actionType: "Transform",
    requiredIntegrations: ["webhook", "http-request"],
    setupGuide: "1. Configure field mappings or math expressions.\n2. Preview transformed output in real-time with sample input.\n3. Send transformed data to downstream endpoint.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Raw Webhook Intake",
          description: "Accepts source payload",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/raw-data" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Transform & Normalize",
          description: "Map fields and calculate totals",
          nodeType: "TRANSFORM",
          config: {
            mode: "MAP_FIELDS",
            fields: [
              { target: "customerId", expression: "trigger.user_id" },
              { target: "fullName", expression: "trigger.first_name + ' ' + trigger.last_name" },
              { target: "amountWithTax", expression: "trigger.amount * 1.1" },
            ],
          },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Forward Clean JSON",
          description: "POST normalized record to API",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://api.example.com/v1/normalized-leads", method: "POST" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1100, y: 150 },
        data: {
          label: "End Transformation",
          description: "Completed schema normalization",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
  {
    slug: "batch-array-processing",
    title: "Loop Through Array Records",
    description: "Iterate across an array of incoming items or line items and execute discrete actions per item with concurrency limits.",
    category: "Data Sync",
    tags: ["loop", "batch", "records", "iteration"],
    difficulty: "ADVANCED",
    triggerType: "Webhook",
    actionType: "Loop",
    requiredIntegrations: ["webhook", "http-request"],
    setupGuide: "1. Define array field expression in loop node (e.g. trigger.items).\n2. Set concurrency limit (e.g. 5 concurrent iterations).\n3. Connected sub-nodes execute for every record in the array.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Batch Order Webhook",
          description: "Webhook containing array of items",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/batch-orders" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Iterate Order Items",
          description: "Loops over trigger.items array",
          nodeType: "LOOP",
          config: { arrayField: "items", maxIterations: 50 },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Process Item API",
          description: "Invoked per item in batch",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://inventory.example.com/items", method: "POST" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1100, y: 150 },
        data: {
          label: "Batch Complete",
          description: "All iterations successfully finished",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
  {
    slug: "scheduled-health-monitor",
    title: "Hourly API Health Monitoring & Alerting",
    description: "Periodically poll your production endpoints, verify response status codes, and halt or alert if the system is unhealthy.",
    category: "Operations",
    tags: ["schedule", "monitoring", "http", "devops"],
    difficulty: "BEGINNER",
    triggerType: "Schedule",
    actionType: "HTTP Request",
    requiredIntegrations: ["schedule", "http-request"],
    setupGuide: "1. Configure polling schedule frequency (e.g. hourly or every 15m).\n2. Set health check URL and expected HTTP status.\n3. Add downstream alert nodes if status is non-200.",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Hourly Schedule",
          description: "Triggers every 60 minutes",
          nodeType: "TRIGGER",
          integrationKey: "schedule",
          config: { cronExpression: "0 * * * *", timezone: "UTC" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "GET /health Check",
          description: "Polls API endpoint status",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://api.example.com/health", method: "GET" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Verify 200 OK",
          description: "Evaluates response status code",
          nodeType: "CONDITION",
          config: { field: "statusCode", operator: "equals", value: "200" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-4",
        type: "custom",
        position: { x: 1100, y: 150 },
        data: {
          label: "Health Check Complete",
          description: "Status successfully recorded",
          nodeType: "WORKFLOW_END",
          config: {},
          isValid: true,
          status: "configured",
        },
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2", animated: true },
      { id: "e2-3", source: "node-2", target: "node-3" },
      { id: "e3-4", source: "node-3", target: "node-4" },
    ],
  },
];

export class TemplateService {
  /**
   * Ensure platform starter templates exist in the database.
   */
  async ensurePlatformTemplatesSeeded(): Promise<void> {
    for (const tpl of STARTER_TEMPLATES) {
      await prisma.workflowTemplate.upsert({
        where: { slug: tpl.slug },
        update: {
          title: tpl.title,
          description: tpl.description,
          category: tpl.category,
          tags: tpl.tags,
          difficulty: tpl.difficulty,
          triggerType: tpl.triggerType,
          actionType: tpl.actionType,
          requiredIntegrations: tpl.requiredIntegrations,
          setupGuide: tpl.setupGuide,
          nodes: tpl.nodes,
          edges: tpl.edges,
          isPlatform: true,
        },
        create: {
          slug: tpl.slug,
          title: tpl.title,
          description: tpl.description,
          category: tpl.category,
          tags: tpl.tags,
          difficulty: tpl.difficulty,
          triggerType: tpl.triggerType,
          actionType: tpl.actionType,
          requiredIntegrations: tpl.requiredIntegrations,
          setupGuide: tpl.setupGuide,
          nodes: tpl.nodes,
          edges: tpl.edges,
          isPlatform: true,
        },
      });
    }
  }

  /**
   * Search and filter templates (both platform and workspace-owned).
   */
  async listTemplates(params: {
    workspaceId: string;
    search?: string;
    category?: string;
    difficulty?: string;
    tag?: string;
    type?: "ALL" | "PLATFORM" | "WORKSPACE";
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.type === "PLATFORM") {
      where.isPlatform = true;
    } else if (params.type === "WORKSPACE") {
      where.workspaceId = params.workspaceId;
    } else {
      where.OR = [
        { isPlatform: true },
        { workspaceId: params.workspaceId },
      ];
    }

    if (params.category && params.category !== "ALL") {
      where.category = params.category;
    }

    if (params.difficulty) {
      where.difficulty = params.difficulty;
    }

    if (params.tag) {
      where.tags = { has: params.tag };
    }

    if (params.search) {
      const searchClause = [
        { title: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchClause }];
        delete where.OR;
      } else {
        where.OR = searchClause;
      }
    }

    const [total, templates] = await Promise.all([
      prisma.workflowTemplate.count({ where }),
      prisma.workflowTemplate.findMany({
        where,
        orderBy: [{ isPlatform: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return {
      templates: templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.title,
        description: t.description,
        category: t.category,
        tags: t.tags,
        difficulty: t.difficulty,
        triggerType: t.triggerType,
        actionType: t.actionType,
        requiredIntegrations: t.requiredIntegrations,
        setupGuide: t.setupGuide,
        nodeCount: Array.isArray(t.nodes) ? t.nodes.length : 0,
        nodes: t.nodes,
        edges: t.edges,
        isPlatform: t.isPlatform,
        workspaceId: t.workspaceId,
        createdAt: t.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve template details by ID or slug.
   */
  async getTemplate(idOrSlug: string, workspaceId: string) {
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        AND: [
          {
            OR: [{ isPlatform: true }, { workspaceId }],
          },
        ],
      },
    });

    return template;
  }

  /**
   * Remap node and edge IDs deterministically to produce a safe, isolated clone.
   */
  remapGraph(nodes: any[], edges: any[]): { nodes: any[]; edges: any[]; idMap: Record<string, string> } {
    const idMap: Record<string, string> = {};
    const timestamp = Date.now();

    // 1. Remap node IDs
    const newNodes = nodes.map((node, index) => {
      const newId = `node_${timestamp}_${index + 1}_${Math.random().toString(36).substring(2, 6)}`;
      idMap[node.id] = newId;
      return {
        ...node,
        id: newId,
        data: {
          ...node.data,
          status: "configured",
          isValid: true,
        },
      };
    });

    // 2. Remap edge source/target IDs
    const newEdges = edges.map((edge, index) => {
      const newSource = idMap[edge.source] || edge.source;
      const newTarget = idMap[edge.target] || edge.target;
      return {
        ...edge,
        id: `e_${newSource}_${newTarget}_${index}`,
        source: newSource,
        target: newTarget,
      };
    });

    return { nodes: newNodes, edges: newEdges, idMap };
  }

  /**
   * Instantiate a template into a new DRAFT workflow within the authorized workspace.
   */
  async instantiateTemplate(templateIdOrSlug: string, workspaceId: string, customName?: string) {
    const template = await this.getTemplate(templateIdOrSlug, workspaceId);
    if (!template) {
      throw new Error("Template not found or access denied.");
    }

    const rawNodes = (template.nodes as any[]) || [];
    const rawEdges = (template.edges as any[]) || [];

    // Remap all node and edge IDs to fresh unique IDs
    const { nodes: remappedNodes, edges: remappedEdges } = this.remapGraph(rawNodes, rawEdges);

    // Identify connected accounts in workspace to pre-bind or mark placeholders
    const existingConnections = await prisma.connectedAccount.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, integrationKey: true, name: true },
    });

    const connectionMap = new Map<string, string>();
    for (const conn of existingConnections) {
      if (!connectionMap.has(conn.integrationKey)) {
        connectionMap.set(conn.integrationKey, conn.id);
      }
    }

    // Inspect each node to link existing connection or flag missing connection
    const preparedNodes = remappedNodes.map((node) => {
      const key = node.data?.integrationKey;
      if (key && !["webhook", "schedule", "http-request", "approval"].includes(key)) {
        const foundConnId = connectionMap.get(key);
        if (foundConnId) {
          node.data.connectionId = foundConnId;
          node.data.needsConnection = false;
        } else {
          node.data.needsConnection = true;
        }
      }
      return node;
    });

    const workflowName = customName || template.title;

    // Create workflow in DRAFT status
    const workflow = await prisma.workflow.create({
      data: {
        workspaceId,
        name: workflowName,
        description: template.description,
        status: WorkflowStatus.DRAFT,
        triggerType: template.triggerType,
        versions: {
          create: {
            version: 1,
            changeSummary: `Created from template: ${template.title}`,
            nodes: preparedNodes,
            edges: remappedEdges,
            viewport: { x: 100, y: 100, zoom: 0.9 },
            isValid: true,
          },
        },
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    // Update onboarding state
    await prisma.workspaceOnboarding.upsert({
      where: { workspaceId },
      update: { hasCreatedWorkflow: true, hasUsedTemplate: true },
      create: { workspaceId, hasCreatedWorkflow: true, hasUsedTemplate: true },
    });

    return workflow;
  }

  /**
   * Save an existing workflow as a workspace-owned reusable template recipe.
   */
  async saveWorkflowAsTemplate(
    workflowId: string,
    workspaceId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      tags?: string[];
      difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
      setupGuide?: string;
    }
  ) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow || workflow.versions.length === 0) {
      throw new Error("Workflow not found or has no versions.");
    }

    const latest = workflow.versions[0];
    const rawNodes = (latest.nodes as any[]) || [];
    const rawEdges = (latest.edges as any[]) || [];

    // Sanitize nodes: strip specific connection IDs, sensitive tokens, live credentials
    const sanitizedNodes = rawNodes.map((n) => {
      const nodeCopy = { ...n, data: { ...n.data } };
      delete nodeCopy.data.connectionId;
      delete nodeCopy.data.webhookSlug;
      delete nodeCopy.data.webhookSecret;
      return nodeCopy;
    });

    // Remap IDs for clean template storage
    const { nodes: templateNodes, edges: templateEdges } = this.remapGraph(sanitizedNodes, rawEdges);

    const slug = `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const category = data.category || "Productivity";
    const title = data.title || `${workflow.name} Recipe`;
    const description = data.description || workflow.description || "Custom workspace automation recipe.";
    const tags = data.tags || ["custom", "workspace"];
    const difficulty = data.difficulty || "BEGINNER";
    const setupGuide = data.setupGuide || "Configure required integration connections and click Save.";

    const requiredIntegrations = Array.from(
      new Set(
        templateNodes
          .map((n) => n.data?.integrationKey)
          .filter(Boolean)
      )
    ) as string[];

    const template = await prisma.workflowTemplate.create({
      data: {
        slug,
        title,
        description,
        category,
        tags,
        difficulty,
        triggerType: workflow.triggerType || "Manual",
        actionType: requiredIntegrations[1] || requiredIntegrations[0] || "Custom",
        requiredIntegrations,
        setupGuide,
        nodes: templateNodes,
        edges: templateEdges,
        isPlatform: false,
        workspaceId,
        createdById: userId,
      },
    });

    return template;
  }
}

export const templateService = new TemplateService();
