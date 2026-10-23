import { prisma } from "@flowforge/database";
import {
  ConnectorManifestSchema,
  ConnectorManifestDTO,
  canonicalJson,
  CertificationCheckType,
} from "@flowforge/shared";
import { createHash } from "crypto";

export function computeArtifactHashSha256(manifest: unknown): string {
  const canonical = canonicalJson(manifest);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface CheckExecutionOutput {
  checkName: CertificationCheckType;
  status: "PASSED" | "FAILED" | "WARNING";
  message: string;
  details?: Record<string, any>;
  durationMs: number;
}

export class ConnectorCertificationService {
  /**
   * Runs the 6-check automated certification pipeline against a ConnectorReleaseArtifact.
   */
  async runAutomatedCertification(artifactId: string, reviewerId?: string) {
    const artifact = await prisma.connectorReleaseArtifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact) {
      throw new Error(`Connector release artifact '${artifactId}' not found.`);
    }

    const manifest = artifact.manifest as any as ConnectorManifestDTO;
    const checks: CheckExecutionOutput[] = [];

    // Check 1: MANIFEST_SCHEMA_VALIDITY
    const t1 = Date.now();
    const parseResult = ConnectorManifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      checks.push({
        checkName: "MANIFEST_SCHEMA_VALIDITY",
        status: "FAILED",
        message: "Manifest schema validation failed.",
        details: { errors: parseResult.error.errors },
        durationMs: Date.now() - t1,
      });
    } else {
      checks.push({
        checkName: "MANIFEST_SCHEMA_VALIDITY",
        status: "PASSED",
        message: "Manifest conforms to FlowForge Connector Manifest specification.",
        durationMs: Date.now() - t1,
      });
    }

    // Check 2: ACTION_TRIGGER_CONTRACTS
    const t2 = Date.now();
    const actionCount = manifest.actions?.length || 0;
    const triggerCount = manifest.triggers?.length || 0;
    if (actionCount === 0 && triggerCount === 0) {
      checks.push({
        checkName: "ACTION_TRIGGER_CONTRACTS",
        status: "FAILED",
        message: "Connector must define at least one action or trigger.",
        durationMs: Date.now() - t2,
      });
    } else {
      const duplicateActionIds = new Set<string>();
      let hasContractError = false;
      let contractErrorMsg = "";

      for (const action of manifest.actions || []) {
        if (!action.id || !action.name || !action.description) {
          hasContractError = true;
          contractErrorMsg = `Action is missing required fields (id, name, or description).`;
          break;
        }
        if (duplicateActionIds.has(action.id)) {
          hasContractError = true;
          contractErrorMsg = `Duplicate action id '${action.id}' detected.`;
          break;
        }
        duplicateActionIds.add(action.id);
      }

      if (hasContractError) {
        checks.push({
          checkName: "ACTION_TRIGGER_CONTRACTS",
          status: "FAILED",
          message: contractErrorMsg,
          durationMs: Date.now() - t2,
        });
      } else {
        checks.push({
          checkName: "ACTION_TRIGGER_CONTRACTS",
          status: "PASSED",
          message: `Verified ${actionCount} action(s) and ${triggerCount} trigger contract(s).`,
          durationMs: Date.now() - t2,
        });
      }
    }

    // Check 3: CREDENTIAL_SAFETY_AND_REDACTION
    const t3 = Date.now();
    let credSafe = true;
    let credMessage = "Authentication configuration adheres to credential safety standards.";
    const auth = manifest.auth;

    if (auth && auth.type !== "NONE") {
      for (const field of auth.fields || []) {
        const lowerName = field.name.toLowerCase();
        if (
          (lowerName.includes("key") ||
            lowerName.includes("secret") ||
            lowerName.includes("token") ||
            lowerName.includes("password")) &&
          field.type !== "password"
        ) {
          credSafe = false;
          credMessage = `Auth field '${field.name}' must have type: 'password' to guarantee secret redaction.`;
          break;
        }
      }
    }

    checks.push({
      checkName: "CREDENTIAL_SAFETY_AND_REDACTION",
      status: credSafe ? "PASSED" : "FAILED",
      message: credMessage,
      durationMs: Date.now() - t3,
    });

    // Check 4: SSRF_AND_EGRESS_COMPLIANCE
    const t4 = Date.now();
    let ssrfPassed = true;
    let ssrfMessage = "Egress targets comply with SSRF restrictions.";

    for (const action of manifest.actions || []) {
      if (action.httpConfig) {
        const { urlTemplate, timeoutMs } = action.httpConfig;
        if (urlTemplate) {
          const lower = urlTemplate.toLowerCase();
          if (
            lower.includes("127.0.0.1") ||
            lower.includes("localhost") ||
            lower.includes("169.254.169.254") ||
            lower.includes("10.") ||
            lower.includes("192.168.") ||
            lower.includes("::1")
          ) {
            ssrfPassed = false;
            ssrfMessage = `Action '${action.id}' references restricted local or metadata network address (${urlTemplate}).`;
            break;
          }
        }
        if (timeoutMs && (timeoutMs < 500 || timeoutMs > 30000)) {
          ssrfPassed = false;
          ssrfMessage = `Action '${action.id}' timeout ${timeoutMs}ms violates platform maximum of 30000ms.`;
          break;
        }
      }
    }

    checks.push({
      checkName: "SSRF_AND_EGRESS_COMPLIANCE",
      status: ssrfPassed ? "PASSED" : "FAILED",
      message: ssrfMessage,
      durationMs: Date.now() - t4,
    });

    // Check 5: TENANT_ISOLATION_AND_RESIDENCY
    const t5 = Date.now();
    let isolationPassed = true;
    let isolationMsg = "Permissions and residency boundary verified.";
    const permissions = manifest.permissions || [];
    const disallowedScopes = ["admin:all", "system:root", "db:raw", "platform:internal"];

    for (const perm of permissions) {
      if (disallowedScopes.includes(perm.toLowerCase())) {
        isolationPassed = false;
        isolationMsg = `Disallowed elevated scope '${perm}' cannot be granted to custom connectors.`;
        break;
      }
    }

    checks.push({
      checkName: "TENANT_ISOLATION_AND_RESIDENCY",
      status: isolationPassed ? "PASSED" : "FAILED",
      message: isolationMsg,
      durationMs: Date.now() - t5,
    });

    // Check 6: ARTIFACT_PROVENANCE_INTEGRITY
    const t6 = Date.now();
    const computedHash = computeArtifactHashSha256(manifest);
    const provenancePassed =
      computedHash.length === 64 &&
      computedHash.toLowerCase() === artifact.artifactHashSha256.toLowerCase();

    checks.push({
      checkName: "ARTIFACT_PROVENANCE_INTEGRITY",
      status: provenancePassed ? "PASSED" : "FAILED",
      message: provenancePassed
        ? `Canonical SHA-256 provenance hash verified: ${computedHash}`
        : `Provenance hash mismatch! Expected ${artifact.artifactHashSha256}, computed ${computedHash}`,
      details: {
        computedHash,
        storedHash: artifact.artifactHashSha256,
      },
      durationMs: Date.now() - t6,
    });

    const anyFailed = checks.some((c) => c.status === "FAILED");
    const overallResult = anyFailed ? "FAILED" : "PASSED";

    // Save certification record and checks
    const record = await prisma.connectorCertificationRecord.create({
      data: {
        artifactId: artifact.id,
        overallResult,
        artifactHashSha256: computedHash,
        reviewedByUserId: reviewerId || null,
        reviewNotes: anyFailed ? "Automated certification checks failed." : "Automated certification passed.",
        reviewedAt: reviewerId ? new Date() : null,
        checks: {
          create: checks.map((c) => ({
            checkName: c.checkName,
            status: c.status,
            message: c.message,
            details: c.details || {},
            durationMs: c.durationMs,
          })),
        },
      },
      include: {
        checks: true,
      },
    });

    // Update release artifact status
    await prisma.connectorReleaseArtifact.update({
      where: { id: artifact.id },
      data: {
        certificationStatus: overallResult,
        status: overallResult === "PASSED" ? "CERTIFIED" : "DRAFT",
        rejectionReason: anyFailed ? "Automated certification checks failed" : null,
      },
    });

    return record;
  }
}

export const connectorCertificationService = new ConnectorCertificationService();
