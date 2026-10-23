import { z } from "zod";

// ==========================================
// PHASE 17: DATA RESIDENCY, CMEK & ADVANCED COMPLIANCE
// ==========================================

export const DATA_CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export const RESIDENCY_POLICY_STATUSES = ["ACTIVE", "PENDING_REVIEW", "NON_COMPLIANT"] as const;
export type ResidencyPolicyStatus = (typeof RESIDENCY_POLICY_STATUSES)[number];

export const RESIDENCY_VERIFICATION_STATUSES = ["VERIFIED", "VIOLATION", "UNVERIFIED"] as const;
export type ResidencyVerificationStatus = (typeof RESIDENCY_VERIFICATION_STATUSES)[number];

export const KMS_KEY_STATUSES = [
  "PENDING",
  "ACTIVE",
  "ROTATION_IN_PROGRESS",
  "DISABLED",
  "REVOKED",
  "ERROR",
] as const;
export type KmsKeyStatus = (typeof KMS_KEY_STATUSES)[number];

export const KMS_PROVIDER_TYPES = ["LOCAL", "AWS_KMS", "VAULT"] as const;
export type KmsProviderType = (typeof KMS_PROVIDER_TYPES)[number];

export const WorkspaceResidencyPolicySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  homeRegion: z.string(),
  permittedProcessingRegions: z.array(z.string()),
  permittedStorageRegions: z.array(z.string()),
  permittedBackupRegions: z.array(z.string()),
  crossRegionReplicationAllowed: z.boolean(),
  thirdPartyProcessingAllowed: z.boolean(),
  status: z.enum(RESIDENCY_POLICY_STATUSES),
  policyVersion: z.number().int(),
  effectiveAt: z.date().or(z.string()),
  lastVerifiedAt: z.date().or(z.string()).nullable().optional(),
  verificationStatus: z.enum(RESIDENCY_VERIFICATION_STATUSES),
  verificationEvidence: z.any().nullable().optional(),
  updatedByUserId: z.string().nullable().optional(),
  changeReason: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type WorkspaceResidencyPolicyDTO = z.infer<typeof WorkspaceResidencyPolicySchema>;

export const UpdateResidencyPolicySchema = z.object({
  homeRegion: z.string().optional(),
  permittedProcessingRegions: z.array(z.string()).min(1).optional(),
  permittedStorageRegions: z.array(z.string()).min(1).optional(),
  permittedBackupRegions: z.array(z.string()).min(1).optional(),
  crossRegionReplicationAllowed: z.boolean().optional(),
  thirdPartyProcessingAllowed: z.boolean().optional(),
  changeReason: z.string().max(500).optional(),
});
export type UpdateResidencyPolicyDTO = z.infer<typeof UpdateResidencyPolicySchema>;

export const WorkspaceCmekConfigSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  keyProvider: z.enum(KMS_PROVIDER_TYPES),
  keyReference: z.string(),
  keyVersion: z.string(),
  keyStatus: z.enum(KMS_KEY_STATUSES),
  keyStateMetadata: z.any().nullable().optional(),
  rotationEpoch: z.number().int(),
  encryptedDataKey: z.string().nullable().optional(),
  lastRotatedAt: z.date().or(z.string()).nullable().optional(),
  revokedAt: z.date().or(z.string()).nullable().optional(),
  revocationReason: z.string().nullable().optional(),
  registeredByUserId: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type WorkspaceCmekConfigDTO = z.infer<typeof WorkspaceCmekConfigSchema>;

export const RegisterCmekSchema = z.object({
  keyProvider: z.enum(KMS_PROVIDER_TYPES).default("LOCAL"),
  keyReference: z.string().min(3).max(256),
});
export type RegisterCmekDTO = z.infer<typeof RegisterCmekSchema>;

export const RotateCmekSchema = z.object({
  reason: z.string().max(256).optional(),
});
export type RotateCmekDTO = z.infer<typeof RotateCmekSchema>;

export const RevokeCmekSchema = z.object({
  confirmRevocation: z.literal(true),
  reason: z.string().min(5).max(500),
});
export type RevokeCmekDTO = z.infer<typeof RevokeCmekSchema>;

export const LegalHoldUpdateSchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type LegalHoldUpdateDTO = z.infer<typeof LegalHoldUpdateSchema>;

export const ComplianceEvidenceRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  evidenceType: z.string(),
  scope: z.string(),
  status: z.string(),
  details: z.any(),
  checksumSha256: z.string(),
  actorId: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
});
export type ComplianceEvidenceRecordDTO = z.infer<typeof ComplianceEvidenceRecordSchema>;
