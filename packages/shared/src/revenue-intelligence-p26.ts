import { z } from "zod";

// ==========================================
// 1. CONSTANTS & ENUMS
// ==========================================

export const CONTRACT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "RENEWAL_PENDING",
  "RENEWED",
  "EXPIRED",
  "CANCELLED",
  "TERMINATED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_TYPES = [
  "SUBSCRIPTION",
  "USAGE_BASED",
  "FIXED_TERM",
  "PROFESSIONAL_SERVICES",
  "HYBRID",
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const RENEWAL_TYPES = [
  "MANUAL",
  "AUTO_RENEW",
  "EVERGREEN",
  "OPT_OUT_NOTICE",
] as const;
export type RenewalType = (typeof RENEWAL_TYPES)[number];

export const CONTRACT_CHANGE_TYPES = [
  "CREATED",
  "VALUE_ADJUSTED",
  "TERM_EXTENDED",
  "RENEWED",
  "CANCELLED",
  "STATUS_CHANGED",
  "METADATA_UPDATED",
] as const;
export type ContractChangeType = (typeof CONTRACT_CHANGE_TYPES)[number];

export const RENEWAL_STAGES = [
  "UPCOMING",
  "PREPARATION",
  "CUSTOMER_ENGAGEMENT",
  "COMMERCIAL_REVIEW",
  "NEGOTIATION",
  "COMMIT_PENDING",
  "RENEWED",
  "LOST",
  "ON_HOLD",
] as const;
export type RenewalStage = (typeof RENEWAL_STAGES)[number];

export const RENEWAL_OUTCOMES = [
  "RENEWED_AS_IS",
  "RENEWED_EXPANSION",
  "RENEWED_CONTRACTION",
  "CHURNED",
  "CANCELLED",
] as const;
export type RenewalOutcome = (typeof RENEWAL_OUTCOMES)[number];

export const RENEWAL_RISK_LEVELS = [
  "INSUFFICIENT_DATA",
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
] as const;
export type RenewalRiskLevel = (typeof RENEWAL_RISK_LEVELS)[number];

export const EXPANSION_OPPORTUNITY_TYPES = [
  "ADDITIONAL_CAPACITY",
  "HIGHER_TIER",
  "ADDITIONAL_PRODUCT",
  "NEW_BUSINESS_UNIT",
  "CONTRACT_SCOPE_EXPANSION",
] as const;
export type ExpansionOpportunityType = (typeof EXPANSION_OPPORTUNITY_TYPES)[number];

export const EXPANSION_STAGES = [
  "DETECTED",
  "NEEDS_REVIEW",
  "QUALIFIED",
  "PROPOSAL_IN_PROGRESS",
  "WON",
  "LOST",
  "DISMISSED",
] as const;
export type ExpansionStage = (typeof EXPANSION_STAGES)[number];

export const EXPANSION_ESTIMATE_SOURCES = [
  "MANUAL_INPUT",
  "USAGE_PROJECTION",
  "CONTRACT_RATE",
  "TIER_DELTA",
  "ESTIMATED",
] as const;
export type ExpansionEstimateSource = (typeof EXPANSION_ESTIMATE_SOURCES)[number];

export const RENEWAL_TIMELINE_EVENT_TYPES = [
  "OPPORTUNITY_CREATED",
  "OWNER_ASSIGNED",
  "STAGE_CHANGED",
  "RISK_EVALUATED",
  "TASK_GENERATED",
  "COMMUNICATION_APPROVED",
  "DECISION_RECORDED",
  "CONTRACT_EXTENDED",
  "OUTCOME_FINALIZED",
] as const;
export type RenewalTimelineEventType = (typeof RENEWAL_TIMELINE_EVENT_TYPES)[number];

// Permitted Lifecycle Transitions
export const PERMITTED_CONTRACT_STATUS_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["RENEWAL_PENDING", "RENEWED", "EXPIRED", "CANCELLED", "TERMINATED"],
  RENEWAL_PENDING: ["RENEWED", "EXPIRED", "CANCELLED", "TERMINATED"],
  RENEWED: ["ACTIVE", "RENEWAL_PENDING", "EXPIRED", "CANCELLED", "TERMINATED"],
  EXPIRED: [],
  CANCELLED: [],
  TERMINATED: [],
};

export const PERMITTED_RENEWAL_STAGE_TRANSITIONS: Record<RenewalStage, RenewalStage[]> = {
  UPCOMING: ["PREPARATION", "CUSTOMER_ENGAGEMENT", "ON_HOLD", "LOST"],
  PREPARATION: ["CUSTOMER_ENGAGEMENT", "COMMERCIAL_REVIEW", "ON_HOLD", "LOST"],
  CUSTOMER_ENGAGEMENT: ["COMMERCIAL_REVIEW", "NEGOTIATION", "ON_HOLD", "LOST"],
  COMMERCIAL_REVIEW: ["NEGOTIATION", "COMMIT_PENDING", "ON_HOLD", "LOST"],
  NEGOTIATION: ["COMMIT_PENDING", "RENEWED", "ON_HOLD", "LOST"],
  COMMIT_PENDING: ["RENEWED", "NEGOTIATION", "LOST"],
  RENEWED: [],
  LOST: [],
  ON_HOLD: ["PREPARATION", "CUSTOMER_ENGAGEMENT", "COMMERCIAL_REVIEW", "NEGOTIATION", "LOST"],
};

export const PERMITTED_EXPANSION_STAGE_TRANSITIONS: Record<ExpansionStage, ExpansionStage[]> = {
  DETECTED: ["NEEDS_REVIEW", "QUALIFIED", "DISMISSED"],
  NEEDS_REVIEW: ["QUALIFIED", "DISMISSED"],
  QUALIFIED: ["PROPOSAL_IN_PROGRESS", "WON", "LOST", "DISMISSED"],
  PROPOSAL_IN_PROGRESS: ["WON", "LOST", "DISMISSED"],
  WON: [],
  LOST: [],
  DISMISSED: ["NEEDS_REVIEW"],
};

// ==========================================
// 2. ZOD VALIDATION SCHEMAS
// ==========================================

export const CreateCustomerContractSchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  contractNumber: z.string().min(1, "Contract number is required"),
  name: z.string().min(1, "Contract name is required"),
  externalReference: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).default("ACTIVE"),
  ownerUserId: z.string().optional(),
  startDate: z.string().datetime(),
  termEndDate: z.string().datetime(),
  renewalDate: z.string().datetime(),
  renewalNoticeDeadline: z.string().datetime().optional(),
  contractValue: z.number().nonnegative("Contract value must be non-negative"),
  annualRecurringValue: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("USD"),
  contractType: z.enum(CONTRACT_TYPES).default("SUBSCRIPTION"),
  renewalType: z.enum(RENEWAL_TYPES).default("MANUAL"),
  autoRenew: z.boolean().default(false),
  renewalTermsDays: z.number().int().positive().default(365),
  noticePeriodDays: z.number().int().nonnegative().default(30),
  sourceSystem: z.string().optional(),
  externalContractId: z.string().optional(),
  dataClassification: z.enum(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("CONFIDENTIAL"),
  previousContractId: z.string().optional(),
});
export type CreateCustomerContractInput = z.infer<typeof CreateCustomerContractSchema>;

export const UpdateCustomerContractSchema = z.object({
  name: z.string().min(1).optional(),
  externalReference: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  ownerUserId: z.string().optional(),
  renewalDate: z.string().datetime().optional(),
  renewalNoticeDeadline: z.string().datetime().optional(),
  contractValue: z.number().nonnegative().optional(),
  annualRecurringValue: z.number().nonnegative().optional(),
  renewalType: z.enum(RENEWAL_TYPES).optional(),
  autoRenew: z.boolean().optional(),
  renewalTermsDays: z.number().int().positive().optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  dataClassification: z.enum(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  changeReason: z.string().optional(),
});
export type UpdateCustomerContractInput = z.infer<typeof UpdateCustomerContractSchema>;

export const CreateRenewalOpportunitySchema = z.object({
  contractId: z.string().min(1, "Contract ID is required"),
  opportunityNumber: z.string().min(1, "Opportunity number is required"),
  ownerUserId: z.string().optional(),
  targetDate: z.string().datetime(),
  renewalAmount: z.number().nonnegative("Renewal amount must be non-negative"),
  currency: z.string().min(3).max(3).default("USD"),
  stage: z.enum(RENEWAL_STAGES).default("UPCOMING"),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().datetime().optional(),
  qualificationNotes: z.string().optional(),
  supportingEvidence: z.array(z.record(z.any())).default([]),
});
export type CreateRenewalOpportunityInput = z.infer<typeof CreateRenewalOpportunitySchema>;

export const UpdateRenewalOpportunityStageSchema = z.object({
  stage: z.enum(RENEWAL_STAGES),
  notes: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().datetime().optional(),
});
export type UpdateRenewalOpportunityStageInput = z.infer<typeof UpdateRenewalOpportunityStageSchema>;

export const RecordRenewalOutcomeSchema = z.object({
  outcome: z.enum(RENEWAL_OUTCOMES),
  finalAmount: z.number().nonnegative().optional(),
  successorContractNumber: z.string().optional(),
  notes: z.string().min(1, "Outcome notes/evidence are required"),
});
export type RecordRenewalOutcomeInput = z.infer<typeof RecordRenewalOutcomeSchema>;

export const CreateExpansionOpportunitySchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  opportunityNumber: z.string().min(1, "Opportunity number is required"),
  opportunityType: z.enum(EXPANSION_OPPORTUNITY_TYPES),
  title: z.string().min(1, "Opportunity title is required"),
  description: z.string().optional(),
  ownerUserId: z.string().optional(),
  estimatedValue: z.number().nonnegative().optional(),
  currency: z.string().min(3).max(3).default("USD"),
  estimateSource: z.enum(EXPANSION_ESTIMATE_SOURCES).default("MANUAL_INPUT"),
  evidenceSignals: z.array(z.record(z.any())).default([]),
  qualificationNotes: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().datetime().optional(),
});
export type CreateExpansionOpportunityInput = z.infer<typeof CreateExpansionOpportunitySchema>;

export const QualifyExpansionOpportunitySchema = z.object({
  qualified: z.boolean(),
  notes: z.string().min(1, "Qualification notes are required"),
  estimatedValue: z.number().nonnegative().optional(),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().datetime().optional(),
});
export type QualifyExpansionOpportunityInput = z.infer<typeof QualifyExpansionOpportunitySchema>;

export const UpdateExpansionStageSchema = z.object({
  stage: z.enum(EXPANSION_STAGES),
  notes: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().datetime().optional(),
});
export type UpdateExpansionStageInput = z.infer<typeof UpdateExpansionStageSchema>;

export const ConfigureRevenuePolicySchema = z.object({
  policyVersion: z.string().default("1.0"),
  renewalPreparationDays: z.number().int().min(1).max(365).default(90),
  healthReviewDays: z.number().int().min(1).max(365).default(60),
  engagementDays: z.number().int().min(1).max(365).default(45),
  commercialReviewDays: z.number().int().min(1).max(365).default(30),
  riskThresholds: z
    .object({
      moderate: z.number().min(0).max(100).default(30),
      high: z.number().min(0).max(100).default(60),
      critical: z.number().min(0).max(100).default(80),
    })
    .default({ moderate: 30, high: 60, critical: 80 }),
  alertCooldownHours: z.number().int().min(1).default(72),
  autoTaskGeneration: z.boolean().default(true),
  expansionRules: z
    .object({
      utilizationGrowthPercent: z.number().min(1).default(25),
      consecutiveHighUsageDays: z.number().int().min(1).default(14),
    })
    .default({ utilizationGrowthPercent: 25, consecutiveHighUsageDays: 14 }),
});
export type ConfigureRevenuePolicyInput = z.infer<typeof ConfigureRevenuePolicySchema>;

// ==========================================
// 3. REVENUE DASHBOARD & SUMMARY DTOS
// ==========================================

export interface RevenueOverviewMetrics {
  currency: string;
  totalActiveContracts: number;
  totalContractValue: number;
  totalAnnualRecurringRevenue: number;
  upcomingRenewalsCount: number;
  upcomingRenewalsValue: number;
  revenueAtRiskValue: number;
  revenueAtRiskCount: number;
  renewalsWonValue: number;
  renewalsLostValue: number;
  pipelineByStage: Record<string, { count: number; value: number }>;
  riskDistribution: Record<string, { count: number; value: number }>;
  expansionPipeline: {
    totalDetected: number;
    totalQualified: number;
    pipelineValue: number;
    opportunitiesCount: number;
  };
  retentionInterventions: {
    activeTasksCount: number;
    overdueTasksCount: number;
    recentTimelineEventsCount: number;
  };
}
