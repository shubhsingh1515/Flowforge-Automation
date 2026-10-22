import { outboundWebhookService } from "../services/outboundWebhooks.js";
import { FastifyInstance } from "fastify";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { authenticateRequest } from "../plugins/auth.js";
import { z } from "zod";
import { enqueueWorkflowExecution } from "../worker/queue.js";

export async function approvalRoutes(server: FastifyInstance) {
  // 1. List approvals for the active workspace
  server.get("/approvals", {
    schema: {
      tags: ["Approvals"],
      summary: "List all pending and decided approvals for the active workspace",
      querystring: z.object({
        status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED", "TIMED_OUT", "CANCELLED"]).default("ALL"),
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

      const where: any = { workspaceId };

      if (query.status && query.status !== "ALL") {
        where.status = query.status;
      }

      if (query.workflowId) {
        where.workflowId = query.workflowId;
      }

      const skip = (query.page - 1) * query.limit;

      const [total, approvals] = await Promise.all([
        prisma.workflowApproval.count({ where }),
        prisma.workflowApproval.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: query.limit,
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
              },
            },
            execution: {
              select: {
                id: true,
                status: true,
                correlationId: true,
                startedAt: true,
              },
            },
          },
        }),
      ]);

      return {
        data: approvals.map((appr) => ({
          id: appr.id,
          workspaceId: appr.workspaceId,
          workflowId: appr.workflowId,
          workflowName: appr.workflow.name,
          executionId: appr.executionId,
          executionStatus: appr.execution.status,
          correlationId: appr.execution.correlationId,
          nodeId: appr.nodeId,
          title: appr.title,
          description: appr.description,
          context: appr.context,
          status: appr.status,
          requiredRole: appr.requiredRole,
          decision: appr.decision,
          comment: appr.comment,
          decidedByUserId: appr.decidedByUserId,
          decidedAt: appr.decidedAt,
          expiresAt: appr.expiresAt,
          createdAt: appr.createdAt,
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

  // 2. Get approval details
  server.get("/approvals/:id", {
    schema: {
      tags: ["Approvals"],
      summary: "Get single approval request details and context",
      params: z.object({ id: z.string() }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params as { id: string };

      const approval = await prisma.workflowApproval.findFirst({
        where: { id, workspaceId },
        include: {
          workflow: { select: { id: true, name: true } },
          execution: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              correlationId: true,
              triggerEvent: true,
            },
          },
        },
      });

      if (!approval) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Approval request not found.",
          statusCode: 404,
        });
      }

      return { approval };
    },
  });

  // 3. Submit decision (Approve or Reject)
  server.post("/approvals/:id/decide", {
    schema: {
      tags: ["Approvals"],
      summary: "Approve or reject a pending workflow approval request",
      params: z.object({ id: z.string() }),
      body: z.object({
        decision: z.enum(["APPROVED", "REJECTED"]),
        comment: z.string().max(500).optional(),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { workspaceId, id: userId, workspaceRole } = request.authUser!;
      const { id } = request.params as { id: string };
      const { decision, comment } = request.body as { decision: "APPROVED" | "REJECTED"; comment?: string };

      const approval = await prisma.workflowApproval.findFirst({
        where: { id, workspaceId },
        include: {
          execution: true,
          workflow: true,
        },
      });

      if (!approval) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Approval request not found.",
          statusCode: 404,
        });
      }

      // Check if already decided (anti-replay)
      if (approval.status !== "PENDING") {
        return reply.status(400).send({
          error: "Bad Request",
          message: `Approval request has already been finalized with status '${approval.status}'.`,
          statusCode: 400,
        });
      }

      // Check expiration
      if (approval.expiresAt && approval.expiresAt < new Date()) {
        await prisma.workflowApproval.update({
          where: { id: approval.id },
          data: { status: "TIMED_OUT" },
        });
        return reply.status(400).send({
          error: "Bad Request",
          message: "Approval request has timed out and expired.",
          statusCode: 400,
        });
      }

      // Role check if requiredRole is set
      if (approval.requiredRole) {
        const roleHierarchy: Record<string, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };
        const userLevel = roleHierarchy[workspaceRole] || 0;
        const requiredLevel = roleHierarchy[approval.requiredRole] || 1;
        if (userLevel < requiredLevel) {
          return reply.status(403).send({
            error: "Forbidden",
            message: `Requires ${approval.requiredRole} privileges to decide this approval.`,
            statusCode: 403,
          });
        }
      }

      outboundWebhookService.emitEvent(workspaceId, "approval.decided", {
        approvalId: approval.id,
        workflowId: approval.workflowId,
        executionId: approval.executionId,
        decision,
      }).catch(() => {});

      // Update approval record atomically
      const updatedApproval = await prisma.workflowApproval.update({
        where: { id: approval.id },
        data: {
          status: decision,
          decision,
          comment: comment || null,
          decidedByUserId: userId,
          decidedAt: new Date(),
        },
      });

      if (decision === "APPROVED") {
        // Resume execution
        await prisma.workflowExecution.update({
          where: { id: approval.executionId },
          data: {
            status: ExecutionStatus.PENDING,
            resumedAt: new Date(),
          },
        });

        // Re-enqueue workflow execution job to resume from approval node
        await enqueueWorkflowExecution({
          executionId: approval.executionId,
          workflowId: approval.workflowId,
          versionId: approval.execution.versionId,
          triggerPayload: approval.execution.triggerEvent,
          correlationId: approval.execution.correlationId || `res_${Date.now()}`,
          resumeNodeId: approval.nodeId,
        });

        return reply.status(200).send({
          success: true,
          decision: "APPROVED",
          message: "Workflow approved and execution resumed.",
          approval: updatedApproval,
        });
      } else {
        // Rejection
        await prisma.workflowExecution.update({
          where: { id: approval.executionId },
          data: {
            status: ExecutionStatus.FAILED,
            finishedAt: new Date(),
            errorSummary: comment ? `Rejected: ${comment}` : "Workflow execution was rejected by reviewer.",
            errorCategory: "AUTH_FAILURE",
          },
        });

        return reply.status(200).send({
          success: true,
          decision: "REJECTED",
          message: "Workflow execution rejected and stopped.",
          approval: updatedApproval,
        });
      }
    },
  });
}
