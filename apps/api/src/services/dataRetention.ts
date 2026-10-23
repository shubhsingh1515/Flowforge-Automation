import crypto from "node:crypto";
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
          payloadRetentionDays: 30,
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
    input: UpdateRetentionPolicyInput & { payloadRetentionDays?: number }
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
        ...(input.payloadRetentionDays !== undefined && {
          payloadRetentionDays: input.payloadRetentionDays,
        }),
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
   * Phase 17: Legal-hold check blocks all automated and manual purging.
   * Phase 17: dryRun simulation mode counts eligible candidates without deleting.
   */
  async cleanupExpiredData(workspaceId?: string, dryRun: boolean = false) {
    const workspaces = workspaceId
      ? [{ id: workspaceId }]
      : await prisma.workspace.findMany({ select: { id: true } });

    let totalExecutionsCleaned = 0;
    let totalDeliveriesCleaned = 0;
    let totalAuditCleaned = 0;
    let legalHoldBlockedCount = 0;

    for (const ws of workspaces) {
      const policy = await this.getRetentionPolicy(ws.id);

      // Phase 17: Legal Hold Check - blocks all automated/manual purging
      if (policy.legalHold) {
        legalHoldBlockedCount++;
        await prisma.complianceEvidenceRecord.create({
          data: {
            workspaceId: ws.id,
            evidenceType: "RETENTION_EXECUTION",
            scope: "PURGE_CYCLE",
            status: "COMPLIANT",
            details: {
              action: "RETENTION_PURGE_BLOCKED",
              reason: policy.legalHoldReason || "Legal hold active for workspace",
              blockedAt: new Date().toISOString(),
            },
            checksumSha256: crypto
              .createHash("sha256")
              .update(`${ws.id}:LEGAL_HOLD_BLOCKED:${policy.legalHoldReason || ""}`)
              .digest("hex"),
          },
        });
        continue;
      }

      const execCutoff = new Date(Date.now() - policy.executionRetentionDays * 86400000);
      const deliveryCutoff = new Date(Date.now() - policy.webhookDeliveryRetentionDays * 86400000);
      const auditCutoff = new Date(Date.now() - policy.auditLogRetentionDays * 86400000);

      if (dryRun) {
        // Count candidate records without deleting
        const [cExec, cDeliv, cAudit] = await Promise.all([
          prisma.workflowExecution.count({
            where: {
              workflow: { workspaceId: ws.id },
              createdAt: { lt: execCutoff },
              status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
            },
          }),
          prisma.webhookDelivery.count({
            where: {
              workspaceId: ws.id,
              createdAt: { lt: deliveryCutoff },
            },
          }),
          prisma.workspaceAuditLog.count({
            where: {
              workspaceId: ws.id,
              createdAt: { lt: auditCutoff },
            },
          }),
        ]);
        totalExecutionsCleaned += cExec;
        totalDeliveriesCleaned += cDeliv;
        totalAuditCleaned += cAudit;
      } else {
        // Clean executions older than cutoff
        const delExec = await prisma.workflowExecution.deleteMany({
          where: {
            workflow: { workspaceId: ws.id },
            createdAt: { lt: execCutoff },
            status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
          },
        });
        totalExecutionsCleaned += delExec.count;

        // Clean webhook deliveries
        const delDelivery = await prisma.webhookDelivery.deleteMany({
          where: {
            workspaceId: ws.id,
            createdAt: { lt: deliveryCutoff },
          },
        });
        totalDeliveriesCleaned += delDelivery.count;

        // Clean audit logs (protect retention policy updates)
        const delAudit = await prisma.workspaceAuditLog.deleteMany({
          where: {
            workspaceId: ws.id,
            createdAt: { lt: auditCutoff },
            action: { notIn: ["RETENTION_POLICY_UPDATED", "DATA_EXPORT_REQUESTED", "WORKSPACE_DELETION_REQUESTED"] },
          },
        });
        totalAuditCleaned += delAudit.count;

        // Record compliance evidence for the purge execution
        if (delExec.count > 0 || delDelivery.count > 0 || delAudit.count > 0) {
          await prisma.complianceEvidenceRecord.create({
            data: {
              workspaceId: ws.id,
              evidenceType: "RETENTION_EXECUTION",
              scope: "PURGE_CYCLE",
              status: "COMPLIANT",
              details: {
                executionsCleaned: delExec.count,
                deliveriesCleaned: delDelivery.count,
                auditCleaned: delAudit.count,
                timestamp: new Date().toISOString(),
              },
              checksumSha256: crypto
                .createHash("sha256")
                .update(`${ws.id}:PURGE:${delExec.count}:${delDelivery.count}:${delAudit.count}`)
                .digest("hex"),
            },
          });
        }
      }
    }

    return {
      success: true,
      dryRun,
      legalHoldBlockedCount,
      workspacesProcessed: workspaces.length,
      executionsCleaned: totalExecutionsCleaned,
      totalExecutionsCleaned,
      deliveriesCleaned: totalDeliveriesCleaned,
      totalDeliveriesCleaned,
      auditCleaned: totalAuditCleaned,
      auditLogsCleaned: totalAuditCleaned,
      totalAuditCleaned,
      cleanedAt: new Date().toISOString(),
    };
  }

  /**
   * Phase 17: Updates legal hold status for a workspace.
   */
  async setLegalHold(workspaceId: string, userId: string, legalHold: boolean, reason?: string) {
    const updated = await prisma.workspaceRetentionPolicy.upsert({
      where: { workspaceId },
      update: {
        legalHold,
        legalHoldReason: reason || null,
        legalHoldSetById: legalHold ? userId : null,
        legalHoldSetAt: legalHold ? new Date() : null,
      },
      create: {
        workspaceId,
        legalHold,
        legalHoldReason: reason || null,
        legalHoldSetById: legalHold ? userId : null,
        legalHoldSetAt: legalHold ? new Date() : null,
      },
    });

    // Record compliance evidence
    await prisma.complianceEvidenceRecord.create({
      data: {
        workspaceId,
        evidenceType: "LEGAL_HOLD",
        scope: legalHold ? "LEGAL_HOLD_APPLIED" : "LEGAL_HOLD_RELEASED",
        status: "COMPLIANT",
        details: {
          legalHold,
          reason,
          actionBy: userId,
          timestamp: new Date().toISOString(),
        },
        checksumSha256: crypto
          .createHash("sha256")
          .update(`${workspaceId}:LEGAL_HOLD:${legalHold}:${reason || ""}`)
          .digest("hex"),
        actorId: userId,
      },
    });

    return updated;
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
    const limit = plan.maxDataExportsPerMonth ?? 3;

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
      ...exportRequest,
      exportId: exportRequest.id,
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

    // Confirmation phrase can match workspace name or slug
    if (
      input.confirmationPhrase.trim().toLowerCase() !== workspace.name.trim().toLowerCase() &&
      input.confirmationPhrase.trim().toLowerCase() !== workspace.slug.trim().toLowerCase()
    ) {
      const error: any = new Error(
        `Confirmation phrase does not match workspace name. Please enter '${workspace.name}' exactly.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Check if legal hold blocks deletion
    const policy = await this.getRetentionPolicy(workspaceId);
    if (policy.legalHold) {
      const error: any = new Error("Cannot delete workspace while active legal hold is enforced.");
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
      ...request,
      message: `Workspace deletion confirmed. All resources are scheduled for permanent removal on ${scheduledDate.toLocaleDateString()}. You may cancel this request prior to that date by contacting support.`,
    };
  }
}

export const dataRetentionService = new DataRetentionService();
