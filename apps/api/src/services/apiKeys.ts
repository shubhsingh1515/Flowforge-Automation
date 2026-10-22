import crypto from "crypto";
import { prisma } from "@flowforge/database";
import { ApiKeyScope } from "@flowforge/shared";
import { entitlementService } from "./entitlements.js";

export interface CreateApiKeyOptions {
  name: string;
  scopes: ApiKeyScope[];
  expiresInDays?: number;
}

export class ApiKeyService {
  /**
   * Hashes a secret token using SHA-256 for secure storage.
   */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Creates a new API key for the workspace.
   * Returns the plaintext secret ONLY ONCE upon creation.
   */
  async createKey(workspaceId: string, createdById: string, options: CreateApiKeyOptions) {
    // 1. Enforce plan quota
    const quota = await entitlementService.checkApiKeyQuota(workspaceId);
    if (!quota.allowed) {
      const error: any = new Error(quota.reason || "API key limit reached for your workspace plan.");
      error.statusCode = 403;
      throw error;
    }

    // 2. Generate secure token: ffk_live_<32 hex chars>
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const rawSecret = `ffk_live_${randomBytes}`;
    const keyPrefix = rawSecret.substring(0, 14); // "ffk_live_abcd..."
    const keyHash = this.hashToken(rawSecret);

    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        workspaceId,
        createdById,
        name: options.name,
        keyPrefix,
        keyHash,
        scopes: options.scopes,
        expiresAt,
      },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: createdById,
        actorType: "USER",
        action: "api_key.create",
        targetType: "api_key",
        targetId: apiKey.id,
        metadata: { name: apiKey.name, scopes: apiKey.scopes, keyPrefix },
      },
    }).catch(() => {});

    return {
      key: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      secret: rawSecret, // Single one-time secret disclosure
    };
  }

  /**
   * Lists all API keys for a workspace (secrets excluded).
   */
  async listKeys(workspaceId: string) {
    return prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Rotates an API key: immediately revokes the existing key and issues a replacement.
   */
  async rotateKey(keyId: string, workspaceId: string, userId: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id: keyId, workspaceId },
    });

    if (!existing) {
      const error: any = new Error("API key not found.");
      error.statusCode = 404;
      throw error;
    }

    if (existing.revokedAt) {
      const error: any = new Error("Cannot rotate a revoked API key.");
      error.statusCode = 400;
      throw error;
    }

    // Revoke old key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    // Generate replacement
    const replacement = await this.createKey(workspaceId, userId, {
      name: `${existing.name} (Rotated)`,
      scopes: existing.scopes as ApiKeyScope[],
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "api_key.rotate",
        targetType: "api_key",
        targetId: keyId,
        metadata: { oldKeyId: keyId, newKeyId: replacement.key.id },
      },
    }).catch(() => {});

    return replacement;
  }

  /**
   * Revokes an API key immediately.
   */
  async revokeKey(keyId: string, workspaceId: string, userId: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id: keyId, workspaceId },
    });

    if (!existing) {
      const error: any = new Error("API key not found.");
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "api_key.revoke",
        targetType: "api_key",
        targetId: keyId,
      },
    }).catch(() => {});

    return { success: true, revokedAt: updated.revokedAt };
  }

  /**
   * Verifies an incoming raw token.
   * Returns the key record if valid, or null.
   */
  async verifyKey(rawToken: string) {
    const keyHash = this.hashToken(rawToken);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { workspace: true },
    });

    if (!apiKey) return null;

    // Check revoked
    if (apiKey.revokedAt) return null;

    // Check expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Asynchronously record lastUsedAt
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return apiKey;
  }
}

export const apiKeyService = new ApiKeyService();
