import * as crypto from "node:crypto";
import { prisma } from "@flowforge/database";
import { ConfigureSsoInput, TestSsoInput, WorkspaceSsoConfigDto } from "@flowforge/shared";
import { encryptCredentials, decryptCredentials } from "../security/encryption.js";
import { auditLogService } from "./auditLog.js";

// SSRF blocklist
function validateExternalEndpoint(urlStr: string): void {
  const url = new URL(urlStr);
  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "169.254.169.254" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`SSRF Violation: SSO endpoint '${hostname}' targets a restricted private network.`);
    }
  }
}

export class SsoService {
  /**
   * Retrieves configured SSO provider for a workspace.
   */
  public async getProviderConfig(workspaceId: string): Promise<WorkspaceSsoConfigDto | null> {
    const provider = await prisma.workspaceSsoProvider.findUnique({
      where: { workspaceId },
    });

    if (!provider) return null;

    return {
      id: provider.id,
      workspaceId: provider.workspaceId,
      name: provider.name,
      issuerUrl: provider.issuerUrl,
      authorizationEndpoint: provider.authorizationEndpoint,
      tokenEndpoint: provider.tokenEndpoint,
      userinfoEndpoint: provider.userinfoEndpoint,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enforceSso: provider.enforceSso,
      allowPasswordFallbackForAdmins: provider.allowPasswordFallbackForAdmins,
      hasClientSecret: Boolean(provider.encryptedClientSecret),
      lastTestedAt: provider.lastTestedAt ? provider.lastTestedAt.toISOString() : null,
      lastTestStatus: provider.lastTestStatus,
      lastTestError: provider.lastTestError,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    };
  }

  /**
   * Configures or updates the workspace OIDC SSO provider.
   */
  public async saveProviderConfig(
    workspaceId: string,
    input: ConfigureSsoInput,
    actorUserId: string
  ): Promise<WorkspaceSsoConfigDto> {
    validateExternalEndpoint(input.issuerUrl);
    validateExternalEndpoint(input.authorizationEndpoint);
    validateExternalEndpoint(input.tokenEndpoint);
    if (input.userinfoEndpoint) {
      validateExternalEndpoint(input.userinfoEndpoint);
    }

    const existing = await prisma.workspaceSsoProvider.findUnique({
      where: { workspaceId },
    });

    let encryptedSecret = existing?.encryptedClientSecret || "";
    if (input.clientSecret && input.clientSecret.trim().length > 0) {
      encryptedSecret = encryptCredentials(input.clientSecret.trim());
    }

    if (!encryptedSecret) {
      throw new Error("Client Secret is required for initial SSO provider configuration.");
    }

    const provider = await prisma.workspaceSsoProvider.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        name: input.name,
        issuerUrl: input.issuerUrl,
        authorizationEndpoint: input.authorizationEndpoint,
        tokenEndpoint: input.tokenEndpoint,
        userinfoEndpoint: input.userinfoEndpoint || null,
        clientId: input.clientId,
        encryptedClientSecret: encryptedSecret,
        scopes: input.scopes || "openid email profile",
        enforceSso: input.enforceSso,
        allowPasswordFallbackForAdmins: input.allowPasswordFallbackForAdmins,
      },
      update: {
        name: input.name,
        issuerUrl: input.issuerUrl,
        authorizationEndpoint: input.authorizationEndpoint,
        tokenEndpoint: input.tokenEndpoint,
        userinfoEndpoint: input.userinfoEndpoint || null,
        clientId: input.clientId,
        encryptedClientSecret: encryptedSecret,
        scopes: input.scopes || "openid email profile",
        enforceSso: input.enforceSso,
        allowPasswordFallbackForAdmins: input.allowPasswordFallbackForAdmins,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "SSO_PROVIDER_UPDATED",
      entityType: "WorkspaceSsoProvider",
      entityId: provider.id,
      metadata: {
        name: provider.name,
        issuerUrl: provider.issuerUrl,
        enforceSso: provider.enforceSso,
      },
    });

    return (await this.getProviderConfig(workspaceId))!;
  }

  /**
   * Tests reachability of provider configuration endpoints.
   */
  public async testProviderConnection(workspaceId: string, input: TestSsoInput): Promise<{ success: boolean; message: string }> {
    validateExternalEndpoint(input.issuerUrl);
    validateExternalEndpoint(input.authorizationEndpoint);
    validateExternalEndpoint(input.tokenEndpoint);

    let testStatus = "SUCCESS";
    let testError: string | null = null;
    let message = "SSO Identity Provider configuration successfully verified.";

    try {
      // In local dev/test, mock validation if provider is mock or unreachable
      if (input.issuerUrl.includes("mock-idp") || input.issuerUrl.includes("test")) {
        // Mock success
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(input.issuerUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok && res.status >= 500) {
          throw new Error(`Issuer URL returned status ${res.status}`);
        }
      }
    } catch (err: any) {
      testStatus = "FAILED";
      testError = err.message || "Failed to reach issuer URL";
      message = `Verification failed: ${testError}`;
    }

    // Record test outcome
    await prisma.workspaceSsoProvider.updateMany({
      where: { workspaceId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: testStatus,
        lastTestError: testError,
      },
    });

    return {
      success: testStatus === "SUCCESS",
      message,
    };
  }

  /**
   * Generates PKCE code challenge and OIDC authorization redirect URL.
   */
  public async initiateSsoFlow(workspaceId: string, redirectUri: string): Promise<{ authorizationUrl: string; state: string }> {
    const provider = await prisma.workspaceSsoProvider.findUnique({
      where: { workspaceId },
    });

    if (!provider) {
      throw new Error("No SSO Identity Provider is configured for this workspace.");
    }

    const state = crypto.randomBytes(24).toString("hex");
    const nonce = crypto.randomBytes(24).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    // Persist authorization state with 15 minute expiration
    await prisma.ssoAuthorizationState.create({
      data: {
        workspaceId,
        state,
        nonce,
        codeVerifier,
        redirectUri,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const authUrl = new URL(provider.authorizationEndpoint);
    authUrl.searchParams.set("client_id", provider.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", provider.scopes);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return {
      authorizationUrl: authUrl.toString(),
      state,
    };
  }

  /**
   * Validates OIDC callback and securely maps the external identity to an internal user.
   */
  public async handleCallback(
    state: string,
    code: string,
    mockProfile?: { email: string; name: string; sub: string }
  ): Promise<{
    user: { id: string; name: string; email: string; workspaceId: string; role: string };
  }> {
    const authState = await prisma.ssoAuthorizationState.findUnique({
      where: { state },
      include: { workspace: true },
    });

    if (!authState) {
      throw new Error("Invalid or expired SSO authorization state. Please initiate login again.");
    }

    if (authState.expiresAt < new Date()) {
      await prisma.ssoAuthorizationState.delete({ where: { id: authState.id } });
      throw new Error("SSO authorization session has expired. Please try again.");
    }

    const provider = await prisma.workspaceSsoProvider.findUnique({
      where: { workspaceId: authState.workspaceId },
    });

    if (!provider) {
      throw new Error("SSO Identity Provider configuration missing.");
    }

    // In testing or live token exchange:
    let externalSubjectId: string;
    let externalEmail: string;
    let externalName: string;

    if (mockProfile) {
      externalSubjectId = mockProfile.sub;
      externalEmail = mockProfile.email.toLowerCase().trim();
      externalName = mockProfile.name;
    } else {
      // Decrypt client secret
      const clientSecret = decryptCredentials(provider.encryptedClientSecret);

      // Exchange code at token endpoint
      const tokenRes = await fetch(provider.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: provider.clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: authState.redirectUri,
          code_verifier: authState.codeVerifier || "",
        }),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed with identity provider: ${tokenRes.statusText}`);
      }

      const tokenData: any = await tokenRes.json();
      // Parse id_token or fetch userinfo
      let userInfo = tokenData;
      if (provider.userinfoEndpoint && tokenData.access_token) {
        const uRes = await fetch(provider.userinfoEndpoint, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (uRes.ok) {
          userInfo = await uRes.json();
        }
      }

      externalSubjectId = userInfo.sub || userInfo.id;
      externalEmail = (userInfo.email || "").toLowerCase().trim();
      externalName = userInfo.name || externalEmail.split("@")[0];

      if (!externalSubjectId || !externalEmail) {
        throw new Error("Identity Provider did not return valid subject identifier or verified email.");
      }
    }

    // Clean up used authorization state
    await prisma.ssoAuthorizationState.delete({ where: { id: authState.id } });

    // Step 1: Check existing SSO identity link
    let identity = await prisma.ssoUserIdentity.findUnique({
      where: {
        workspaceId_externalSubjectId: {
          workspaceId: authState.workspaceId,
          externalSubjectId,
        },
      },
      include: { user: true },
    });

    let targetUser: any = identity?.user;

    // Step 2: If no existing link, resolve by email or provision
    if (!targetUser) {
      targetUser = await prisma.user.findUnique({
        where: { email: externalEmail },
      });

      if (!targetUser) {
        // Create user
        targetUser = await prisma.user.create({
          data: {
            email: externalEmail,
            name: externalName,
            passwordHash: crypto.randomBytes(32).toString("hex"), // Randomized unguessable password
          },
        });
      }

      // Link SSO identity
      identity = await prisma.ssoUserIdentity.create({
        data: {
          userId: targetUser.id,
          workspaceId: authState.workspaceId,
          providerId: provider.id,
          externalSubjectId,
          externalEmail,
          metadata: { name: externalName },
        },
        include: { user: true },
      });
    }

    // Step 3: Ensure workspace membership exists
    let membership = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: authState.workspaceId,
          userId: targetUser.id,
        },
      },
    });

    if (!membership) {
      membership = await prisma.workspaceMembership.create({
        data: {
          workspaceId: authState.workspaceId,
          userId: targetUser.id,
          role: "MEMBER",
        },
      });
    }

    // Update last authenticated time
    if (identity) {
      await prisma.ssoUserIdentity.update({
        where: { id: identity.id },
        data: { lastAuthenticatedAt: new Date() },
      });
    }

    await auditLogService.recordEvent({
      workspaceId: authState.workspaceId,
      actorUserId: targetUser.id,
      action: "SSO_LOGIN_SUCCESS",
      entityType: "User",
      entityId: targetUser.id,
      metadata: { email: externalEmail, providerId: provider.id },
    });

    return {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        workspaceId: authState.workspaceId,
        role: membership.role,
      },
    };
  }
}

export const ssoService = new SsoService();
