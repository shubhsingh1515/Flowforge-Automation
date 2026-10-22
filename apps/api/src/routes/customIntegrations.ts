import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateCustomIntegrationSchema,
  CustomIntegrationDefinitionSchema,
} from "@flowforge/shared";
import { authenticateRequest, requireScope } from "../plugins/auth.js";
import { customIntegrationService } from "../services/customIntegrations.js";

export async function customIntegrationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List custom integrations
  app.get(
    "/custom-integrations",
    {
      preHandler: [requireScope("integrations:read")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "List all custom integrations in workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const list = await customIntegrationService.listIntegrations(workspaceId);
      return reply.send(list);
    }
  );

  // Create custom integration draft
  app.post(
    "/custom-integrations",
    {
      preHandler: [requireScope("integrations:manage")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "Create a new custom declarative integration definition",
        body: CreateCustomIntegrationSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await customIntegrationService.createIntegration(workspaceId, userId, request.body);
      return reply.status(201).send(result);
    }
  );

  // Get custom integration details
  app.get(
    "/custom-integrations/:id",
    {
      preHandler: [requireScope("integrations:read")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "Get custom integration details including version history",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customIntegrationService.getIntegration(request.params.id, workspaceId);
      return reply.send(result);
    }
  );

  // Update draft definition
  app.put(
    "/custom-integrations/:id",
    {
      preHandler: [requireScope("integrations:manage")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "Update the draft action definitions of a custom integration",
        params: z.object({ id: z.string() }),
        body: CustomIntegrationDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customIntegrationService.updateDraft(
        request.params.id,
        workspaceId,
        request.body
      );
      return reply.send(result);
    }
  );

  // Publish version
  app.post(
    "/custom-integrations/:id/publish",
    {
      preHandler: [requireScope("integrations:manage")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "Publish current draft into an immutable integration version",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customIntegrationService.publishVersion(request.params.id, workspaceId);
      return reply.send(result);
    }
  );

  // Test action run
  app.post(
    "/custom-integrations/:id/test",
    {
      preHandler: [requireScope("integrations:manage")],
      schema: {
        tags: ["Custom Integrations"],
        summary: "Run a test execution of a declarative action with sample input in sandbox",
        params: z.object({ id: z.string() }),
        body: z.object({
          actionId: z.string(),
          sampleInput: z.record(z.any()).optional().default({}),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customIntegrationService.testAction(
        request.params.id,
        workspaceId,
        request.body
      );
      return reply.send(result);
    }
  );
}
