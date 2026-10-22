import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@flowforge/database";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceRole: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthenticatedUser | void> {
  try {
    // 1. Try to read token from Authorization header or cookie
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (request.cookies && request.cookies.flowforge_session) {
      token = request.cookies.flowforge_session;
    }

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication token required. Please sign in.",
        statusCode: 401,
      });
    }

    // 2. Verify token via fastify jwt
    const decoded = request.server.jwt.verify<{ userId: string; workspaceId: string }>(token);

    // 3. Look up user and active workspace membership
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "User account no longer exists.",
        statusCode: 401,
      });
    }

    // Find the requested or default workspace
    let activeMembership = user.memberships.find(
      (m) => m.workspaceId === decoded.workspaceId
    );

    if (!activeMembership && user.memberships.length > 0) {
      activeMembership = user.memberships[0];
    }

    if (!activeMembership) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "User is not associated with an active workspace.",
        statusCode: 403,
      });
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaceId: activeMembership.workspaceId,
      workspaceRole: activeMembership.role,
    };

    request.authUser = authUser;
    return authUser;
  } catch (err) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Invalid or expired session. Please sign in again.",
      statusCode: 401,
    });
  }
}
