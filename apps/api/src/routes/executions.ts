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
}
