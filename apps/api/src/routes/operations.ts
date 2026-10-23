import { FastifyInstance } from "fastify";
import { ReconciliationRequestSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { operationsService } from "../services/operations.js";
import { reconciliationService } from "../services/reconciliation.js";

export async function operationsRoutes(server: FastifyInstance) {
  // 1. Get Live Operational Overview & Active Alerts (Admin/Owner)
  const overviewHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Only workspace OWNER or ADMIN roles can access the operations dashboard.",
        statusCode: 403,
      });
    }

    const overview = await operationsService.getOperationalOverview();
    return { overview, ...overview };
  };

  server.get("/operations/overview", { preHandler: [authenticateRequest] }, overviewHandler);

  // 2. Trigger Execution Reconciliation (Admin/Owner)
  const reconcileHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Only workspace OWNER or ADMIN roles can trigger execution reconciliation.",
        statusCode: 403,
      });
    }

    const body = request.body || {};
    const mode = body.mode || (body.dryRun === false ? "execute" : "dry-run");
    const maxAgeMinutes = body.maxAgeMinutes || 15;
    const limit = body.limit || 50;

    const result = await reconciliationService.reconcile({
      workspaceId: authUser.workspaceId,
      mode,
      maxAgeMinutes,
      limit,
      actorUserId: authUser.id,
    });

    return {
      ...result,
      reconciliation: result,
      dryRun: result.mode === "dry-run",
      stuckCount: result.anomaliesFound,
      candidates: result.anomalies.map((a: any) => ({
        id: a.executionId,
        startedAt: a.startedAt,
        stuckMinutes: a.minutesInStatus,
      })),
    };
  };

  server.post("/operations/reconcile", { preHandler: [authenticateRequest] }, reconcileHandler);
  server.post("/operations/reconciliation", { preHandler: [authenticateRequest] }, reconcileHandler);

  // 3. Get Reconciliation Audit Logs
  const logsHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Only workspace OWNER or ADMIN roles can view reconciliation logs.",
        statusCode: 403,
      });
    }

    const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50;
    const logs = await reconciliationService.getReconciliationLogs(authUser.workspaceId, limit);
    return { logs };
  };

  server.get("/operations/reconciliation-logs", { preHandler: [authenticateRequest] }, logsHandler);
  server.get("/operations/reconciliation/logs", { preHandler: [authenticateRequest] }, logsHandler);
}
