import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { templateService } from "../services/templates.js";
import { z } from "zod";

export async function templateRoutes(server: FastifyInstance) {
  // 1. List & filter templates (both platform & workspace)
  server.get("/templates", {
    schema: {
      tags: ["Templates"],
      summary: "Get workflow templates gallery with search and category filtering",
      querystring: z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
        tag: z.string().optional(),
        type: z.enum(["ALL", "PLATFORM", "WORKSPACE"]).default("ALL"),
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(20),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as any;

      // Seed starter templates if needed
      await templateService.ensurePlatformTemplatesSeeded();

      const result = await templateService.listTemplates({
        workspaceId,
        search: query.search,
        category: query.category,
        difficulty: query.difficulty,
        tag: query.tag,
        type: query.type,
        page: query.page,
        limit: query.limit,
      });

      return result;
    },
  });

  // 2. Get template categories
  server.get("/templates/categories", {
    schema: {
      tags: ["Templates"],
      summary: "Get available template categories",
    },
    preHandler: [authenticateRequest],
    handler: async () => {
      return {
        categories: [
          "All",
          "Notifications",
          "Data Sync",
          "Operations",
          "Productivity",
          "Developer",
        ],
      };
    },
  });

  // 3. Get single template details
  server.get("/templates/:id", {
    schema: {
      tags: ["Templates"],
      summary: "Get full details and nodes preview for a single template",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      await templateService.ensurePlatformTemplatesSeeded();
      const template = await templateService.getTemplate(id, workspaceId);

      if (!template) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Template not found.",
          statusCode: 404,
        });
      }

      return { template };
    },
  });

  // 4. Instantiate template into a new workflow
  server.post("/templates/:id/instantiate", {
    schema: {
      tags: ["Templates"],
      summary: "Create a new workflow based on a template with safe ID remapping",
      params: z.object({ id: z.string() }),
      body: z.any().optional(),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};

      await templateService.ensurePlatformTemplatesSeeded();

      try {
        const workflow = await templateService.instantiateTemplate(id, workspaceId, body.name);

        return reply.status(201).send({
          workflow: {
            id: workflow.id,
            name: workflow.name,
            status: workflow.status,
            triggerType: workflow.triggerType,
            version: workflow.versions[0]?.version || 1,
            nodes: workflow.versions[0]?.nodes || [],
            edges: workflow.versions[0]?.edges || [],
          },
        });
      } catch (err: any) {
        return reply.status(404).send({
          error: "Instantiation Error",
          message: err.message,
          statusCode: 404,
        });
      }
    },
  });

  // 5. Save an existing workflow as a workspace template recipe
  server.post("/workflows/:id/save-as-template", {
    schema: {
      tags: ["Templates"],
      summary: "Save an existing workflow as a reusable workspace template recipe",
      params: z.object({ id: z.string() }),
      body: z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
          difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
          setupGuide: z.string().optional(),
        })
        .optional(),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};

      try {
        const template = await templateService.saveWorkflowAsTemplate(
          id,
          workspaceId,
          userId,
          body
        );

        return reply.status(201).send({
          template: {
            id: template.id,
            slug: template.slug,
            title: template.title,
            category: template.category,
            nodeCount: Array.isArray(template.nodes) ? template.nodes.length : 0,
            createdAt: template.createdAt,
          },
        });
      } catch (err: any) {
        return reply.status(400).send({
          error: "Save Template Error",
          message: err.message,
          statusCode: 400,
        });
      }
    },
  });
}
