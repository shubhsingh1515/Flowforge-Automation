import crypto from "node:crypto";
import { prisma } from "@flowforge/database";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CreateOAuthStateParams {
  provider: string;
  workspaceId: string;
  userId: string;
  redirectUri?: string;
  metadata?: Record<string, any>;
  usePkce?: boolean;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generates an RFC 7636 compliant PKCE code verifier and SHA-256 code challenge.
 */
export function generatePkcePair(): PkcePair {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * Creates and persists a short-lived OAuth authorization state token.
 */
export async function createOAuthState(params: CreateOAuthStateParams) {
  const stateToken = `ff_${params.provider}_${crypto.randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  let codeVerifier: string | undefined = undefined;
  let codeChallenge: string | undefined = undefined;

  if (params.usePkce) {
    const pkce = generatePkcePair();
    codeVerifier = pkce.codeVerifier;
    codeChallenge = pkce.codeChallenge;
  }

  const record = await prisma.oAuthAuthorizationState.create({
    data: {
      state: stateToken,
      provider: params.provider,
      workspaceId: params.workspaceId,
      userId: params.userId,
      codeVerifier,
      redirectUri: params.redirectUri,
      metadata: params.metadata || {},
      expiresAt,
    },
  });

  return {
    stateToken,
    codeChallenge,
    codeVerifier,
    record,
  };
}

/**
 * Validates, consumes (deletes), and returns the authorization state.
 * Throws an error if state is invalid, mismatched, or expired.
 */
export async function consumeOAuthState(state: string, expectedProvider?: string) {
  if (!state) {
    throw new Error("Missing OAuth state parameter.");
  }

  const record = await prisma.oAuthAuthorizationState.findUnique({
    where: { state },
  });

  if (!record) {
    throw new Error("Invalid or expired OAuth state token. Please restart the authorization flow.");
  }

  // Atomically delete the token to prevent replay attacks
  await prisma.oAuthAuthorizationState.delete({
    where: { id: record.id },
  }).catch(() => {});

  if (record.expiresAt < new Date()) {
    throw new Error("OAuth authorization session expired. Please try connecting again.");
  }

  if (expectedProvider && record.provider !== expectedProvider) {
    throw new Error(`OAuth provider mismatch: expected ${expectedProvider}, found ${record.provider}`);
  }

  return record;
}
