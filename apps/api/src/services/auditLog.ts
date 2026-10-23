import { prisma } from "@flowforge/database";

export interface RecordAuditEventInput {
  workspaceId: string;
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: any;
}

export const auditLogService = {
  async recordEvent(input: RecordAuditEventInput) {
    try {
      return await prisma.workspaceAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.actorUserId || "system",
          actorType: input.actorUserId ? "USER" : "SYSTEM",
          action: input.action,
          targetType: input.targetType || input.entityType || "SYSTEM",
          targetId: input.targetId || input.entityId || "system",
          metadata: input.metadata || {},
        },
      });
    } catch (_e) {
      return null;
    }
  },
};
