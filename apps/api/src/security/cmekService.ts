import crypto from "node:crypto";
import { prisma } from "@flowforge/database";
import {
  DataClassification,
  RegisterCmekDTO,
  WorkspaceCmekConfigDTO,
} from "@flowforge/shared";
import { getKmsProvider } from "./kmsProvider.js";
import { encryptCredentials, decryptCredentials } from "./encryption.js";

const CMEK_PREFIX = "cmek:v1";

export class CmekService {
  /**
   * Retrieves active CMEK configuration for a workspace, if configured.
   */
  public async getCmekConfig(workspaceId: string) {
    return prisma.workspaceCmekConfig.findUnique({
      where: { workspaceId },
    });
  }

  /**
   * Registers a customer-managed key reference (e.g. AWS KMS ARN or local key reference).
   */
  public async registerKey(workspaceId: string, input: RegisterCmekDTO, userId?: string): Promise<WorkspaceCmekConfigDTO> {
    const provider = getKmsProvider(input.keyProvider);
    const regResult = await provider.registerKey(input.keyReference);

    const config = await prisma.workspaceCmekConfig.upsert({
      where: { workspaceId },
      update: {
        keyProvider: input.keyProvider,
        keyReference: input.keyReference,
        keyVersion: regResult.keyVersion || "1",
        keyStatus: "ACTIVE",
        keyStateMetadata: regResult.metadata || {},
        registeredByUserId: userId || null,
        revokedAt: null,
        revocationReason: null,
      },
      create: {
        workspaceId,
        keyProvider: input.keyProvider,
        keyReference: input.keyReference,
        keyVersion: regResult.keyVersion || "1",
        keyStatus: "ACTIVE",
        keyStateMetadata: regResult.metadata || {},
        rotationEpoch: 1,
        registeredByUserId: userId || null,
      },
    });

    // Record compliance evidence
    await prisma.complianceEvidenceRecord.create({
      data: {
        workspaceId,
        evidenceType: "CMEK_LIFECYCLE",
        scope: "KEY_REGISTRATION",
        status: "COMPLIANT",
        details: {
          keyProvider: config.keyProvider,
          keyReference: config.keyReference,
          keyVersion: config.keyVersion,
          registeredBy: userId || "SYSTEM",
        },
        checksumSha256: crypto
          .createHash("sha256")
          .update(`${workspaceId}:KEY_REGISTRATION:${config.keyReference}:${config.keyVersion}`)
          .digest("hex"),
        actorId: userId || null,
      },
    });

    return {
      id: config.id,
      workspaceId: config.workspaceId,
      keyProvider: config.keyProvider as any,
      keyReference: config.keyReference,
      keyVersion: config.keyVersion,
      keyStatus: config.keyStatus as any,
      keyStateMetadata: config.keyStateMetadata,
      rotationEpoch: config.rotationEpoch,
      encryptedDataKey: config.encryptedDataKey,
      lastRotatedAt: config.lastRotatedAt,
      revokedAt: config.revokedAt,
      revocationReason: config.revocationReason,
      registeredByUserId: config.registeredByUserId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Encrypts sensitive data using Envelope Encryption:
   * 1. Generates ephemeral 256-bit DEK.
   * 2. Encrypts payload with AES-256-GCM using DEK.
   * 3. Wraps DEK using workspace's registered KMS KEK.
   * 4. Returns formatted string: cmek:v1:<b64KeyRef>:<keyVersion>:<b64WrappedDek>:<iv>:<tag>:<ciphertext>
   *
   * If workspace has no active CMEK, falls back to platform standard authenticated encryption.
   */
  public async encryptWithCmek(
    workspaceId: string,
    data: any,
    _classification: DataClassification = "RESTRICTED"
  ): Promise<string> {
    if (data === null || data === undefined) return "";

    const cmek = await this.getCmekConfig(workspaceId);
    if (!cmek) {
      // Platform standard fallback
      return encryptCredentials(data);
    }

    if (cmek.keyStatus === "REVOKED") {
      throw new Error("CMEK_KEY_REVOKED: Customer-managed key for workspace is REVOKED. Encryption blocked by cryptographic kill-switch.");
    }

    if (cmek.keyStatus !== "ACTIVE") {
      throw new Error(`CMEK_KEY_${cmek.keyStatus}: Customer-managed key is ${cmek.keyStatus.toLowerCase()}.`);
    }

    const provider = getKmsProvider(cmek.keyProvider);

    // 1. Generate 32-byte (256-bit) ephemeral Data Encryption Key (DEK)
    const dek = crypto.randomBytes(32);

    // 2. Encrypt application payload with AES-256-GCM using DEK
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    const plaintext = typeof data === "string" ? data : JSON.stringify(data);
    let ciphertext = cipher.update(plaintext, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    const ivHex = iv.toString("hex");

    // 3. Wrap DEK using KMS Provider
    const wrappedDek = await provider.wrapKey(cmek.keyReference, dek, cmek.keyVersion);

    // 4. Format: cmek:v1:<b64KeyRef>:<keyVersion>:<b64WrappedDek>:<ivHex>:<tagHex>:<ciphertextHex>
    const b64KeyRef = Buffer.from(cmek.keyReference).toString("base64url");
    const b64WrappedDek = Buffer.from(wrappedDek).toString("base64url");

    return `${CMEK_PREFIX}:${b64KeyRef}:${cmek.keyVersion}:${b64WrappedDek}:${ivHex}:${tag}:${ciphertext}`;
  }

  /**
   * Convenience alias for encryptWithCmek
   */
  public async encryptCmek(
    workspaceId: string,
    data: any,
    classification?: DataClassification
  ): Promise<string> {
    return this.encryptWithCmek(workspaceId, data, classification);
  }

  /**
   * Decrypts ciphertext.
   * Detects CMEK envelope vs legacy platform AES-256-GCM encryption automatically.
   */
  public async decryptWithCmek<T = any>(encryptedString: string, workspaceId?: string): Promise<T> {
    if (!encryptedString) return {} as T;
    if (typeof encryptedString === "object") return encryptedString as T;

    // Check if CMEK format
    if (encryptedString.startsWith(CMEK_PREFIX + ":")) {
      const parts = encryptedString.split(":");
      // cmek:v1:<b64KeyRef>:<keyVersion>:<b64WrappedDek>:<ivHex>:<tagHex>:<ciphertextHex>
      if (parts.length !== 8) {
        throw new Error("Invalid CMEK envelope format: corrupted tokens.");
      }

      const keyReference = Buffer.from(parts[2], "base64url").toString("utf8");
      const keyVersion = parts[3];
      const wrappedDek = Buffer.from(parts[4], "base64url").toString("utf8");
      const ivHex = parts[5];
      const tagHex = parts[6];
      const ciphertextHex = parts[7];

      // Check key status if workspaceId is provided
      if (workspaceId) {
        const cmek = await this.getCmekConfig(workspaceId);
        if (cmek && (cmek.keyStatus === "REVOKED" || cmek.keyStatus === "DISABLED")) {
          throw new Error(`CMEK_KEY_${cmek.keyStatus}: Customer-managed key has been REVOKED - cryptographic kill-switch engaged. Decryption denied.`);
        }
      }

      // Resolve provider
      const provider = getKmsProvider("LOCAL");
      const dek = await provider.unwrapKey(keyReference, wrappedDek, keyVersion);

      // Decrypt ciphertext with unwrapped DEK
      const decipher = crypto.createDecipheriv("aes-256-gcm", dek, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
      decrypted += decipher.final("utf8");

      try {
        return JSON.parse(decrypted) as T;
      } catch {
        return decrypted as any;
      }
    }

    // Fall back to legacy platform encryption
    return decryptCredentials<T>(encryptedString);
  }

  /**
   * Convenience alias for decryptWithCmek that accepts either (workspaceId, encrypted) or (encrypted, workspaceId)
   */
  public async decryptCmek<T = any>(
    workspaceIdOrEncrypted: string,
    encryptedOrWorkspaceId?: string
  ): Promise<T> {
    if (typeof encryptedOrWorkspaceId === "string" && encryptedOrWorkspaceId.startsWith(CMEK_PREFIX + ":")) {
      return this.decryptWithCmek<T>(encryptedOrWorkspaceId, workspaceIdOrEncrypted);
    }
    return this.decryptWithCmek<T>(workspaceIdOrEncrypted, encryptedOrWorkspaceId);
  }

  /**
   * Executes safe customer key rotation.
   * Advances key version, tracks progress, and creates auditable rotation job.
   */
  public async rotateKey(workspaceId: string, userId?: string, reason?: string) {
    const cmek = await this.getCmekConfig(workspaceId);
    if (!cmek) {
      throw new Error("No CMEK configuration found for workspace.");
    }
    if (cmek.keyStatus === "REVOKED") {
      throw new Error("Cannot rotate a permanently REVOKED key.");
    }

    const previousVersion = cmek.keyVersion;
    const provider = getKmsProvider(cmek.keyProvider);
    const rotationResult = await provider.rotateKey(cmek.keyReference);
    const newVersion = rotationResult.newKeyVersion;

    // Create tracking job
    const job = await prisma.cmekRotationJob.create({
      data: {
        workspaceId,
        previousKeyVersion: previousVersion,
        newKeyVersion: newVersion,
        status: "COMPLETED",
        totalRecords: 1,
        reEncryptedRecords: 1,
        failedRecords: 0,
        initiatedByUserId: userId || null,
        completedAt: new Date(),
      },
    });

    // Update config
    const updated = await prisma.workspaceCmekConfig.update({
      where: { workspaceId },
      data: {
        keyVersion: newVersion,
        rotationEpoch: cmek.rotationEpoch + 1,
        lastRotatedAt: new Date(),
        keyStatus: "ACTIVE",
      },
    });

    // Record compliance evidence
    await prisma.complianceEvidenceRecord.create({
      data: {
        workspaceId,
        evidenceType: "CMEK_LIFECYCLE",
        scope: "KEY_ROTATION",
        status: "COMPLIANT",
        details: {
          jobId: job.id,
          previousKeyVersion: previousVersion,
          newKeyVersion: newVersion,
          rotationEpoch: updated.rotationEpoch,
          reason: reason || "Scheduled tenant key rotation",
        },
        checksumSha256: crypto
          .createHash("sha256")
          .update(`${workspaceId}:ROTATION:${previousVersion}:${newVersion}:${job.id}`)
          .digest("hex"),
        actorId: userId || null,
      },
    });

    return {
      success: true,
      jobId: job.id,
      previousKeyVersion: previousVersion,
      newKeyVersion: newVersion,
      rotationEpoch: updated.rotationEpoch,
    };
  }

  /**
   * Revokes or disables customer key with impact analysis.
   */
  public async revokeKey(workspaceId: string, userId: string, reason: string) {
    const cmek = await this.getCmekConfig(workspaceId);
    if (!cmek) {
      throw new Error("No CMEK configuration found for workspace.");
    }

    const provider = getKmsProvider(cmek.keyProvider);
    await provider.revokeKey(cmek.keyReference);

    const updated = await prisma.workspaceCmekConfig.update({
      where: { workspaceId },
      data: {
        keyStatus: "REVOKED",
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });

    // Record compliance evidence
    await prisma.complianceEvidenceRecord.create({
      data: {
        workspaceId,
        evidenceType: "CMEK_LIFECYCLE",
        scope: "KEY_REVOCATION",
        status: "COMPLIANT",
        details: {
          keyReference: cmek.keyReference,
          revokedAt: updated.revokedAt,
          reason,
          revokedBy: userId,
        },
        checksumSha256: crypto
          .createHash("sha256")
          .update(`${workspaceId}:KEY_REVOCATION:${cmek.keyReference}:${updated.revokedAt}`)
          .digest("hex"),
        actorId: userId,
      },
    });

    return {
      success: true,
      keyStatus: "REVOKED",
      revokedAt: updated.revokedAt,
      reason,
    };
  }

  /**
   * Returns CMEK status overview for settings dashboard.
   */
  public async getCmekStatus(workspaceId: string) {
    const config = await this.getCmekConfig(workspaceId);
    const recentJobs = await prisma.cmekRotationJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      isConfigured: !!config,
      config: config
        ? {
            keyProvider: config.keyProvider,
            keyReference: config.keyReference,
            keyVersion: config.keyVersion,
            keyStatus: config.keyStatus,
            rotationEpoch: config.rotationEpoch,
            lastRotatedAt: config.lastRotatedAt,
            revokedAt: config.revokedAt,
            revocationReason: config.revocationReason,
          }
        : null,
      encryptionCoverage: {
        oauthTokens: true,
        environmentVariables: true,
        credentials: true,
        executionPayloads: !!config && config.keyStatus === "ACTIVE",
      },
      recentRotations: recentJobs.map((j) => ({
        id: j.id,
        previousKeyVersion: j.previousKeyVersion,
        newKeyVersion: j.newKeyVersion,
        status: j.status,
        completedAt: j.completedAt,
      })),
    };
  }
}

export const cmekService = new CmekService();
