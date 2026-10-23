import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  GenerateWorkflowPromptSchema,
  RefineWorkflowPromptSchema,
  ExplainWorkflowSchema,
} from "@flowforge/shared";
import { authenticateRequest, requireScope } from "../plugins/auth.js";
import { aiService } from "../services/ai/aiService.js";

export async function aiRoutes(server: FastifyInstance) {
  // 1. Get AI Subsystem Status & Quotas
  server.get("/ai/status", {
    schema: {
      tags: ["AI Automation"],
      summary: "Get AI subsystem configuration, availability, and quota metrics",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const status = await aiService.getStatus(workspaceId);
      return reply.send({ data: status });
    },
  });

  // 2. Generate Workflow Proposal
  server.post("/ai/generate-workflow", {
    schema: {
      tags: ["AI Automation"],
      summary: "Generate a structured workflow proposal from natural language",
      body: GenerateWorkflowPromptSchema,
    },
    preHandler: [requireScope("ai:generate")],
    handler: async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const input = request.body as any;

      try {
        const proposal = await aiService.generateWorkflowProposal(workspaceId, userId, input);
        return reply.status(200).send({ data: proposal });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });

  // 3. Refine Workflow Proposal
  server.post("/ai/refine-workflow", {
    schema: {
      tags: ["AI Automation"],
      summary: "Conversational refinement of a workflow proposal with structural diffs",
      body: RefineWorkflowPromptSchema,
    },
    preHandler: [requireScope("ai:generate")],
    handler: async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const input = request.body as any;

      try {
        const proposal = await aiService.refineWorkflowProposal(workspaceId, userId, input);
        return reply.status(200).send({ data: proposal });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });

  // 4. Explain Workflow
  server.post("/ai/explain-workflow", {
    schema: {
      tags: ["AI Automation"],
      summary: "Explain an existing workflow definition in plain language",
      body: ExplainWorkflowSchema,
    },
    preHandler: [requireScope("workflows:read")],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const input = request.body as any;

      try {
        const explanation = await aiService.explainWorkflow(workspaceId, input);
        return reply.status(200).send({ data: explanation });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });

  // 5. Debug Execution Failure
  server.post("/ai/debug-execution/:executionId", {
    schema: {
      tags: ["AI Automation"],
      summary: "Analyze execution failure using authorized execution traces and diagnostics",
      params: z.object({
        executionId: z.string(),
      }),
    },
    preHandler: [requireScope("ai:analyze")],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { executionId } = request.params as { executionId: string };

      try {
        const report = await aiService.debugExecution(workspaceId, executionId);
        return reply.status(200).send({ data: report });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });

  // 6. Workflow Optimization Recommendations
  server.post("/ai/optimize-workflow/:workflowId", {
    schema: {
      tags: ["AI Automation"],
      summary: "Generate evidence-based optimization recommendations from telemetry",
      params: z.object({
        workflowId: z.string(),
      }),
      querystring: z.object({
        days: z.coerce.number().default(14),
      }),
    },
    preHandler: [requireScope("ai:optimize")],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { workflowId } = request.params as { workflowId: string };
      const { days } = request.query as { days: number };

      try {
        const report = await aiService.optimizeWorkflow(workspaceId, workflowId, days);
        return reply.status(200).send({ data: report });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });

  // 7. Generate Automated Test Cases
  server.post("/ai/generate-tests/:workflowId", {
    schema: {
      tags: ["AI Automation"],
      summary: "Generate fixture-based test cases and assertions for a workflow",
      params: z.object({
        workflowId: z.string(),
      }),
      querystring: z.object({
        count: z.coerce.number().default(3),
      }),
    },
    preHandler: [requireScope("ai:generate")],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { workflowId } = request.params as { workflowId: string };
      const { count } = request.query as { count: number };

      try {
        const testCases = await aiService.generateTestCases(workspaceId, workflowId, count);
        return reply.status(200).send({ data: testCases });
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          error: err.code || "AI_ERROR",
          message: err.message,
          statusCode: err.statusCode || 500,
        });
      }
    },
  });
}
