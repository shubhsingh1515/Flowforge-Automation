import { prisma } from "@flowforge/database";
import {
  RequestDataExportInput,
  RequestWorkspaceDeletionInput,
  UpdateRetentionPolicyInput,
} from "@flowforge/shared";
import { entitlementService } from "./entitlements.js";

export class DataRetentionService {
  /**
   * Retrieves or initializes the retention policy for a workspace.
   */
  async getRetentionPolicy(workspaceId: string) {
    let policy = await prisma.workspaceRetentionPolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = await prisma.workspaceRetentionPolicy.create({
        data: {
          workspaceId,
          executionRetentionDays: 30,
          webhookDeliveryRetentionDays: 14,
          auditLogRetentionDays: 90,
        },
      });
    }

    return policy;
  }

  /**
   * Updates retention periods for a workspace. Enforces plan-based maximum retention windows.
   */
  async updateRetentionPolicy(
    workspaceId: string,
    userId: string,
    userRole: string,
    input: UpdateRetentionPolicyInput
  ) {
    if (userRole !== "ADMIN" && userRole !== "OWNER") {
      const error: any = new Error("Only workspace Administrators or Owners can modify data retention policies.");
      error.statusCode = 403;
      throw error;
    }

    const { plan } = await entitlementService.getEffectivePlan(workspaceId);
    const maxAllowedAudit = plan.maxAuditRetentionDays ?? 30;

    if (input.auditLogRetentionDays && input.auditLogRetentionDays > maxAllowedAudit) {
      const error: any = new Error(
        `Audit log retention of ${input.auditLogRetentionDays} days exceeds your ${plan.name} plan maximum of ${maxAllowedAudit} days. Please upgrade to Business for 365-day retention.`
      );
      error.statusCode = 403;
      throw error;
    }

    const current = await this.getRetentionPolicy(workspaceId);

    const updated = await prisma.workspaceRetentionPolicy.update({
      where: { workspaceId },
      data: {
        executionRetentionDays: input.executionRetentionDays ?? current.executionRetentionDays,
        webhookDeliveryRetentionDays: input.webhookDeliveryRetentionDays ?? current.webhookDeliveryRetentionDays,
        auditLogRetentionDays: input.auditLogRetentionDays ?? current.auditLogRetentionDays,
      },
    });

    // Record audit event
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "RETENTION_POLICY_UPDATED",
        targetType: "WORKSPACE_RETENTION_POLICY",
        targetId: updated.id,
        metadata: input,
      },
    });

    return updated;
  }

  /**
   * Bounded background cleanup job for expired executions, webhook deliveries, and audit logs.
   * Safe: never deletes workflow definitions, users, or active configurations.
   */
  async cleanupExpiredData(workspaceId?: string) {
    const workspaces = workspaceId
      ? [{ id: workspaceId }]
      : await prisma.workspace.findMany({ select: { id: true } });

    let totalExecutionsCleaned = 0;
    let totalDeliveriesCleaned = 0;
    let totalAuditCleaned = 0;

    for (const ws of workspaces) {
      const policy = await this.getRetentionPolicy(ws.id);

      const execCutoff = new Date(Date.now() - policy.executionRetentionDays * 86400000);
      const deliveryCutoff = new Date(Date.now() - policy.webhookDeliveryRetentionDays * 86400000);
      const auditCutoff = new Date(Date.now() - policy.auditLogRetentionDays * 86400000);

      // Clean executions older than cutoff
      const execResult = await prisma.workflowExecution.deleteMany({
        where: {
          workflow: { workspaceId: ws.id },
          createdAt: { lt: execCutoff },
          status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
        },
      });
      totalExecutionsCleaned += execResult.count;

      // Clean webhook deliveries
      const delivResult = await prisma.webhookDelivery.deleteMany({
        where: {
          workspaceId: ws.id,
          createdAt: { lt: deliveryCutoff },
        },
      });
      totalDeliveriesCleaned += delivResult.count;

      // Clean audit logs
      const auditResult = await prisma.workspaceAuditLog.deleteMany({
        where: {
          workspaceId: ws.id,
          createdAt: { lt: auditCutoff },
        },
      });
      totalAuditCleaned += auditResult.count;
    }

    return {
      workspacesProcessed: workspaces.length,
      executionsCleaned: totalExecutionsCleaned,
      deliveriesCleaned: totalDeliveriesCleaned,
      auditLogsCleaned: totalAuditCleaned,
    };
  }

  /**
   * Requests a portable GDPR/CCPA workspace data export. Excludes all secrets and passwords.
   */
  async requestDataExport(
    workspaceId: string,
    userId: string,
    input: RequestDataExportInput
  ) {
    // 1. Check plan quota for data exports
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const exportsThisMonth = await prisma.dataExportRequest.count({
      where: {
        workspaceId,
        createdAt: { gte: currentMonthStart },
      },
    });

    const { plan } = await entitlementService.getEffectivePlan(workspaceId);
    const limit = plan.maxDataExportsPerMonth ?? 5;

    if (exportsThisMonth >= limit) {
      const error: any = new Error(
        `Monthly data export limit of ${limit} reached for your ${plan.name} plan. Please try again next billing cycle or upgrade.`
      );
      error.statusCode = 403;
      throw error;
    }

    // 2. Fetch exportable tenant data with zero plaintext credentials
    const [workspace, workflows, connectedAccounts, templates, auditLogs] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      prisma.workflow.findMany({
        where: { workspaceId },
        include: { versions: true },
      }),
      prisma.connectedAccount.findMany({
        where: { workspaceId },
        select: {
          id: true,
          integrationKey: true,
          name: true,
          status: true,
          scopes: true,
          createdAt: true,
          // CRITICAL: NEVER include credentials, token, or apiKey in export!
        },
      }),
      prisma.workflowTemplate.findMany({
        where: { workspaceId },
      }),
      prisma.workspaceAuditLog.findMany({
        where: { workspaceId },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const exportPayload = {
      formatVersion: "flowforge-export-v1",
      exportedAt: new Date().toISOString(),
      workspace,
      workflows,
      connectedAccounts,
      templates,
      auditLogs,
    };

    const payloadString = JSON.stringify(exportPayload, null, 2);
    const fileSizeBytes = Buffer.byteLength(payloadString, "utf8");
    const recordCount = workflows.length + connectedAccounts.length + templates.length + auditLogs.length;

    const exportRequest = await prisma.dataExportRequest.create({
      data: {
        workspaceId,
        requestedById: userId,
        status: "COMPLETED",
        downloadUrl: `/api/v1/data-retention/exports/${workspaceId}/download`,
        fileSizeBytes,
        recordCount,
        expiresAt: new Date(Date.now() + 86400000 * 7), // 7-day download expiry
        completedAt: new Date(),
      },
    });

    // Record audit event
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "DATA_EXPORT_REQUESTED",
        targetType: "DATA_EXPORT_REQUEST",
        targetId: exportRequest.id,
        metadata: { recordCount, fileSizeBytes },
      },
    });

    return {
      exportId: exportRequest.id,
      status: exportRequest.status,
      downloadUrl: exportRequest.downloadUrl,
      recordCount,
      fileSizeBytes,
      expiresAt: exportRequest.expiresAt,
      sampleBundle: exportPayload,
    };
  }

  /**
   * Initiates deliberate workspace deprovisioning and deletion request.
   */
  async requestWorkspaceDeletion(
    workspaceId: string,
    userId: string,
    userRole: string,
    input: RequestWorkspaceDeletionInput
  ) {
    if (userRole !== "OWNER") {
      const error: any = new Error("Only the workspace Owner can request workspace deletion.");
      error.statusCode = 403;
      throw error;
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      const error: any = new Error("Workspace not found.");
      error.statusCode = 404;
      throw error;
    }

    // Confirmation phrase must match workspace name
    if (input.confirmationPhrase.trim().toLowerCase() !== workspace.name.trim().toLowerCase()) {
      const error: any = new Error(
        `Confirmation phrase does not match workspace name. Please enter '${workspace.name}' exactly.`
      );
      error.statusCode = 400;
      throw error;
    }

    const scheduledDate = new Date(Date.now() + 86400000 * 14); // 14-day grace period

    const request = await prisma.workspaceDeletionRequest.create({
      data: {
        workspaceId,
        requestedById: userId,
        status: "CONFIRMED",
        reason: input.reason,
        confirmationToken: `del_token_${Math.random().toString(36).substring(2, 12)}`,
        scheduledDeletionAt: scheduledDate,
        confirmedAt: new Date(),
      },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "OWNER",
        action: "WORKSPACE_DELETION_REQUESTED",
        targetType: "WORKSPACE_DELETION_REQUEST",
        targetId: request.id,
        metadata: {
          scheduledDeletionAt: scheduledDate.toISOString(),
          reason: input.reason,
        },
      },
    });

    return {
      status: "CONFIRMED",
      scheduledDeletionAt: scheduledDate,
      message: `Workspace deletion confirmed. All resources are scheduled for permanent removal on ${scheduledDate.toLocaleDateString()}. You may cancel this request prior to that date by contacting support.`,
    };
  }
}

export const dataRetentionService = new DataRetentionService();
