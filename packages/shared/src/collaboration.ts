import { z } from "zod";

// ==========================================
// 1. ORGANIZATION SCHEMAS & DTOS
// ==========================================

export const OrganizationRoleEnum = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type OrganizationRole = z.infer<typeof OrganizationRoleEnum>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens"),
  metadata: z.record(z.any()).optional().default({}),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  metadata: z.record(z.any()).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const AddOrganizationMemberSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().uuid().optional(),
  role: OrganizationRoleEnum.default("MEMBER"),
});
export type AddOrganizationMemberInput = z.infer<typeof AddOrganizationMemberSchema>;

// ==========================================
// 2. TEAM SCHEMAS & DTOS
// ==========================================

export const TeamRoleEnum = z.enum(["LEAD", "MEMBER"]);
export type TeamRole = z.infer<typeof TeamRoleEnum>;

export const CreateTeamSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens")
    .optional(),
  description: z.string().max(300).optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(300).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamSchema>;

export const AddTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: TeamRoleEnum.default("MEMBER"),
});
export type AddTeamMemberInput = z.infer<typeof AddTeamMemberSchema>;

// ==========================================
// 3. FINE-GRAINED RESOURCE PERMISSIONS
// ==========================================

export const ResourceTypeEnum = z.enum(["WORKFLOW", "ENVIRONMENT", "FOLDER", "GOVERNANCE"]);
export type ResourceType = z.infer<typeof ResourceTypeEnum>;

export const SubjectTypeEnum = z.enum(["USER", "TEAM"]);
export type SubjectType = z.infer<typeof SubjectTypeEnum>;

export const ResourceActionEnum = z.enum([
  "VIEW",
  "EDIT",
  "RUN",
  "APPROVE",
  "DEPLOY",
  "MANAGE_PERMISSIONS",
]);
export type ResourceAction = z.infer<typeof ResourceActionEnum>;

export const GrantResourcePermissionSchema = z.object({
  resourceType: ResourceTypeEnum,
  resourceId: z.string().min(1),
  subjectType: SubjectTypeEnum,
  subjectId: z.string().min(1),
  actions: z.array(ResourceActionEnum).optional(),
  accessLevel: z.enum(["VIEW", "EDIT", "ADMIN"]).optional(),
});
export type GrantResourcePermissionInput = z.infer<typeof GrantResourcePermissionSchema>;

// ==========================================
// 4. WORKFLOW STEWARDSHIP & LIFECYCLE
// ==========================================

export const WorkflowCriticalityEnum = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "TIER_1_CRITICAL",
  "TIER_2_CORE",
  "TIER_3_STANDARD",
  "TIER_4_LOW",
]);
export type WorkflowCriticality = z.infer<typeof WorkflowCriticalityEnum>;

export const WorkflowLifecycleStatusEnum = z.enum([
  "DRAFT",
  "ACTIVE",
  "UNDER_REVIEW",
  "DEPRECATED",
  "ARCHIVED",
]);
export type WorkflowLifecycleStatus = z.infer<typeof WorkflowLifecycleStatusEnum>;

export const UpdateWorkflowStewardshipSchema = z.object({
  ownerUserId: z.string().uuid().nullable().optional(),
  owningTeamId: z.string().uuid().nullable().optional(),
  stewardUserId: z.string().uuid().nullable().optional(),
  criticality: WorkflowCriticalityEnum.optional(),
  businessDomain: z.string().max(100).nullable().optional(),
  lifecycleStatus: WorkflowLifecycleStatusEnum.optional(),
  nextReviewDate: z.string().datetime().nullable().optional(),
  escalationContact: z.string().max(255).nullable().optional(),
});
export type UpdateWorkflowStewardshipInput = z.infer<typeof UpdateWorkflowStewardshipSchema>;

// ==========================================
// 5. COLLABORATIVE WORKFLOW REVIEWS
// ==========================================

export const WorkflowReviewStatusEnum = z.enum([
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);
export type WorkflowReviewStatus = z.infer<typeof WorkflowReviewStatusEnum>;

export const CreateWorkflowReviewSchema = z.object({
  workflowId: z.string().uuid(),
  workflowVersionNumber: z.number().int().min(1),
  title: z.string().min(3).max(150),
  changeSummary: z.string().max(1000).optional(),
});
export type CreateWorkflowReviewInput = z.infer<typeof CreateWorkflowReviewSchema>;

export const DecideWorkflowReviewSchema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  reason: z.string().max(1000).optional(),
});
export type DecideWorkflowReviewInput = z.infer<typeof DecideWorkflowReviewSchema>;

export const AddReviewCommentSchema = z.object({
  comment: z.string().min(1).max(2000),
  nodeId: z.string().optional(),
});
export type AddReviewCommentInput = z.infer<typeof AddReviewCommentSchema>;

// ==========================================
// 6. RELIABILITY OBJECTIVES (SLOS) & ERROR BUDGETS
// ==========================================

export const TargetMetricEnum = z.enum(["SUCCESS_RATE", "P95_LATENCY", "MAX_DURATION"]);
export type TargetMetric = z.infer<typeof TargetMetricEnum>;

export const CreateReliabilityObjectiveSchema = z.object({
  name: z.string().min(2).max(100),
  workflowId: z.string().uuid().nullable().optional(),
  targetMetric: TargetMetricEnum,
  targetValue: z.number().positive(),
  evaluationWindowDays: z.number().int().min(1).max(90).default(14),
});
export type CreateReliabilityObjectiveInput = z.infer<typeof CreateReliabilityObjectiveSchema>;

export interface ReliabilityObjectiveReport {
  id: string;
  name: string;
  workflowId?: string | null;
  workflowName?: string;
  metric: TargetMetric;
  targetValue: number;
  currentValue: number | null;
  status: "MET" | "AT_RISK" | "BREACHED" | "INSUFFICIENT_DATA" | "HEALTHY";
  sampleSize: number;
  errorBudgetRemainingPercent: number | null;
  allowedFailures: number | null;
  actualFailures: number;
  evaluationWindow: string;
  evaluationSummary?: {
    insufficientData: boolean;
    sampleSize: number;
    currentValue: number | null;
    errorBudgetRemainingPct: number;
  };
}

// ==========================================
// 7. COMPLIANCE EXPORTS & AUDIT
// ==========================================

export const ComplianceExportScopeEnum = z.enum([
  "ALL",
  "AUDIT_LOGS",
  "GOVERNANCE",
  "REVIEWS",
  "RELEASES",
]);
export type ComplianceExportScope = z.infer<typeof ComplianceExportScopeEnum>;

export const CreateComplianceExportSchema = z.object({
  scope: ComplianceExportScopeEnum.default("ALL"),
  timeRangeStart: z.string().optional(),
  timeRangeEnd: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason: z.string().optional(),
  includePayloads: z.boolean().optional(),
});
export type CreateComplianceExportInput = z.infer<typeof CreateComplianceExportSchema>;

export interface PolicyEvaluationViolation {
  rule: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
  remediation: string;
}

export interface PolicyEvaluationResult {
  compliant: boolean;
  passedRules: string[];
  warnings: PolicyEvaluationViolation[];
  violations: PolicyEvaluationViolation[];
  evaluatedAt: string;
}
