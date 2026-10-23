import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@flowforge/database";
import { ApiKeyScope } from "@flowforge/shared";
import { apiKeyService } from "../services/apiKeys.js";

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceRole: string;
  isApiKey?: boolean;
  scopes?: string[];
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
    // 1. Try to read token from Authorization header, X-API-Key header, or cookie
    let token: string | undefined;

    const apiKeyHeader = request.headers["x-api-key"];
    const authHeader = request.headers.authorization;

    if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
      token = apiKeyHeader.trim();
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (request.cookies && request.cookies.flowforge_session) {
      token = request.cookies.flowforge_session;
    }

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication token or API key required. Please authenticate.",
        statusCode: 401,
      });
    }

    // 2. Check if token is an API key (starts with ffk_)
    if (token.startsWith("ffk_")) {
      const apiKey = await apiKeyService.verifyKey(token);
      if (!apiKey) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid, expired, or revoked API key.",
          statusCode: 401,
        });
      }

      const authUser: AuthenticatedUser = {
        id: apiKey.id,
        userId: apiKey.id,
        email: `apikey_${apiKey.keyPrefix}@workspace.local`,
        name: apiKey.name,
        workspaceId: apiKey.workspaceId,
        workspaceRole: "MEMBER",
        isApiKey: true,
        scopes: apiKey.scopes,
      };

      request.authUser = authUser;
      return authUser;
    }

    // 3. Otherwise verify session token via fastify jwt
    const decoded = request.server.jwt.verify<{ userId: string; workspaceId: string }>(token);

    // 4. Look up user and active workspace membership
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
      userId: user.id,
      email: user.email,
      name: user.name,
      workspaceId: activeMembership.workspaceId,
      workspaceRole: activeMembership.role,
      isApiKey: false,
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

/**
 * Guard that enforces authentication and required API key scope if caller is an API key.
 */
export function requireScope(scope: ApiKeyScope) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticateRequest(request, reply);
    if (reply.sent) return;

    const authUser = request.authUser;
    if (authUser?.isApiKey) {
      if (!authUser.scopes || !authUser.scopes.includes(scope)) {
        return reply.status(403).send({
          error: "Forbidden",
          message: `API key lacks required scope: ${scope}`,
          statusCode: 403,
          requiredScope: scope,
        });
      }
    }
  };
}
