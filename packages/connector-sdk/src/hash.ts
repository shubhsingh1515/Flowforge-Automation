import { createHash } from "crypto";
import { canonicalJson, ConnectorManifestDTO } from "@flowforge/shared";

/**
 * Computes the canonical SHA-256 hash of a connector manifest artifact.
 * Deterministic across all environments and JSON key orderings.
 */
export function computeArtifactHashSha256(manifest: ConnectorManifestDTO | unknown): string {
  const canonical = canonicalJson(manifest);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Verifies that a manifest matches an expected SHA-256 artifact hash.
 */
export function verifyArtifactHash(manifest: unknown, expectedHash: string): boolean {
  if (!expectedHash || typeof expectedHash !== "string") return false;
  const actual = computeArtifactHashSha256(manifest);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}
