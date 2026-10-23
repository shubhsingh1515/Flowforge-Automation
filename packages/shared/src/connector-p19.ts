import { z } from "zod";

export const CONNECTOR_CATEGORIES = [
  "CRM & Sales",
  "Communication",
  "Productivity",
  "Developer Tools",
  "Data & Storage",
  "Operations & Monitoring",
  "Finance & Billing",
  "Custom APIs",
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export const ConnectorAuthFieldSchema = z.object({
  name: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "password", "number", "boolean"]).default("text"),
  required: z.boolean().default(true),
  description: z.string().max(250).optional(),
  placeholder: z.string().max(100).optional(),
});
export type ConnectorAuthField = z.infer<typeof ConnectorAuthFieldSchema>;

export const ConnectorAuthSchema = z.object({
  type: z.enum(["NONE", "API_KEY", "OAUTH2", "BEARER_TOKEN", "CUSTOM_HEADER"]).default("API_KEY"),
  fields: z.array(ConnectorAuthFieldSchema).default([]),
  headerName: z.string().max(100).optional(),
  oauthConfig: z
    .object({
      authorizationUrl: z.string().url().optional(),
      tokenUrl: z.string().url().optional(),
      scopes: z.array(z.string()).default([]),
      pkceRequired: z.boolean().default(false),
    })
    .optional(),
});
export type ConnectorAuth = z.infer<typeof ConnectorAuthSchema>;

export const ConnectorHttpConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  urlTemplate: z.string().min(1).max(1000),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.any().optional(),
  queryParams: z.record(z.string()).default({}),
  timeoutMs: z.number().int().min(500).max(30000).default(10000),
});
export type ConnectorHttpConfig = z.infer<typeof ConnectorHttpConfigSchema>;

export const ConnectorActionSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, "Action ID must be lowercase alphanumeric with hyphens or underscores"),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  inputSchema: z.record(z.any()).default({}),
  outputSchema: z.record(z.any()).default({}),
  sampleOutput: z.any().optional(),
  httpConfig: ConnectorHttpConfigSchema.optional(),
});
export type ConnectorAction = z.infer<typeof ConnectorActionSchema>;

export const ConnectorTriggerSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, "Trigger ID must be lowercase alphanumeric with hyphens or underscores"),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.enum(["WEBHOOK", "POLLING"]).default("WEBHOOK"),
  inputSchema: z.record(z.any()).default({}),
  outputSchema: z.record(z.any()).default({}),
  sampleOutput: z.any().optional(),
});
export type ConnectorTrigger = z.infer<typeof ConnectorTriggerSchema>;

export const ConnectorManifestSchema = z.object({
  id: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, "Connector ID must be lowercase alphanumeric with hyphens or underscores"),
  name: z.string().min(2).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must follow semantic versioning (e.g. 1.0.0)"),
  description: z.string().min(5).max(1000),
  category: z.string().default("Custom APIs"),
  author: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
  icon: z.string().default("Puzzle"),
  auth: ConnectorAuthSchema.default({ type: "API_KEY", fields: [] }),
  triggers: z.array(ConnectorTriggerSchema).default([]),
  actions: z.array(ConnectorActionSchema).default([]),
  permissions: z.array(z.string()).default([]),
  residencyConstraint: z.enum(["US", "EU", "APAC", "GLOBAL"]).default("GLOBAL"),
  metadata: z.record(z.any()).default({}),
});
export type ConnectorManifestDTO = z.infer<typeof ConnectorManifestSchema>;

export const CERTIFICATION_CHECK_TYPES = [
  "MANIFEST_SCHEMA_VALIDITY",
  "ACTION_TRIGGER_CONTRACTS",
  "CREDENTIAL_SAFETY_AND_REDACTION",
  "SSRF_AND_EGRESS_COMPLIANCE",
  "TENANT_ISOLATION_AND_RESIDENCY",
  "ARTIFACT_PROVENANCE_INTEGRITY",
] as const;
export type CertificationCheckType = (typeof CERTIFICATION_CHECK_TYPES)[number];

export const CERTIFICATION_STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "PASSED",
  "FAILED",
  "REVOKED",
] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export const CONNECTOR_RELEASE_STATUSES = [
  "DRAFT",
  "CERTIFYING",
  "CERTIFIED",
  "PUBLISHED",
  "SUSPENDED",
  "REVOKED",
] as const;
export type ConnectorReleaseStatus = (typeof CONNECTOR_RELEASE_STATUSES)[number];

export const CertificationCheckResultSchema = z.object({
  checkType: z.enum(CERTIFICATION_CHECK_TYPES),
  status: z.enum(["PASSED", "FAILED", "WARNING"]),
  score: z.number().min(0).max(100),
  message: z.string(),
  details: z.record(z.any()).optional(),
});
export type CertificationCheckResult = z.infer<typeof CertificationCheckResultSchema>;

export const UpgradePreflightResultSchema = z.object({
  isCompatible: z.boolean(),
  isBreaking: z.boolean(),
  installedVersion: z.string(),
  targetVersion: z.string(),
  breakingChanges: z.array(z.string()),
  warnings: z.array(z.string()),
  actionsDiff: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    modified: z.array(
      z.object({
        actionId: z.string(),
        changes: z.array(z.string()),
      })
    ),
  }),
  triggersDiff: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    modified: z.array(
      z.object({
        triggerId: z.string(),
        changes: z.array(z.string()),
      })
    ),
  }),
  permissionsDiff: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
});
export type UpgradePreflightResult = z.infer<typeof UpgradePreflightResultSchema>;

export const CreateConnectorDraftSchema = z.object({
  manifest: ConnectorManifestSchema,
});
export type CreateConnectorDraftInput = z.infer<typeof CreateConnectorDraftSchema>;

export const ReviewCertificationSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNotes: z.string().max(2000).optional(),
});
export type ReviewCertificationInput = z.infer<typeof ReviewCertificationSchema>;

export const PublishReleaseSchema = z.object({
  expectedArtifactHashSha256: z.string().length(64).optional(),
});
export type PublishReleaseInput = z.infer<typeof PublishReleaseSchema>;

export const SuspendConnectorSchema = z.object({
  reason: z.string().min(5).max(1000),
  isPermanentRevocation: z.boolean().default(false),
});
export type SuspendConnectorInput = z.infer<typeof SuspendConnectorSchema>;

export const UpgradeConnectorSchema = z.object({
  targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  acknowledgeBreakingChanges: z.boolean().default(false),
});
export type UpgradeConnectorInput = z.infer<typeof UpgradeConnectorSchema>;

export const RollbackConnectorSchema = z.object({
  targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  reason: z.string().max(500).optional(),
});
export type RollbackConnectorInput = z.infer<typeof RollbackConnectorSchema>;

export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}
