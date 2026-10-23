import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ScimUserSchema } from "@flowforge/shared";
import { scimService } from "../services/scim.js";
import { authenticateRequest } from "../plugins/auth.js";

async function authenticateScim(request: FastifyRequest, reply: FastifyReply): Promise<{ workspaceId: string } | void> {
  const authHeader = request.headers.authorization;
  const auth = await scimService.authenticateScimRequest(authHeader);

  if (!auth) {
    return reply.status(401).send({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "401",
      scimType: "invalidCredentials",
      detail: "Invalid or expired SCIM Bearer token.",
    });
  }

  (request as any).scimWorkspaceId = auth.workspaceId;
  return auth;
}

export async function scimRoutes(server: FastifyInstance) {
  // ==========================================
  // SCIM 2.0 PROTOCOL ENDPOINTS
  // ==========================================

  // 1. List Users
  server.get<{ Querystring: { startIndex?: string; count?: string; filter?: string } }>(
    "/scim/v2/Users",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 list provisioned users",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        const startIndex = request.query.startIndex ? parseInt(request.query.startIndex, 10) : 1;
        const count = request.query.count ? parseInt(request.query.count, 10) : 20;
        const filter = request.query.filter;

        const result = await scimService.listUsers(workspaceId, { startIndex, count, filter });
        return result;
      },
    }
  );

  // 2. Get User
  server.get<{ Params: { id: string } }>(
    "/scim/v2/Users/:id",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 get user by ID",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        const user = await scimService.getUser(workspaceId, request.params.id);

        if (!user) {
          return reply.status(404).send({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            status: "404",
            detail: "User not found in this workspace.",
          });
        }

        return user;
      },
    }
  );

  // 3. Create / Provision User
  server.post(
    "/scim/v2/Users",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 provision a new user",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        const parsed = ScimUserSchema.safeParse(request.body);

        if (!parsed.success) {
          return reply.status(400).send({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            status: "400",
            scimType: "invalidValue",
            detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
          });
        }

        const user = await scimService.provisionUser(workspaceId, parsed.data);
        return reply.status(201).send(user);
      },
    }
  );

  // 4. Update User (PUT)
  server.put<{ Params: { id: string } }>(
    "/scim/v2/Users/:id",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 update user attributes",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        const parsed = ScimUserSchema.safeParse(request.body);

        if (!parsed.success) {
          return reply.status(400).send({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
            status: "400",
            scimType: "invalidValue",
            detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
          });
        }

        const user = await scimService.updateUser(workspaceId, request.params.id, parsed.data);
        return user;
      },
    }
  );

  // 5. Update User (PATCH)
  server.patch<{ Params: { id: string }; Body: any }>(
    "/scim/v2/Users/:id",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 patch user attributes",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        const operations = (request.body as any)?.Operations || [];

        const updates: any = {};
        for (const op of operations) {
          if (op.op?.toLowerCase() === "replace" && op.value) {
            if (op.value.active !== undefined) updates.active = Boolean(op.value.active);
            if (op.value.displayName) updates.displayName = op.value.displayName;
          }
        }

        const user = await scimService.updateUser(workspaceId, request.params.id, updates);
        return user;
      },
    }
  );

  // 6. Deactivate User (DELETE)
  server.delete<{ Params: { id: string } }>(
    "/scim/v2/Users/:id",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "SCIM 2.0 deactivate user and revoke active sessions",
      },
      preHandler: [authenticateScim],
      handler: async (request, reply) => {
        const workspaceId = (request as any).scimWorkspaceId;
        await scimService.deactivateUser(workspaceId, request.params.id);
        return reply.status(204).send();
      },
    }
  );

  // ==========================================
  // SCIM TOKEN MANAGEMENT (WORKSPACE ADMIN/OWNER)
  // ==========================================

  // List Tokens
  server.get("/workspaces/current/scim/tokens", {
    schema: {
      tags: ["SCIM 2.0 Provisioning"],
      summary: "List workspace SCIM provisioning tokens",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const tokens = await scimService.listTokens(authUser.workspaceId);
      return { tokens };
    },
  });

  // Create Token
  server.post<{ Body: { name?: string; expiresInDays?: number } }>(
    "/workspaces/current/scim/tokens",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "Generate a new SCIM provisioning bearer token",
      },
      preHandler: [authenticateRequest],
      handler: async (request, reply) => {
        const authUser = request.authUser!;
        if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
          return reply.status(403).send({
            error: "Forbidden",
            message: "Only workspace OWNER or ADMIN roles can create SCIM tokens.",
            statusCode: 403,
          });
        }

        const { name, expiresInDays } = request.body || {};
        const token = await scimService.generateToken(authUser.workspaceId, name, expiresInDays);
        return reply.status(201).send(token);
      },
    }
  );

  // Revoke Token
  server.delete<{ Params: { id: string } }>(
    "/workspaces/current/scim/tokens/:id",
    {
      schema: {
        tags: ["SCIM 2.0 Provisioning"],
        summary: "Revoke a SCIM provisioning token",
      },
      preHandler: [authenticateRequest],
      handler: async (request, reply) => {
        const authUser = request.authUser!;
        if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
          return reply.status(403).send({
            error: "Forbidden",
            message: "Only workspace OWNER or ADMIN roles can revoke SCIM tokens.",
            statusCode: 403,
          });
        }

        await scimService.revokeToken(authUser.workspaceId, request.params.id);
        return { success: true, message: "SCIM token revoked successfully." };
      },
    }
  );
}
