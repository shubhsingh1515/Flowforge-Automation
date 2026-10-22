import { FastifyInstance } from "fastify";
import { prisma, WorkflowStatus } from "@flowforge/database";
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  validateWorkflowGraph,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { z } from "zod";

export async function workflowRoutes(server: FastifyInstance) {
  // 1. List workflows
  server.get("/workflows", {
    schema: {
      tags: ["Workflows"],
      summary: "List all workflows for the active workspace",
      querystring: z.object({
        search: z.string().optional(),
        status: z.enum(["ALL", "DRAFT", "ACTIVE", "PAUSED"]).default("ALL"),
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(20),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as {
        search?: string;
        status?: "ALL" | "DRAFT" | "ACTIVE" | "PAUSED";
        page: number;
        limit: number;
      };

      const where: any = { workspaceId };

      if (query.status && query.status !== "ALL") {
        where.status = query.status as WorkflowStatus;
      }

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const skip = (query.page - 1) * query.limit;

      const [total, workflows] = await Promise.all([
        prisma.workflow.count({ where }),
        prisma.workflow.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take: query.limit,
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
              select: {
                version: true,
                isValid: true,
                createdAt: true,
              },
            },
            executions: {
              orderBy: { startedAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                startedAt: true,
                durationMs: true,
              },
            },
          },
        }),
      ]);

      return {
        data: workflows.map((wf) => ({
          id: wf.id,
          name: wf.name,
          description: wf.description,
          status: wf.status,
          triggerType: wf.triggerType || "Manual",
          latestVersion: wf.versions[0]?.version || 1,
          isValid: wf.versions[0]?.isValid ?? true,
          lastExecution: wf.executions[0] || null,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        })),
        meta: {
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },
  });

  // 2. Create workflow
  server.post("/workflows", {
    schema: {
      tags: ["Workflows"],
      summary: "Create a new workflow",
      body: CreateWorkflowSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const data = CreateWorkflowSchema.parse(request.body);

      // Validate graph if nodes are present
      const validation = validateWorkflowGraph(data.nodes as any, data.edges as any);

      // Determine trigger type from first trigger node if present
      const triggerNode = data.nodes.find((n) => n.data.nodeType === "TRIGGER");
      const triggerType = triggerNode ? triggerNode.data.label : "Manual";

      const isWebhook = triggerNode?.data?.integrationKey === "webhook" || triggerNode?.data?.label?.toLowerCase().includes("webhook");
      const webhookSlug = isWebhook ? `wh_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}` : undefined;

      const workflow = await prisma.workflow.create({
        data: {
          workspaceId,
          name: data.name,
          description: data.description || "",
          status: data.status,
          triggerType,
          webhookSlug,
          versions: {
            create: {
              version: 1,
              nodes: data.nodes as any,
              edges: data.edges as any,
              viewport: data.viewport as any,
              isValid: validation.isValid,
            },
          },
        },
        include: {
          versions: {
            take: 1,
          },
        },
      });

      return reply.status(201).send({
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status,
          triggerType: workflow.triggerType,
          webhookSlug: workflow.webhookSlug,
          webhookSecret: workflow.webhookSecret,
          version: workflow.versions[0],
          validation,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
      });
    },
  });

  // 3. Get workflow details
  server.get("/workflows/:id", {
    schema: {
      tags: ["Workflows"],
      summary: "Get workflow details and latest graph definition",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const workflow = await prisma.workflow.findFirst({
        where: { id, workspaceId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!workflow) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found in current workspace.",
          statusCode: 404,
        });
      }

      const latestVersion = workflow.versions[0] || {
        version: 1,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isValid: true,
      };

      const validation = validateWorkflowGraph(
        (latestVersion.nodes as any) || [],
        (latestVersion.edges as any) || []
      );

      return {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status,
          triggerType: workflow.triggerType,
          webhookSlug: workflow.webhookSlug,
          webhookSecret: workflow.webhookSecret,
          nodes: latestVersion.nodes,
          edges: latestVersion.edges,
          viewport: latestVersion.viewport,
          version: latestVersion.version,
          validation,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
      };
    },
  });

  // 4. Update workflow
  server.put("/workflows/:id", {
    schema: {
      tags: ["Workflows"],
      summary: "Update workflow metadata and graph definition",
      params: z.object({ id: z.string() }),
      body: UpdateWorkflowSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const data = UpdateWorkflowSchema.parse(request.body);

      // Verify ownership
      const existing = await prisma.workflow.findFirst({
        where: { id, workspaceId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found or access denied.",
          statusCode: 404,
        });
      }

      let triggerType = existing.triggerType;
      let validation = { isValid: true, errors: [], warnings: [] };

      // Update version if nodes or edges are provided
      if (data.nodes || data.edges) {
        const nodesToValidate = data.nodes || (existing.versions[0]?.nodes as any) || [];
        const edgesToValidate = data.edges || (existing.versions[0]?.edges as any) || [];

        validation = validateWorkflowGraph(nodesToValidate, edgesToValidate) as any;

        const triggerNode = nodesToValidate.find((n: any) => n.data?.nodeType === "TRIGGER");
        if (triggerNode) {
          triggerType = triggerNode.data.label;
        }

        // Upsert latest version
        const currentVerNum = existing.versions[0]?.version || 1;
        await prisma.workflowVersion.upsert({
          where: {
            workflowId_version: {
              workflowId: existing.id,
              version: currentVerNum,
            },
          },
          update: {
            nodes: nodesToValidate,
            edges: edgesToValidate,
            viewport: data.viewport as any,
            isValid: validation.isValid,
          },
          create: {
            workflowId: existing.id,
            version: currentVerNum,
            nodes: nodesToValidate,
            edges: edgesToValidate,
            viewport: data.viewport as any,
            isValid: validation.isValid,
          },
        });
      }

      let webhookSlug = existing.webhookSlug;
      const isWebhook = triggerType?.toLowerCase().includes("webhook");
      if (isWebhook && !webhookSlug) {
        webhookSlug = `wh_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
      }

      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          name: data.name !== undefined ? data.name : existing.name,
          description: data.description !== undefined ? data.description : existing.description,
          status: data.status !== undefined ? data.status : existing.status,
          triggerType,
          webhookSlug,
        },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      return {
        workflow: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          status: updated.status,
          triggerType: updated.triggerType,
          webhookSlug: updated.webhookSlug,
          webhookSecret: updated.webhookSecret,
          nodes: updated.versions[0]?.nodes || [],
          edges: updated.versions[0]?.edges || [],
          viewport: updated.versions[0]?.viewport,
          version: updated.versions[0]?.version || 1,
          validation,
          updatedAt: updated.updatedAt,
        },
      };
    },
  });

  // 5. Delete workflow
  server.delete("/workflows/:id", {
    schema: {
      tags: ["Workflows"],
      summary: "Delete a workflow and all associated versions/executions",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const workflow = await prisma.workflow.findFirst({
        where: { id, workspaceId },
      });

      if (!workflow) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found or already deleted.",
          statusCode: 404,
        });
      }

      await prisma.workflow.delete({
        where: { id: workflow.id },
      });

      return { success: true, message: `Workflow '${workflow.name}' was permanently deleted.` };
    },
  });

  // 6. Duplicate workflow
  server.post("/workflows/:id/duplicate", {
    schema: {
      tags: ["Workflows"],
      summary: "Duplicate an existing workflow",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const original = await prisma.workflow.findFirst({
        where: { id, workspaceId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!original) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found.",
          statusCode: 404,
        });
      }

      const latestVersion = original.versions[0];

      const duplicated = await prisma.workflow.create({
        data: {
          workspaceId,
          name: `Copy of ${original.name}`,
          description: original.description,
          status: WorkflowStatus.DRAFT,
          triggerType: original.triggerType,
          versions: {
            create: {
              version: 1,
              nodes: (latestVersion?.nodes as any) || [],
              edges: (latestVersion?.edges as any) || [],
              viewport: (latestVersion?.viewport as any) || null,
              isValid: latestVersion?.isValid ?? true,
            },
          },
        },
      });

      return reply.status(201).send({
        workflow: {
          id: duplicated.id,
          name: duplicated.name,
          status: duplicated.status,
        },
      });
    },
  });

  // 7. Validate workflow structure
  server.post("/workflows/validate", {
    schema: {
      tags: ["Workflows"],
      summary: "Validate a workflow graph for cycle detection and connectivity",
      body: z.object({
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { nodes, edges } = request.body as { nodes: any[]; edges: any[] };
      const validation = validateWorkflowGraph(nodes, edges);
      return validation;
    },
  });

  // 8. Activate workflow
  server.post("/workflows/:id/activate", {
    schema: {
      tags: ["Workflows"],
      summary: "Validate, activate, and register trigger hooks for a workflow",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const workflow = await prisma.workflow.findFirst({
        where: { id, workspaceId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!workflow) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found in current workspace.",
          statusCode: 404,
        });
      }

      const version = workflow.versions[0];
      const nodes: any[] = (version?.nodes as any[]) || [];
      const edges: any[] = (version?.edges as any[]) || [];

      // Validate graph before activation
      const validation = validateWorkflowGraph(nodes, edges);
      if (!validation.isValid) {
        return reply.status(400).send({
          error: "Bad Request",
          message: `Cannot activate invalid workflow: ${validation.errors.map((e) => e.message).join("; ")}`,
          statusCode: 400,
          details: validation.errors,
        });
      }

      // Generate webhook slug if trigger is Webhook and slug is missing
      const triggerNode = nodes.find((n) => n.data?.nodeType === "TRIGGER");
      const isWebhook = triggerNode?.data?.integrationKey === "webhook" || triggerNode?.data?.label?.toLowerCase().includes("webhook");
      const isSchedule = triggerNode?.data?.integrationKey === "schedule" || triggerNode?.data?.label?.toLowerCase().includes("schedule");

      let webhookSlug = workflow.webhookSlug;
      if (isWebhook && !webhookSlug) {
        const randomHex = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        webhookSlug = `wh_${randomHex}`;
      }

      const updated = await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: WorkflowStatus.ACTIVE,
          webhookSlug,
        },
      });

      // If scheduled, register schedule
      if (isSchedule && triggerNode?.data?.config?.cronExpression) {
        const { scheduler } = await import("../worker/scheduler.js");
        await scheduler.registerSchedule({
          workflowId: workflow.id,
          cronExpression: triggerNode.data.config.cronExpression,
          timezone: triggerNode.data.config.timezone || "UTC",
        });
      }

      return {
        workflow: {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          webhookSlug: updated.webhookSlug,
          message: "Workflow successfully activated.",
        },
      };
    },
  });

  // 9. Pause workflow
  server.post("/workflows/:id/pause", {
    schema: {
      tags: ["Workflows"],
      summary: "Pause an active workflow",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const workflow = await prisma.workflow.findFirst({
        where: { id, workspaceId },
      });

      if (!workflow) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found.",
          statusCode: 404,
        });
      }

      const updated = await prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: WorkflowStatus.PAUSED },
      });

      // Remove active schedule if any
      const { scheduler } = await import("../worker/scheduler.js");
      await scheduler.removeSchedule(workflow.id);

      return {
        workflow: {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          message: "Workflow paused.",
        },
      };
    },
  });

  // 10. Test execute workflow
  server.post("/workflows/:id/test", {
    schema: {
      tags: ["Workflows"],
      summary: "Enqueue a test execution with custom payload",
      params: z.object({ id: z.string() }),
      body: z.object({
        triggerPayload: z.any().optional(),
      }).optional(),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};

      const workflow = await prisma.workflow.findFirst({
        where: { id, workspaceId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!workflow || workflow.versions.length === 0) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Workflow not found.",
          statusCode: 404,
        });
      }

      const correlationId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const triggerPayload = body.triggerPayload || {
        event: "manual.test",
        timestamp: new Date().toISOString(),
        testData: true,
      };

      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          versionId: workflow.versions[0]?.id || null,
          status: "PENDING",
          correlationId,
          triggerEvent: triggerPayload,
        },
      });

      const { enqueueWorkflowExecution } = await import("../worker/queue.js");
      await enqueueWorkflowExecution({
        executionId: execution.id,
        workflowId: workflow.id,
        versionId: workflow.versions[0]?.id || null,
        triggerPayload,
        correlationId,
      });

      return reply.status(202).send({
        status: "queued",
        executionId: execution.id,
        correlationId,
        message: "Test execution enqueued for background worker.",
      });
    },
  });
  // 9. Preview Data Transformation
  server.post("/workflows/preview-transform", {
    schema: {
      tags: ["Workflows"],
      summary: "Safely preview a data transformation against sample JSON input",
      body: z.object({
        sampleInput: z.any().default({}),
        config: z.any().default({}),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { sampleInput, config: transformConfig } = request.body as {
        sampleInput: any;
        config: any;
      };

      try {
        const { executeTransformation } = await import("../engine/nodes/transform.js");
        const context = {
          trigger: { body: sampleInput },
          steps: {},
          env: { PREVIEW: "true" },
        };
        const output = executeTransformation(transformConfig, context);
        return { success: true, result: output };
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: "Transformation Error",
          message: err.message,
        });
      }
    },
  });
}
