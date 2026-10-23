import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { CreateTestCaseSchema, RunTestCaseSchema } from "@flowforge/shared";
import { workflowTestingService } from "../services/workflowTesting.js";
import { z } from "zod";

export async function workflowTestingRoutes(server: FastifyInstance) {
  // 1. List test cases for workflow
  server.get("/workflows/:id/tests", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const testCases = await workflowTestingService.listTestCases(workspaceId, id);
      return { data: testCases };
    },
  });

  // 2. Create test case fixture
  server.post("/workflows/:id/tests", {
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};

      const input = CreateTestCaseSchema.parse({
        workflowId: id,
        name: body.name,
        description: body.description,
        triggerPayload: body.triggerPayload,
        mockOutputs: body.mockOutputs,
        expectedStatus: body.expectedStatus,
        assertions: body.assertions,
      });

      const testCase = await workflowTestingService.createTestCase(workspaceId, (userId || "system"), input);
      reply.status(201);
      return { data: testCase };
    },
  });

  // 3. Get single test case
  server.get("/tests/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const tc = await workflowTestingService.getTestCase(workspaceId, id);
      return { data: tc };
    },
  });

  // 4. Update test case
  server.patch("/tests/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};
      const updated = await workflowTestingService.updateTestCase(workspaceId, id, body, userId);
      return { data: updated };
    },
  });

  // 5. Delete test case
  server.delete("/tests/:id", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const res = await workflowTestingService.deleteTestCase(workspaceId, id);
      return { data: res };
    },
  });

  // 6. Run test case in DRY_RUN / MOCKED mode
  server.post("/tests/:id/run", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params as { id: string };
      const input = RunTestCaseSchema.parse(request.body || {});
      const result = await workflowTestingService.runTestCase(workspaceId, userId || "system", id, input);
      return { data: result };
    },
  });

  // 7. List test runs for workflow
  server.get("/workflows/:id/test-runs", {
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };
      const testRuns = await workflowTestingService.listTestRuns(workspaceId, undefined, id);
      return { data: testRuns };
    },
  });
}
