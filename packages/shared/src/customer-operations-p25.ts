import { z } from "zod";

// ==========================================
// 1. CONSTANTS & ENUMS
// ==========================================

export const CUSTOMER_LIFECYCLE_STATES = [
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "AT_RISK",
  "RENEWAL_PENDING",
  "CHURNED",
  "ARCHIVED",
] as const;
export type CustomerLifecycleState = (typeof CUSTOMER_LIFECYCLE_STATES)[number];

export const CUSTOMER_HEALTH_STATUSES = [
  "HEALTHY",
  "NEEDS_ATTENTION",
  "AT_RISK",
  "INSUFFICIENT_DATA",
] as const;
export type CustomerHealthStatus = (typeof CUSTOMER_HEALTH_STATUSES)[number];

export const CUSTOMER_TIERS = ["ENTERPRISE", "GROWTH", "STANDARD", "FREE"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const CUSTOMER_DATA_CLASSIFICATIONS = ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export type CustomerDataClassification = (typeof CUSTOMER_DATA_CLASSIFICATIONS)[number];

export const CUSTOMER_EXTERNAL_SYSTEM_TYPES = [
  "CRM",
  "BILLING",
  "SUPPORT",
  "ANALYTICS",
  "IDENTITY_PROVIDER",
] as const;
export type CustomerExternalSystemType = (typeof CUSTOMER_EXTERNAL_SYSTEM_TYPES)[number];

export const CUSTOMER_JOURNEY_TYPES = [
  "ONBOARDING",
  "ACTIVATION",
  "ADOPTION",
  "RENEWAL",
  "RECOVERY",
  "OFFBOARDING",
] as const;
export type CustomerJourneyType = (typeof CUSTOMER_JOURNEY_TYPES)[number];

export const CUSTOMER_JOURNEY_STATUSES = [
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type CustomerJourneyStatus = (typeof CUSTOMER_JOURNEY_STATUSES)[number];

export const CUSTOMER_RISK_CATEGORIES = [
  "ONBOARDING_STALL",
  "ADOPTION_DROP",
  "SLA_BREACH_SPIKE",
  "SUPPORT_ESCALATION",
  "CHURN_INDICATOR",
] as const;
export type CustomerRiskCategory = (typeof CUSTOMER_RISK_CATEGORIES)[number];

export const CUSTOMER_TASK_TYPES = [
  "AT_RISK_REVIEW",
  "ONBOARDING_FOLLOWUP",
  "RENEWAL_CHECK",
  "SUPPORT_ESCALATION",
  "DATA_SYNC_INVESTIGATION",
  "COMMUNICATION_APPROVAL",
] as const;
export type CustomerTaskType = (typeof CUSTOMER_TASK_TYPES)[number];

export const CUSTOMER_TASK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CANCELLED",
] as const;
export type CustomerTaskStatus = (typeof CUSTOMER_TASK_STATUSES)[number];

export const CUSTOMER_TASK_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export type CustomerTaskPriority = (typeof CUSTOMER_TASK_PRIORITIES)[number];

export const PLAYBOOK_TRIGGER_TYPES = [
  "RISK_DETECTED",
  "JOURNEY_BLOCKED",
  "HEALTH_DROP",
  "MANUAL",
] as const;
export type PlaybookTriggerType = (typeof PLAYBOOK_TRIGGER_TYPES)[number];

// ==========================================
// 2. ZOD SCHEMAS FOR CUSTOMER REGISTRY & 360
// ==========================================

export const CreateCustomerAccountSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-_]+$/, "Slug must only contain lowercase alphanumeric characters, dashes, and underscores."),
  name: z.string().min(2).max(150),
  domain: z.string().max(100).optional(),
  tier: z.enum(CUSTOMER_TIERS).default("STANDARD"),
  lifecycleState: z.enum(CUSTOMER_LIFECYCLE_STATES).default("ONBOARDING"),
  ownerUserId: z.string().uuid().optional(),
  ownerTeamId: z.string().uuid().optional(),
  annualContractValue: z.number().min(0).optional(),
  dataClassification: z.enum(CUSTOMER_DATA_CLASSIFICATIONS).default("INTERNAL"),
  consentMetadata: z.record(z.any()).default({}),
  customAttributes: z.record(z.any()).default({}),
});
export type CreateCustomerAccountInput = z.infer<typeof CreateCustomerAccountSchema>;

export const UpdateCustomerAccountSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  domain: z.string().max(100).optional(),
  tier: z.enum(CUSTOMER_TIERS).optional(),
  lifecycleState: z.enum(CUSTOMER_LIFECYCLE_STATES).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  ownerTeamId: z.string().uuid().nullable().optional(),
  annualContractValue: z.number().min(0).optional(),
  dataClassification: z.enum(CUSTOMER_DATA_CLASSIFICATIONS).optional(),
  consentMetadata: z.record(z.any()).optional(),
  customAttributes: z.record(z.any()).optional(),
});
export type UpdateCustomerAccountInput = z.infer<typeof UpdateCustomerAccountSchema>;

export const CreateCustomerContactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.string().max(80).default("END_USER"),
  phone: z.string().max(40).optional(),
  isPrimary: z.boolean().default(false),
  consentStatus: z.enum(["OPTED_IN", "OPTED_OUT", "PENDING"]).default("OPTED_IN"),
  consentMetadata: z.record(z.any()).default({}),
});
export type CreateCustomerContactInput = z.infer<typeof CreateCustomerContactSchema>;

export const LinkExternalIdentitySchema = z.object({
  systemType: z.enum(CUSTOMER_EXTERNAL_SYSTEM_TYPES),
  connectorId: z.string().optional(),
  externalSystem: z.string().min(2).max(50), // e.g. "salesforce", "stripe", "zendesk"
  externalId: z.string().min(1).max(150),
  externalData: z.record(z.any()).default({}),
  confidence: z.number().min(0).max(1.0).default(1.0),
  isPrimary: z.boolean().default(true),
  verified: z.boolean().default(true),
  provenance: z.record(z.any()).default({}),
});
export type LinkExternalIdentityInput = z.infer<typeof LinkExternalIdentitySchema>;

// ==========================================
// 3. CUSTOMER JOURNEY SCHEMAS
// ==========================================

export const CreateCustomerJourneyDefinitionSchema = z.object({
  name: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-_]+$/, "Slug must be lowercase alphanumeric with dashes or underscores"),
  description: z.string().max(1000).optional(),
  journeyType: z.enum(CUSTOMER_JOURNEY_TYPES).default("ONBOARDING"),
  targetSegment: z.string().max(50).default("ALL"),
});
export type CreateCustomerJourneyDefinitionInput = z.infer<typeof CreateCustomerJourneyDefinitionSchema>;

export const JourneyMilestoneDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(150),
  targetDurationHours: z.number().int().min(1).default(48),
  requiredProcessDefId: z.string().optional(), // Phase 21 link
  workflowTriggerId: z.string().optional(),
  isHumanCheckpoint: z.boolean().default(false),
});

export const CreateCustomerJourneyVersionSchema = z.object({
  entryConditions: z.record(z.any()).default({}),
  milestones: z.array(JourneyMilestoneDefinitionSchema).min(1),
  exitConditions: z.record(z.any()).default({}),
  targetDurationHours: z.number().int().min(1).default(168),
  slaPolicy: z.record(z.any()).default({}),
});
export type CreateCustomerJourneyVersionInput = z.infer<typeof CreateCustomerJourneyVersionSchema>;

export const StartCustomerJourneyInstanceSchema = z.object({
  journeyDefinitionId: z.string().uuid(),
  journeyVersionId: z.string().uuid().optional(),
  customerAccountId: z.string().uuid(),
  idempotencyKey: z.string().max(120).optional(),
  relatedProcessInstanceId: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});
export type StartCustomerJourneyInstanceInput = z.infer<typeof StartCustomerJourneyInstanceSchema>;

export const ProgressJourneyMilestoneSchema = z.object({
  milestoneId: z.string().min(1),
  status: z.enum(["COMPLETED", "SKIPPED", "BLOCKED", "FAILED"]),
  notes: z.string().max(500).optional(),
  evidence: z.record(z.any()).default({}),
});
export type ProgressJourneyMilestoneInput = z.infer<typeof ProgressJourneyMilestoneSchema>;

// ==========================================
// 4. ADOPTION & HEALTH SCHEMAS
// ==========================================

export const CreateAdoptionMetricSchema = z.object({
  slug: z.string().min(2).max(100),
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional(),
  metricType: z.enum(["EVENT_COUNT", "ACTIVE_USERS", "FEATURE_FREQUENCY", "TIME_TO_ACTION", "REPEATED_USAGE"]).default("EVENT_COUNT"),
  sourceEventType: z.string().max(100).optional(),
  dataProductId: z.string().uuid().optional(),
  filterExpression: z.record(z.any()).default({}),
  aggregationWindowDays: z.number().int().min(1).max(365).default(30),
  minSampleRequired: z.number().int().min(1).default(1),
});
export type CreateAdoptionMetricInput = z.infer<typeof CreateAdoptionMetricSchema>;

export const HealthDimensionConfigSchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).max(1.0),
  metricType: z.string(),
  evaluationWindowDays: z.number().int().min(1).default(30),
  missingDataBehavior: z.enum(["FLAG_INSUFFICIENT", "EXCLUDE_DIMENSION", "ASSUME_BASELINE"]).default("FLAG_INSUFFICIENT"),
  warningThreshold: z.number().default(50),
  criticalThreshold: z.number().default(25),
});

export const ConfigureHealthModelSchema = z.object({
  name: z.string().min(2).max(120),
  dimensions: z.array(HealthDimensionConfigSchema).min(1),
  statusThresholds: z
    .object({
      healthyMin: z.number().min(0).max(100).default(75),
      needsAttentionMin: z.number().min(0).max(100).default(50),
      atRiskMin: z.number().min(0).max(100).default(0),
    })
    .default({ healthyMin: 75, needsAttentionMin: 50, atRiskMin: 0 }),
});
export type ConfigureHealthModelInput = z.infer<typeof ConfigureHealthModelSchema>;

// ==========================================
// 5. CUSTOMER RISK SCHEMAS
// ==========================================

export const CreateCustomerRiskAssessmentSchema = z.object({
  customerAccountId: z.string().uuid(),
  riskCategory: z.enum(CUSTOMER_RISK_CATEGORIES),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  summary: z.string().min(5).max(1000),
  evidenceReferences: z.array(z.record(z.any())).default([]),
  probability: z.number().min(0).max(1.0).optional(),
  confidence: z.number().min(0).max(1.0).default(0.85),
  recommendedAction: z.string().max(500).optional(),
  journeyInstanceId: z.string().uuid().optional(),
});
export type CreateCustomerRiskAssessmentInput = z.infer<typeof CreateCustomerRiskAssessmentSchema>;

// ==========================================
// 6. CUSTOMER SUCCESS TASKS & PLAYBOOKS
// ==========================================

export const CreateCustomerSuccessTaskSchema = z.object({
  customerAccountId: z.string().uuid(),
  journeyInstanceId: z.string().uuid().optional(),
  riskAssessmentId: z.string().uuid().optional(),
  taskType: z.enum(CUSTOMER_TASK_TYPES),
  title: z.string().min(3).max(150),
  description: z.string().min(5).max(2000),
  priority: z.enum(CUSTOMER_TASK_PRIORITIES).default("MEDIUM"),
  assignedUserId: z.string().uuid().optional(),
  assignedTeamId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  evidence: z.record(z.any()).default({}),
});
export type CreateCustomerSuccessTaskInput = z.infer<typeof CreateCustomerSuccessTaskSchema>;

export const UpdateCustomerSuccessTaskSchema = z.object({
  status: z.enum(CUSTOMER_TASK_STATUSES).optional(),
  priority: z.enum(CUSTOMER_TASK_PRIORITIES).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignedTeamId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  resolutionNotes: z.string().max(1000).optional(),
});
export type UpdateCustomerSuccessTaskInput = z.infer<typeof UpdateCustomerSuccessTaskSchema>;

export const PlaybookStepSchema = z.object({
  stepId: z.string(),
  type: z.enum(["CREATE_TASK", "START_WORKFLOW", "REQUEST_APPROVAL", "UPDATE_HEALTH", "LOG_AUDIT"]),
  config: z.record(z.any()),
});

export const CreateCustomerPlaybookDefinitionSchema = z.object({
  name: z.string().min(2).max(150),
  slug: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(PLAYBOOK_TRIGGER_TYPES).default("RISK_DETECTED"),
});
export type CreateCustomerPlaybookDefinitionInput = z.infer<typeof CreateCustomerPlaybookDefinitionSchema>;

export const CreateCustomerPlaybookVersionSchema = z.object({
  triggerCondition: z.record(z.any()).default({}),
  steps: z.array(PlaybookStepSchema).min(1),
  loopPreventionWindowHours: z.number().int().min(1).max(720).default(24),
  maxRunsPerDay: z.number().int().min(1).max(1000).default(100),
});
export type CreateCustomerPlaybookVersionInput = z.infer<typeof CreateCustomerPlaybookVersionSchema>;

export const TriggerCustomerPlaybookSchema = z.object({
  customerAccountId: z.string().uuid(),
  triggerEventId: z.string().optional(),
});
export type TriggerCustomerPlaybookInput = z.infer<typeof TriggerCustomerPlaybookSchema>;

// ==========================================
// 7. CUSTOMER COMMUNICATIONS GOVERNANCE
// ==========================================

export const CreateCommunicationTemplateSchema = z.object({
  name: z.string().min(2).max(150),
  slug: z.string().min(2).max(100),
  category: z.enum(["ONBOARDING", "RISK_CHECKIN", "RENEWAL", "INCIDENT_NOTICE"]).default("ONBOARDING"),
  subject: z.string().min(3).max(200),
  bodyTemplate: z.string().min(10).max(10000),
  requiredVariables: z.array(z.string()).default([]),
  requiresApproval: z.boolean().default(true),
});
export type CreateCommunicationTemplateInput = z.infer<typeof CreateCommunicationTemplateSchema>;

export const RequestCommunicationApprovalSchema = z.object({
  templateId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  recipientEmail: z.string().email(),
  templateVariables: z.record(z.any()).default({}),
});
export type RequestCommunicationApprovalInput = z.infer<typeof RequestCommunicationApprovalSchema>;
