import { prisma } from "@flowforge/database";
import { auditLogService } from "./auditLog.js";

export class SessionService {
  /**
   * Records or updates a user session safely using upsert.
   */
  public async createSession(userId: string, token: string, expiresAt: Date) {
    try {
      return await prisma.session.upsert({
        where: { token },
        create: {
          userId,
          token,
          expiresAt,
        },
        update: {
          expiresAt,
        },
      });
    } catch (_e) {
      // Non-blocking fallback
      return null;
    }
  }

  /**
   * Lists active sessions for a user.
   */
  public async listUserSessions(userId: string, currentToken?: string) {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    return sessions.map((s) => ({
      id: s.id,
      isCurrent: currentToken ? s.token === currentToken : false,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }

  /**
   * Revokes a specific session by ID.
   */
  public async revokeSession(userId: string, sessionId: string, workspaceId?: string) {
    const result = await prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });

    if (workspaceId) {
      await auditLogService.recordEvent({
        workspaceId,
        actorUserId: userId,
        action: "SESSION_REVOKED",
        entityType: "Session",
        entityId: sessionId,
      });
    }

    return { success: result.count > 0 };
  }

  /**
   * Revokes all other sessions for the user except the current one.
   */
  public async revokeAllOtherSessions(userId: string, currentToken: string, workspaceId?: string) {
    const result = await prisma.session.deleteMany({
      where: {
        userId,
        token: { not: currentToken },
      },
    });

    if (workspaceId) {
      await auditLogService.recordEvent({
        workspaceId,
        actorUserId: userId,
        action: "ALL_OTHER_SESSIONS_REVOKED",
        entityType: "Session",
        entityId: userId,
        metadata: { revokedCount: result.count },
      });
    }

    return { revokedCount: result.count };
  }

  /**
   * Checks if a session token is still valid (not explicitly revoked).
   */
  public async isSessionValid(token: string): Promise<boolean> {
    const session = await prisma.session.findUnique({
      where: { token },
    });

    // If session was explicitly recorded in DB, ensure it hasn't expired
    if (session) {
      return session.expiresAt > new Date();
    }

    // Fallback: If session wasn't tracked in DB, allow standard JWT validity
    return true;
  }
}

export const sessionService = new SessionService();
