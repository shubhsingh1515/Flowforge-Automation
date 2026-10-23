import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import {
  CreateEnvironmentSchema,
  UpdateEnvironmentSchema,
  SetEnvironmentVariableSchema,
  SetCredentialBindingSchema,
} from "@flowforge/shared";
import { environmentService } from "../services/environments.js";
import { z } from "zod";

export async function environmentRoutes(server: FastifyInstance) {
  // 1. List environments
  server.get("/environments", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const environments = await environmentService.listEnvironments(workspaceId);
      return { data: environments };
    },
  });

  // 2. Create custom environment
  server.post("/environments", {
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const input = CreateEnvironmentSchema.parse(request.body);
      const env = await environmentService.createEnvironment(workspaceId, input, userId);
      reply.status(201);
      return { data: env };
    },
  });

  // 3. Get single environment
  server.get("/environments/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const env = await environmentService.getEnvironment(workspaceId, id);
      return { data: env };
    },
  });

  // 4. Update environment settings
  server.patch("/environments/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const input = UpdateEnvironmentSchema.parse(request.body);
      const updated = await environmentService.updateEnvironment(workspaceId, id, input, userId);
      return { data: updated };
    },
  });

  // 5. List variables
  server.get("/environments/:id/variables", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const vars = await environmentService.listVariables(workspaceId, id);
      return { data: vars };
    },
  });

  // 6. Set variable
  server.post("/environments/:id/variables", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const input = SetEnvironmentVariableSchema.parse(request.body);
      const res = await environmentService.setVariable(workspaceId, id, input, userId);
      return { data: res };
    },
  });

  // 7. Delete variable
  server.delete("/environments/:id/variables/:key", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, userId } = request.authUser!;
      const { id, key } = request.params as { id: string; key: string };
      const res = await environmentService.deleteVariable(workspaceId, id, key, userId);
      return { data: res };
    },
  });

  // 8. List bindings
  server.get("/environments/:id/bindings", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const bindings = await environmentService.listBindings(workspaceId, id);
      return { data: bindings };
    },
  });

  // 9. Set binding
  server.post("/environments/:id/bindings", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const input = SetCredentialBindingSchema.parse(request.body);
      const res = await environmentService.setBinding(workspaceId, id, input, userId);
      return { data: res };
    },
  });

  // 10. Delete binding
  server.delete("/environments/:id/bindings/:integrationKey", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, userId } = request.authUser!;
      const { id, integrationKey } = request.params as { id: string; integrationKey: string };
      const res = await environmentService.deleteBinding(workspaceId, id, integrationKey, userId);
      return { data: res };
    },
  });
}
