import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { authenticateRequest } from "../plugins/auth.js";
import { operationsService } from "../services/operations.js";
import { reconciliationService } from "../services/reconciliation.js";
import { outboxService } from "../services/outboxService.js";
import { disasterRecoveryService } from "../services/disasterRecoveryService.js";
import { capacityService } from "../services/capacityService.js";
import { regionService } from "../services/regionService.js";

export async function operationsRoutes(server: FastifyInstance) {
  // Helper to check admin/owner privilege
  const requireAdmin = (request: any, reply: any): boolean => {
    const authUser = request.authUser;
    if (!authUser || (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN")) {
      reply.status(403).send({
        error: "Forbidden",
        message: "Only workspace OWNER or ADMIN roles can access operational reliability endpoints.",
        statusCode: 403,
      });
      return false;
    }
    return true;
  };

  // 1. Get Live Operational Overview & Active Alerts (Admin/Owner)
  const overviewHandler = async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    const authUser = request.authUser!;
    const overview = await operationsService.getOperationalOverview(authUser.workspaceId);
    return { overview, ...overview };
  };

  server.get("/operations/overview", { preHandler: [authenticateRequest] }, overviewHandler);

  // 2. Trigger Execution Reconciliation / Crash Recovery Resumption (Admin/Owner)
  const reconcileHandler = async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    const authUser = request.authUser!;

    const body = request.body || {};
    const mode = body.mode || (body.dryRun === false ? "execute" : "dry-run");
    const maxAgeMinutes = body.maxAgeMinutes || 15;
    const limit = body.limit || 50;
    const allowCrashRecovery = body.allowCrashRecovery !== false;

    const result = await reconciliationService.reconcile({
      workspaceId: authUser.workspaceId,
      mode,
      maxAgeMinutes,
      limit,
      actorUserId: authUser.id,
      allowCrashRecovery,
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
        proposedAction: a.proposedAction,
      })),
    };
  };

  server.post("/operations/reconcile", { preHandler: [authenticateRequest] }, reconcileHandler);
  server.post("/operations/reconciliation", { preHandler: [authenticateRequest] }, reconcileHandler);

  // 3. Get Reconciliation Audit Logs
  const logsHandler = async (request: any, reply: any) => {
    if (!requireAdmin(request, reply)) return;
    const authUser = request.authUser!;
    const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50;
    const logs = await reconciliationService.getReconciliationLogs(authUser.workspaceId, limit);
    return { logs };
  };

  server.get("/operations/reconciliation-logs", { preHandler: [authenticateRequest] }, logsHandler);
  server.get("/operations/reconciliation/logs", { preHandler: [authenticateRequest] }, logsHandler);

  // 4. Transactional Outbox Overview
  server.get(
    "/operations/outbox",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const outbox = await outboxService.getOutboxOverview(authUser.workspaceId);
      return { outbox };
    }
  );

  // 5. Replay Dead-Letter Outbox Events
  server.post(
    "/operations/outbox/replay",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const body = request.body || {};
      const result = await outboxService.replayDeadLetterEvents(authUser.workspaceId, body);
      return { success: true, ...result };
    }
  );

  // 6. Process / Sweep Pending Outbox Events
  server.post(
    "/operations/outbox/process",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const body = request.body || {};
      const result = await outboxService.processPendingEvents(body.limit || 50);
      return { success: true, ...result };
    }
  );

  // 7. Get Backup Verification History
  server.get(
    "/operations/backup/verification",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 20;
      const records = await disasterRecoveryService.listVerificationRecords(limit);
      const drStatus = await disasterRecoveryService.getDisasterRecoveryStatus();
      return { records, drStatus };
    }
  );

  // 8. Trigger Non-Destructive Backup Verification Drill
  server.post(
    "/operations/backup/verify",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const body = request.body || {};
      const record = await disasterRecoveryService.runVerificationDrill(body, authUser.id);
      return { record };
    }
  );

  // 9. Get Recovery Audit Logs
  server.get(
    "/operations/recovery/logs",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50;

      const logs = await prisma.recoveryAuditRecord.findMany({
        where: {
          OR: [{ workspaceId: authUser.workspaceId }, { workspaceId: null }],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return {
        logs: logs.map((l) => ({
          ...l,
          createdAt: l.createdAt.toISOString(),
          startedAt: l.startedAt.toISOString(),
          finishedAt: l.finishedAt ? l.finishedAt.toISOString() : null,
        })),
      };
    }
  );

  // 10. Phase 16: Live Capacity & Predictive Drain-Time Analytics (Admin/Owner)
  server.get(
    "/operations/capacity",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const capacity = await capacityService.getCapacitySummary(authUser.workspaceId);
      return { capacity, ...capacity };
    }
  );

  // 11. Phase 16: Regional Deployments & Placement Status (Admin/Owner)
  server.get(
    "/operations/regions",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const regions = await regionService.listRegions();
      return { regions };
    }
  );

  // 12. Phase 16: Update Workspace Regional Placement Policy (Admin/Owner)
  server.patch(
    "/operations/regions/placement",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const body = request.body || {};
      const updated = await regionService.updateTenantPlacement(authUser.workspaceId, body);
      return { success: true, workspace: updated };
    }
  );

  // 13. Phase 16: Trigger Regional Failover Drill (Admin/Owner)
  server.post(
    "/operations/regions/failover-drill",
    { preHandler: [authenticateRequest] },
    async (request: any, reply: any) => {
      if (!requireAdmin(request, reply)) return;
      const authUser = request.authUser!;
      const body = request.body || {};
      const result = await regionService.executeRegionalFailoverDrill({
        sourceRegion: body.sourceRegion || "us-east-1",
        targetRegion: body.targetRegion || "eu-central-1",
        operatorUserId: authUser.id,
        notes: body.notes,
      });
      return { success: true, drill: result, ...result };
    }
  );
}
