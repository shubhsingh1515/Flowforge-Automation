import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const PREFIX = "enc:v1";

/**
 * Derives a consistent 32-byte key from environment or development fallback.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      // 32-byte hex string
      return Buffer.from(envKey, "hex");
    }
    // Hash arbitrary key string with SHA-256 to ensure exact 32-byte length
    return crypto.createHash("sha256").update(envKey).digest();
  }

  // Development fallback key (never used in production)
  if (process.env.NODE_ENV === "production") {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be set in production environment!");
  }
  return crypto.createHash("sha256").update("flowforge-dev-secret-encryption-key-32b").digest();
}

export interface EncryptedPayload {
  version: "v1";
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * Encrypts arbitrary JSON-serializable data using AES-256-GCM authenticated encryption.
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptCredentials(data: any): string {
  if (data === null || data === undefined) {
    return "";
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");
  const ivHex = iv.toString("hex");

  return `${PREFIX}:${ivHex}:${tag}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted credential string.
 * Throws an error if tampered with, corrupted, or tag verification fails.
 */
export function decryptCredentials<T = any>(encryptedString: string): T {
  if (!encryptedString) {
    return {} as T;
  }

  // If already an unencrypted object (legacy migration compatibility)
  if (typeof encryptedString === "object") {
    return encryptedString as T;
  }

  if (!encryptedString.startsWith(PREFIX + ":")) {
    // Attempt JSON parse or return as-is
    try {
      return JSON.parse(encryptedString);
    } catch {
      return encryptedString as any;
    }
  }

  const parts = encryptedString.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Invalid encrypted credentials format.");
  }

  const ivHex = parts[2];
  const tagHex = parts[3];
  const ciphertext = parts[4];

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted) as T;
}
