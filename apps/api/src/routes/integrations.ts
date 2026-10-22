import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { z } from "zod";

export async function integrationRoutes(server: FastifyInstance) {
  // 1. List integrations
  server.get("/integrations", {
    schema: {
      tags: ["Integrations"],
      summary: "List all supported and planned integrations",
      querystring: z.object({
        search: z.string().optional(),
        category: z.string().optional(),
      }),
    },
    handler: async (request) => {
      const { search, category } = request.query as { search?: string; category?: string };

      const where: any = {};
      if (category && category !== "ALL") {
        where.category = category;
      }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const integrations = await prisma.integrationDefinition.findMany({
        where,
        orderBy: [{ isBuiltin: "desc" }, { name: "asc" }],
      });

      return { data: integrations };
    },
  });

  // 2. Get categories
  server.get("/integrations/categories", {
    schema: {
      tags: ["Integrations"],
      summary: "List unique integration categories",
    },
    handler: async () => {
      const categories = [
        { key: "ALL", label: "All Integrations" },
        { key: "CORE", label: "Core & Triggers" },
        { key: "COMMUNICATION", label: "Communication" },
        { key: "PRODUCTIVITY", label: "Productivity" },
        { key: "DEVELOPER", label: "Developer & APIs" },
        { key: "STORAGE", label: "Storage & Files" },
      ];
      return { categories };
    },
  });

  // 3. Get integration details
  server.get("/integrations/:key", {
    schema: {
      tags: ["Integrations"],
      summary: "Get specific integration capabilities and setup requirements",
      params: z.object({ key: z.string() }),
    },
    handler: async (request, reply) => {
      const { key } = request.params as { key: string };

      const integration = await prisma.integrationDefinition.findUnique({
        where: { key },
      });

      if (!integration) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Integration '${key}' not found.`,
          statusCode: 404,
        });
      }

      return { integration };
    },
  });
}
