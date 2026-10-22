import { FastifyInstance } from "fastify";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { authenticateRequest } from "../plugins/auth.js";
import { z } from "zod";

export async function executionRoutes(server: FastifyInstance) {
  // 1. List executions
  server.get("/executions", {
    schema: {
      tags: ["Executions"],
      summary: "List execution history for workspace workflows",
      querystring: z.object({
        status: z.enum(["ALL", "PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"]).default("ALL"),
        workflowId: z.string().optional(),
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(20),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;
      const query = request.query as {
        status?: string;
        workflowId?: string;
        page: number;
        limit: number;
      };

      const where: any = {
        workflow: {
          workspaceId,
        },
      };

      if (query.status && query.status !== "ALL") {
        where.status = query.status as ExecutionStatus;
      }

      if (query.workflowId) {
        where.workflowId = query.workflowId;
      }

      const skip = (query.page - 1) * query.limit;

      const [total, executions] = await Promise.all([
        prisma.workflowExecution.count({ where }),
        prisma.workflowExecution.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip,
          take: query.limit,
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                steps: true,
              },
            },
          },
        }),
      ]);

      return {
        data: executions.map((ex) => ({
          id: ex.id,
          workflowId: ex.workflowId,
          workflowName: ex.workflow.name,
          status: ex.status,
          startedAt: ex.startedAt,
          finishedAt: ex.finishedAt,
          durationMs: ex.durationMs,
          totalSteps: ex._count.steps,
          errorSummary: ex.errorSummary,
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

  // 2. Get execution details
  server.get("/executions/:id", {
    schema: {
      tags: ["Executions"],
      summary: "Get single execution run details and step logs",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id,
          workflow: { workspaceId },
        },
        include: {
          workflow: {
            select: { id: true, name: true },
          },
          steps: {
            orderBy: { startedAt: "asc" },
          },
        },
      });

      if (!execution) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Execution run not found.",
          statusCode: 404,
        });
      }

      return { execution };
    },
  });

  // 3. Retry an execution
  server.post("/executions/:id/retry", {
    schema: {
      tags: ["Executions"],
      summary: "Retry an eligible failed or cancelled execution",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const existing = await prisma.workflowExecution.findFirst({
        where: {
          id,
          workflow: { workspaceId },
        },
        include: {
          workflow: true,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Execution not found.",
          statusCode: 404,
        });
      }

      if (existing.status !== ExecutionStatus.FAILED && existing.status !== ExecutionStatus.CANCELLED) {
        return reply.status(400).send({
          error: "Bad Request",
          message: `Only failed or cancelled executions can be retried. Current status is ${existing.status}.`,
          statusCode: 400,
        });
      }

      const nextAttempt = (existing.attempt || 1) + 1;
      const correlationId = `retry_${existing.id}_att_${nextAttempt}`;

      // Create new retry execution record linked by retryOfId
      const newExecution = await prisma.workflowExecution.create({
        data: {
          workflowId: existing.workflowId,
          versionId: existing.versionId,
          status: ExecutionStatus.PENDING,
          attempt: nextAttempt,
          retryOfId: existing.id,
          correlationId,
          triggerEvent: existing.triggerEvent as any,
        },
      });

      const { enqueueWorkflowExecution } = await import("../worker/queue.js");
      await enqueueWorkflowExecution({
        executionId: newExecution.id,
        workflowId: newExecution.workflowId,
        versionId: newExecution.versionId,
        triggerPayload: newExecution.triggerEvent,
        correlationId,
        attempt: nextAttempt,
      });

      return reply.status(202).send({
        status: "queued",
        executionId: newExecution.id,
        attempt: nextAttempt,
        message: "Retry job successfully enqueued.",
      });
    },
  });

  // 4. Cancel an in-flight execution
  server.post("/executions/:id/cancel", {
    schema: {
      tags: ["Executions"],
      summary: "Cancel an active or pending workflow execution",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id,
          workflow: { workspaceId },
        },
      });

      if (!execution) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Execution not found.",
          statusCode: 404,
        });
      }

      if (execution.status === ExecutionStatus.SUCCESS || execution.status === ExecutionStatus.FAILED) {
        return reply.status(400).send({
          error: "Bad Request",
          message: `Execution has already concluded with status ${execution.status}.`,
          statusCode: 400,
        });
      }

      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.CANCELLED,
          finishedAt: new Date(),
          errorSummary: "Execution was cancelled by user.",
        },
      });

      return {
        success: true,
        executionId: execution.id,
        status: "CANCELLED",
        message: "Workflow execution cancelled.",
      };
    },
  });
}
