import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { ConfigureSsoSchema, TestSsoSchema } from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { ssoService } from "../services/sso.js";
import { sessionService } from "../services/sessions.js";

export async function ssoRoutes(server: FastifyInstance) {
  // 1. Get workspace SSO configuration (Admin/Owner)
  server.get("/workspaces/current/sso", {
    schema: {
      tags: ["Enterprise Identity"],
      summary: "Get current workspace SSO configuration",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      const config = await ssoService.getProviderConfig(authUser.workspaceId);
      return { sso: config };
    },
  });

  // 2. Configure/update workspace SSO (Admin/Owner)
  server.post("/workspaces/current/sso", {
    schema: {
      tags: ["Enterprise Identity"],
      summary: "Configure or update workspace OIDC SSO Provider",
      body: ConfigureSsoSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace OWNER or ADMIN roles can configure SSO.",
          statusCode: 403,
        });
      }

      const input = ConfigureSsoSchema.parse(request.body);
      const config = await ssoService.saveProviderConfig(authUser.workspaceId, input, authUser.id);
      return { sso: config, message: "SSO configuration saved successfully." };
    },
  });

  // 3. Test SSO provider reachability (Admin/Owner)
  server.post("/workspaces/current/sso/test", {
    schema: {
      tags: ["Enterprise Identity"],
      summary: "Test connectivity to SSO Identity Provider endpoints",
      body: TestSsoSchema,
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;
      if (authUser.workspaceRole !== "OWNER" && authUser.workspaceRole !== "ADMIN") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only workspace OWNER or ADMIN roles can test SSO.",
          statusCode: 403,
        });
      }

      const input = TestSsoSchema.parse(request.body);
      const result = await ssoService.testProviderConnection(authUser.workspaceId, input);
      return result;
    },
  });

  // 4. Public discovery endpoint: Check if workspace enforces SSO by slug
  server.get<{ Params: { slug: string } }>("/sso/workspace/:slug", {
    schema: {
      tags: ["Enterprise Identity"],
      summary: "Public check if workspace has SSO enabled and configured",
    },
    handler: async (request, reply) => {
      const { slug } = request.params;
      const workspace = await prisma.workspace.findUnique({
        where: { slug },
        include: { ssoProvider: true },
      });

      if (!workspace) {
        return reply.status(404).send({ error: "Not Found", message: "Workspace not found" });
      }

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        hasSso: Boolean(workspace.ssoProvider),
        enforceSso: workspace.ssoProvider?.enforceSso || false,
        allowPasswordFallbackForAdmins: workspace.ssoProvider?.allowPasswordFallbackForAdmins ?? true,
      };
    },
  });

  // 5. Initiate SSO Login Flow
  server.post<{ Body: { workspaceSlug?: string; workspaceId?: string; redirectUri: string } }>(
    "/sso/initiate",
    {
      schema: {
        tags: ["Enterprise Identity"],
        summary: "Initiate OIDC SSO login flow and obtain authorization redirect URL",
      },
      handler: async (request, reply) => {
        const { workspaceSlug, workspaceId, redirectUri } = request.body || {};

        let targetWorkspaceId = workspaceId;
        if (!targetWorkspaceId && workspaceSlug) {
          const ws = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
          targetWorkspaceId = ws?.id;
        }

        if (!targetWorkspaceId) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "workspaceId or workspaceSlug is required.",
          });
        }

        const flow = await ssoService.initiateSsoFlow(targetWorkspaceId, redirectUri || "http://localhost:3000/auth/sso/callback");
        return flow;
      },
    }
  );

  // 6. Handle SSO Callback
  server.post<{ Body: { state: string; code: string; mockProfile?: any } }>(
    "/sso/callback",
    {
      schema: {
        tags: ["Enterprise Identity"],
        summary: "Handle OIDC callback, exchange code, link identity, and issue session",
      },
      handler: async (request, reply) => {
        const { state, code, mockProfile } = request.body || {};
        if (!state || (!code && !mockProfile)) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Missing authorization state or code.",
          });
        }

        const result = await ssoService.handleCallback(state, code, mockProfile);

        const token = server.jwt.sign(
          { userId: result.user.id, workspaceId: result.user.workspaceId, email: result.user.email },
          { expiresIn: "7d" }
        );

        // Record session in database for revocation tracking
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sessionService.createSession(result.user.id, token, expiresAt);

        reply.setCookie("flowforge_session", token, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60,
        });

        return {
          token,
          user: result.user,
        };
      },
    }
  );
}
