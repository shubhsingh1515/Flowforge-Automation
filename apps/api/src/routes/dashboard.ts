import { FastifyInstance } from "fastify";
import { prisma, WorkflowStatus, ExecutionStatus } from "@flowforge/database";
import { authenticateRequest } from "../plugins/auth.js";

export async function dashboardRoutes(server: FastifyInstance) {
  server.get("/dashboard/metrics", {
    schema: {
      tags: ["Dashboard"],
      summary: "Get aggregate metrics for the active workspace",
      description: "Derives real metrics from database records for workflows and executions.",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;

      // Total workflows in this workspace
      const totalWorkflows = await prisma.workflow.count({
        where: { workspaceId },
      });

      // Active workflows
      const activeWorkflows = await prisma.workflow.count({
        where: { workspaceId, status: WorkflowStatus.ACTIVE },
      });

      // Executions under workflows belonging to this workspace
      const successfulRuns = await prisma.workflowExecution.count({
        where: {
          workflow: { workspaceId },
          status: ExecutionStatus.SUCCESS,
        },
      });

      const failedRuns = await prisma.workflowExecution.count({
        where: {
          workflow: { workspaceId },
          status: ExecutionStatus.FAILED,
        },
      });

      return {
        totalWorkflows,
        activeWorkflows,
        successfulRuns,
        failedRuns,
        recentWorkflowsCount: totalWorkflows,
      };
    },
  });

  server.get("/dashboard/activity", {
    schema: {
      tags: ["Dashboard"],
      summary: "Get recent workflow activity for dashboard table",
    },
    preHandler: [authenticateRequest],
    handler: async (request) => {
      const { workspaceId } = request.authUser!;

      const workflows = await prisma.workflow.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          executions: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              startedAt: true,
              finishedAt: true,
              durationMs: true,
            },
          },
        },
      });

      return {
        activity: workflows.map((wf) => ({
          id: wf.id,
          name: wf.name,
          description: wf.description,
          status: wf.status,
          triggerType: wf.triggerType || "Manual",
          updatedAt: wf.updatedAt,
          lastExecution: wf.executions[0] || null,
        })),
      };
    },
  });
}
