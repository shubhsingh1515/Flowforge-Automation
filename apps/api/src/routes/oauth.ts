import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { z } from "zod";
import { authenticateRequest } from "../plugins/auth.js";
import { integrationRegistry } from "../integrations/registry.js";
import { createOAuthState, consumeOAuthState } from "../security/oauth-state.js";
import { encryptCredentials } from "../security/encryption.js";

export async function oauthRoutes(server: FastifyInstance) {
  // 1. Initiate OAuth Authorization
  server.get("/oauth/:provider/authorize", {
    schema: {
      tags: ["OAuth"],
      summary: "Initiate OAuth 2.0 authorization for a provider",
      params: z.object({ provider: z.string() }),
      querystring: z.object({
        redirectUri: z.string().optional(),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { provider: providerKey } = request.params as { provider: string };
      const { workspaceId, id: userId } = request.authUser!;

      const provider = integrationRegistry.getProvider(providerKey);
      if (!provider || !provider.getAuthorizationUrl) {
        return reply.status(404).send({
          error: "Not Found",
          message: `OAuth authorization is not available for provider '${providerKey}'.`,
        });
      }

      // Default callback URL to our backend endpoint
      const host = request.headers.host || "localhost:4000";
      const protocol = request.protocol || "http";
      const callbackUri = `${protocol}://${host}/api/v1/oauth/${providerKey}/callback`;

      const oauthState = await createOAuthState({
        provider: providerKey,
        workspaceId,
        userId,
        redirectUri: callbackUri,
        usePkce: providerKey.startsWith("google"),
      });

      const authorizationUrl = provider.getAuthorizationUrl({
        state: oauthState.stateToken,
        redirectUri: callbackUri,
        codeChallenge: oauthState.codeChallenge,
      });

      return {
        authorizationUrl,
        state: oauthState.stateToken,
      };
    },
  });

  // 2. OAuth Callback
  server.get("/oauth/:provider/callback", {
    schema: {
      tags: ["OAuth"],
      summary: "Handle incoming OAuth 2.0 callback from external provider",
      params: z.object({ provider: z.string() }),
      querystring: z.object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      const { provider: providerKey } = request.params as { provider: string };
      const { code, state, error, error_description } = request.query as {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };

      const frontendHost = process.env.FRONTEND_URL || "http://localhost:3000";

      // If user denied or provider returned error
      if (error) {
        server.log.warn({ msg: "OAuth provider returned error", provider: providerKey, error, error_description });
        return reply.redirect(`${frontendHost}/connections?error=${encodeURIComponent(error_description || error)}`);
      }

      if (!code || !state) {
        return reply.redirect(`${frontendHost}/connections?error=${encodeURIComponent("Missing authorization code or state token.")}`);
      }

      let stateRecord;
      try {
        stateRecord = await consumeOAuthState(state, providerKey);
      } catch (err: any) {
        return reply.redirect(`${frontendHost}/connections?error=${encodeURIComponent(err.message)}`);
      }

      const provider = integrationRegistry.getProvider(providerKey);
      if (!provider || !provider.exchangeCode) {
        return reply.redirect(`${frontendHost}/connections?error=${encodeURIComponent("Provider handler not found.")}`);
      }

      try {
        const exchanged = await provider.exchangeCode({
          code,
          redirectUri: stateRecord.redirectUri || "",
          codeVerifier: stateRecord.codeVerifier || undefined,
        });

        // Encrypt credentials at rest using AES-256-GCM
        const encryptedCredentials = encryptCredentials(exchanged.credentials);
        const scopes = exchanged.credentials.scope ? exchanged.credentials.scope.split(/[\s,]+/) : [];

        // Upsert ConnectedAccount
        await prisma.connectedAccount.create({
          data: {
            workspaceId: stateRecord.workspaceId,
            integrationKey: providerKey,
            name: exchanged.accountName,
            credentials: encryptedCredentials as any,
            metadata: exchanged.metadata || {},
            scopes,
            expiresAt: exchanged.expiresAt || null,
            status: "ACTIVE",
            lastVerifiedAt: new Date(),
          },
        });

        return reply.redirect(`${frontendHost}/connections?connected=true&provider=${providerKey}`);
      } catch (err: any) {
        server.log.error({ msg: "Failed to exchange OAuth code", provider: providerKey, error: err.message });
        return reply.redirect(`${frontendHost}/connections?error=${encodeURIComponent(err.message)}`);
      }
    },
  });

  // 3. Quick Simulated Connect (For Automated Testing & Development)
  server.post("/oauth/dev-connect", {
    schema: {
      tags: ["OAuth"],
      summary: "Create a simulated third-party connection for automated testing or development",
      body: z.object({
        provider: z.string(),
        name: z.string().optional(),
      }),
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const { provider: providerKey, name } = request.body as { provider: string; name?: string };
      const { workspaceId } = request.authUser!;

      const provider = integrationRegistry.getProvider(providerKey);
      if (!provider) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Unknown provider '${providerKey}'.`,
        });
      }

      // Generate simulated mock credentials
      let credentials: any;
      let accountName = name || `${provider.name} (Simulated Test Account)`;
      let metadata: any = {};

      if (providerKey === "slack") {
        credentials = {
          accessToken: `xoxb-mock-${Date.now()}`,
          teamId: "T_MOCK",
          teamName: "FlowForge Dev Team",
          botUserId: "U_BOT_DEV",
          scope: "chat:write,channels:read",
        };
        metadata = { teamName: "FlowForge Dev Team" };
      } else {
        credentials = {
          accessToken: `ya29.mock-${Date.now()}`,
          refreshToken: `1//mock-refresh-${Date.now()}`,
          userEmail: "tester@flowforge.dev",
          userName: "Test User",
          scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly",
        };
        metadata = { email: "tester@flowforge.dev" };
      }

      const encrypted = encryptCredentials(credentials);

      const connection = await prisma.connectedAccount.create({
        data: {
          workspaceId,
          integrationKey: providerKey,
          name: accountName,
          credentials: encrypted as any,
          metadata,
          scopes: credentials.scope.split(/[\s,]+/),
          expiresAt: new Date(Date.now() + 3600 * 1000),
          status: "ACTIVE",
          lastVerifiedAt: new Date(),
        },
      });

      return reply.status(201).send({
        connection: {
          id: connection.id,
          workspaceId: connection.workspaceId,
          integrationKey: connection.integrationKey,
          name: connection.name,
          status: connection.status,
          metadata: connection.metadata,
          lastVerifiedAt: connection.lastVerifiedAt,
          createdAt: connection.createdAt,
        },
      });
    },
  });
}
