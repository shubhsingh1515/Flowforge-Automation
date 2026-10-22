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

      const workflow = await prisma.workflow.create({
        data: {
          workspaceId,
          name: data.name,
          description: data.description || "",
          status: data.status,
          triggerType,
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

      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          name: data.name !== undefined ? data.name : existing.name,
          description: data.description !== undefined ? data.description : existing.description,
          status: data.status !== undefined ? data.status : existing.status,
          triggerType,
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
}
