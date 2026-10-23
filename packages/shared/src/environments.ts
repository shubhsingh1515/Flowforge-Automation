import { z } from "zod";

// ==========================================
// ENVIRONMENT DEFINITIONS & SCHEMAS
// ==========================================

export const EnvironmentTypeSchema = z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION", "CUSTOM"]);
export type EnvironmentType = z.infer<typeof EnvironmentTypeSchema>;

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  type: EnvironmentTypeSchema.default("CUSTOM"),
  description: z.string().max(255).optional(),
  isProtected: z.boolean().default(false),
  requireApproval: z.boolean().default(false),
  requirePassingTests: z.boolean().default(false),
});
export type CreateEnvironmentInput = z.infer<typeof CreateEnvironmentSchema>;

export const UpdateEnvironmentSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(255).optional(),
  isProtected: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  requirePassingTests: z.boolean().optional(),
});
export type UpdateEnvironmentInput = z.infer<typeof UpdateEnvironmentSchema>;

// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================

export const SetEnvironmentVariableSchema = z.object({
  key: z.string().min(1, "Key is required").max(100).regex(/^[A-Z0-9_]+$/, "Key must be uppercase alphanumeric with underscores"),
  value: z.string(),
  isSecret: z.boolean().default(false),
  description: z.string().max(255).optional(),
});
export type SetEnvironmentVariableInput = z.infer<typeof SetEnvironmentVariableSchema>;

// ==========================================
// CREDENTIAL BINDINGS
// ==========================================

export const SetCredentialBindingSchema = z.object({
  integrationKey: z.string().min(1, "Integration key is required"),
  connectedAccountId: z.string().uuid("Invalid ConnectedAccount ID"),
});
export type SetCredentialBindingInput = z.infer<typeof SetCredentialBindingSchema>;

// ==========================================
// RELEASE ARTIFACTS
// ==========================================

export const CreateReleaseArtifactSchema = z.object({
  workflowId: z.string().uuid(),
  workflowVersionId: z.string().uuid().optional(),
  summary: z.string().max(500).optional(),
});
export type CreateReleaseArtifactInput = z.infer<typeof CreateReleaseArtifactSchema>;

// ==========================================
// DEPLOYMENT PROMOTION & DIFF
// ==========================================

export const DeploymentStatusSchema = z.enum([
  "PENDING_APPROVAL",
  "APPROVED",
  "DEPLOYING",
  "DEPLOYED",
  "FAILED",
  "CANCELLED",
  "ROLLED_BACK",
  "SUPERSEDED",
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const PromoteReleaseSchema = z.object({
  workflowId: z.string().uuid(),
  releaseArtifactId: z.string().uuid(),
  environmentId: z.string().uuid(),
  expectedCurrentReleaseId: z.string().uuid().optional(),
});
export type PromoteReleaseInput = z.infer<typeof PromoteReleaseSchema>;

export const DecideDeploymentSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(500).optional(),
});
export type DecideDeploymentInput = z.infer<typeof DecideDeploymentSchema>;

export const RollbackDeploymentSchema = z.object({
  targetReleaseArtifactId: z.string().uuid(),
  environmentId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type RollbackDeploymentInput = z.infer<typeof RollbackDeploymentSchema>;

// ==========================================
// TEST CASES & TEST RUNS
// ==========================================

export const TestAssertionSchema = z.object({
  nodeId: z.string().min(1),
  fieldPath: z.string().min(1),
  operator: z.enum(["EQUALS", "CONTAINS", "EXISTS", "GREATER_THAN", "NOT_EMPTY"]),
  expectedValue: z.any().optional(),
});
export type TestAssertion = z.infer<typeof TestAssertionSchema>;

export const CreateTestCaseSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  triggerPayload: z.record(z.any()).default({}),
  mockOutputs: z.record(z.any()).default({}),
  expectedStatus: z.enum(["SUCCESS", "FAILED"]).default("SUCCESS"),
  assertions: z.array(TestAssertionSchema).default([]),
});
export type CreateTestCaseInput = z.infer<typeof CreateTestCaseSchema>;

export const RunTestCaseSchema = z.object({
  releaseArtifactId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  mode: z.enum(["DRY_RUN", "MOCKED", "REAL_INTEGRATION"]).default("DRY_RUN"),
});
export type RunTestCaseInput = z.infer<typeof RunTestCaseSchema>;

// ==========================================
// DEPLOYMENT POLICIES
// ==========================================

export const UpdateDeploymentPolicySchema = z.object({
  requireApproval: z.boolean().optional(),
  requirePassingTests: z.boolean().optional(),
  preventSelfApproval: z.boolean().optional(),
  allowedPromoterRoles: z.array(z.string()).optional(),
  allowedApproverRoles: z.array(z.string()).optional(),
});
export type UpdateDeploymentPolicyInput = z.infer<typeof UpdateDeploymentPolicySchema>;

// ==========================================
// DTOs & STRUCTURAL DIFF
// ==========================================

export interface StructuralDiff {
  addedNodes: any[];
  removedNodes: any[];
  modifiedNodes: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
  }>;
  addedEdges: any[];
  removedEdges: any[];
  hasChanges: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredVariables: string[];
  missingVariables: string[];
  requiredIntegrations: string[];
  missingBindings: string[];
  testGatePassed?: boolean;
}
