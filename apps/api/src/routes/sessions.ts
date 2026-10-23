import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import { sessionService } from "../services/sessions.js";

export async function sessionRoutes(server: FastifyInstance) {
  const listHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    const token =
      request.cookies?.flowforge_session ||
      (request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.substring(7).trim()
        : undefined);

    const sessions = await sessionService.listUserSessions(authUser.id, token);
    return { sessions };
  };

  const revokeHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    const result = await sessionService.revokeSession(authUser.id, request.params.id, authUser.workspaceId);

    if (!result.success) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Session not found or already revoked.",
      });
    }

    return { success: true, message: "Session revoked successfully." };
  };

  const revokeAllOthersHandler = async (request: any, reply: any) => {
    const authUser = request.authUser!;
    const token =
      request.cookies?.flowforge_session ||
      (request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.substring(7).trim()
        : "");

    const result = await sessionService.revokeAllOtherSessions(authUser.id, token, authUser.workspaceId);
    return { success: true, revokedCount: result.revokedCount, message: `Revoked ${result.revokedCount} other active sessions.` };
  };

  // Support both /auth/sessions and /sessions
  server.get("/auth/sessions", { preHandler: [authenticateRequest] }, listHandler);
  server.get("/sessions", { preHandler: [authenticateRequest] }, listHandler);

  server.delete<{ Params: { id: string } }>("/auth/sessions/:id", { preHandler: [authenticateRequest] }, revokeHandler);
  server.delete<{ Params: { id: string } }>("/sessions/:id", { preHandler: [authenticateRequest] }, revokeHandler);

  server.delete("/auth/sessions", { preHandler: [authenticateRequest] }, revokeAllOthersHandler);
  server.delete("/sessions", { preHandler: [authenticateRequest] }, revokeAllOthersHandler);
  server.post("/sessions/revoke-others", { preHandler: [authenticateRequest] }, revokeAllOthersHandler);
  server.post("/auth/sessions/revoke-others", { preHandler: [authenticateRequest] }, revokeAllOthersHandler);
}
