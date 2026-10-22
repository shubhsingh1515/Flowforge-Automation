import { FastifyInstance } from "fastify";
import { prisma, WorkflowStatus } from "@flowforge/database";
import { authenticateRequest } from "../plugins/auth.js";
import { z } from "zod";

const TEMPLATES = [
  {
    id: "webhook-http-relay",
    title: "Webhook to HTTP API Relay",
    description: "Receive incoming JSON payloads via webhook and forward enriched data to a downstream REST API.",
    category: "Developer",
    triggerType: "Webhook",
    actionType: "HTTP Request",
    status: "AVAILABLE",
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
    id: "scheduled-health-check",
    title: "Scheduled Endpoint Monitor",
    description: "Periodically poll an API endpoint every hour and verify service response and status.",
    category: "Monitoring",
    triggerType: "Schedule",
    actionType: "HTTP Request",
    status: "AVAILABLE",
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
          label: "Health Check Request",
          description: "GET /health status check",
          nodeType: "HTTP_REQUEST",
          integrationKey: "http-request",
          config: { url: "https://service.example.com/health", method: "GET" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "Check Status 200",
          description: "Branch based on response status code",
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
          label: "Finish Check",
          description: "Monitoring cycle recorded",
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
    id: "slack-alert-dispatcher",
    title: "Webhook to Slack Alert",
    description: "Receive alert webhooks from cloud providers and format notifications for a Slack channel.",
    category: "Communication",
    triggerType: "Webhook",
    actionType: "Slack",
    status: "REQUIRES_SETUP",
    nodes: [
      {
        id: "node-1",
        type: "custom",
        position: { x: 100, y: 150 },
        data: {
          label: "Alert Webhook",
          description: "Receives incident alert payload",
          nodeType: "TRIGGER",
          integrationKey: "webhook",
          config: { method: "POST", path: "/incidents" },
          isValid: true,
          status: "configured",
        },
      },
      {
        id: "node-2",
        type: "custom",
        position: { x: 450, y: 150 },
        data: {
          label: "Slack Alert (Planned)",
          description: "Requires Slack OAuth connection in Phase 2",
          nodeType: "ACTION",
          integrationKey: "slack",
          config: { channel: "#ops-alerts", message: "Incident alert detected" },
          isValid: false,
          status: "error",
        },
      },
      {
        id: "node-3",
        type: "custom",
        position: { x: 800, y: 150 },
        data: {
          label: "End Alert Pipeline",
          description: "Notification broadcast completed",
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
];

export async function templateRoutes(server: FastifyInstance) {
  server.get("/templates", {
    schema: {
      tags: ["Templates"],
      summary: "Get workflow templates gallery",
    },
    handler: async () => {
      return { templates: TEMPLATES };
    },
  });

  server.post("/templates/:id/instantiate", {
    schema: {
      tags: ["Templates"],
      summary: "Create a new workflow based on a template",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const template = TEMPLATES.find((t) => t.id === id);
      if (!template) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Template not found.",
          statusCode: 404,
        });
      }

      const workflow = await prisma.workflow.create({
        data: {
          workspaceId,
          name: template.title,
          description: template.description,
          status: WorkflowStatus.DRAFT,
          triggerType: template.triggerType,
          versions: {
            create: {
              version: 1,
              nodes: template.nodes,
              edges: template.edges,
              viewport: { x: 100, y: 100, zoom: 0.9 },
              isValid: template.status === "AVAILABLE",
            },
          },
        },
      });

      return reply.status(201).send({
        workflow: {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
        },
      });
    },
  });
}
