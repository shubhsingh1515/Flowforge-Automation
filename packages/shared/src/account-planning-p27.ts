import { z } from "zod";

// ==========================================
// 1. CONSTANTS & ENUMS
// ==========================================

export const ACCOUNT_SEGMENTS = [
  "STRATEGIC",
  "ENTERPRISE",
  "GROWTH",
  "STANDARD",
] as const;
export type AccountSegment = (typeof ACCOUNT_SEGMENTS)[number];

export const STRATEGIC_TIERS = [
  "TIER_1_CORE",
  "TIER_2_EXPANSION",
  "TIER_3_SCALE",
  "TIER_4_FOUNDATIONAL",
] as const;
export type StrategicTier = (typeof STRATEGIC_TIERS)[number];

export const REVIEW_CADENCES = [
  "MONTHLY",
  "QUARTERLY",
  "BI_ANNUAL",
  "ANNUAL",
] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];

export const RELATIONSHIP_COVERAGE_STATUSES = [
  "COMPREHENSIVE",
  "ADEQUATE",
  "PARTIAL",
  "SINGLE_THREADED_RISK",
  "INSUFFICIENT_DATA",
] as const;
export type RelationshipCoverageStatus = (typeof RELATIONSHIP_COVERAGE_STATUSES)[number];

export const PORTFOLIO_PRIORITY_LEVELS = [
  "CRITICAL_ATTENTION",
  "HIGH_PRIORITY",
  "ROUTINE_MANAGEMENT",
  "HEALTHY_STRATEGIC",
] as const;
export type PortfolioPriorityLevel = (typeof PORTFOLIO_PRIORITY_LEVELS)[number];

export const STAKEHOLDER_ROLES = [
  "EXECUTIVE_SPONSOR",
  "BUSINESS_DECISION_MAKER",
  "TECHNICAL_DECISION_MAKER",
  "DAY_TO_DAY_CHAMPION",
  "OPERATIONAL_CONTACT",
  "PROCUREMENT_CONTACT",
  "FINANCE_CONTACT",
  "SECURITY_COMPLIANCE_CONTACT",
] as const;
export type StakeholderRole = (typeof STAKEHOLDER_ROLES)[number];

export const STAKEHOLDER_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "FORMER",
] as const;
export type StakeholderStatus = (typeof STAKEHOLDER_STATUSES)[number];

export const ACCOUNT_PLAN_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ACTIVE",
  "ARCHIVED",
] as const;
export type AccountPlanStatus = (typeof ACCOUNT_PLAN_STATUSES)[number];

export const OBJECTIVE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "AT_RISK",
  "BLOCKED",
  "ACHIEVED",
  "CANCELLED",
] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OBJECTIVE_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export type ObjectivePriority = (typeof OBJECTIVE_PRIORITIES)[number];

export const OBJECTIVE_CATEGORIES = [
  "ADOPTION_SCALE",
  "EFFICIENCY_GAIN",
  "COMPLIANCE_READINESS",
  "REVENUE_GROWTH",
  "RELIABILITY_IMPROVEMENT",
] as const;
export type ObjectiveCategory = (typeof OBJECTIVE_CATEGORIES)[number];

export const OBJECTIVE_EVIDENCE_TYPES = [
  "DATA_PRODUCT_METRIC",
  "JOURNEY_MILESTONE",
  "TELEMETRY_OBSERVATION",
  "TASK_COMPLETION",
  "VERIFIED_USER_RECORD",
] as const;
export type ObjectiveEvidenceType = (typeof OBJECTIVE_EVIDENCE_TYPES)[number];

export const BLOCKER_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export const BLOCKER_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
] as const;
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

export const INITIATIVE_STATUSES = [
  "PROPOSED",
  "IN_PROGRESS",
  "BLOCKED",
  "ON_TRACK",
  "COMPLETED",
  "CANCELLED",
] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export const MILESTONE_STATUSES = [
  "PENDING",
  "COMPLETED",
  "OVERDUE",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const EXECUTIVE_REVIEW_STATUSES = [
  "PLANNED",
  "PREPARATION",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ExecutiveReviewStatus = (typeof EXECUTIVE_REVIEW_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  "INVITED",
  "ATTENDED",
  "DECLINED",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const COMMITMENT_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

// Permitted State Transitions
export const PERMITTED_ACCOUNT_PLAN_STATUS_TRANSITIONS: Record<AccountPlanStatus, AccountPlanStatus[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["IN_REVIEW", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export const PERMITTED_OBJECTIVE_STATUS_TRANSITIONS: Record<ObjectiveStatus, ObjectiveStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["AT_RISK", "BLOCKED", "ACHIEVED", "CANCELLED"],
  AT_RISK: ["ACTIVE", "BLOCKED", "ACHIEVED", "CANCELLED"],
  BLOCKED: ["ACTIVE", "AT_RISK", "CANCELLED"],
  ACHIEVED: [],
  CANCELLED: ["DRAFT"],
};

export const PERMITTED_EXECUTIVE_REVIEW_STATUS_TRANSITIONS: Record<ExecutiveReviewStatus, ExecutiveReviewStatus[]> = {
  PLANNED: ["PREPARATION", "CANCELLED"],
  PREPARATION: ["READY_FOR_REVIEW", "PLANNED", "CANCELLED"],
  READY_FOR_REVIEW: ["COMPLETED", "PREPARATION", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["PLANNED"],
};

// ==========================================
// 2. ZOD VALIDATION SCHEMAS
// ==========================================

export const ConfigureStrategicProfileSchema = z.object({
  accountSegment: z.enum(ACCOUNT_SEGMENTS).default("STANDARD"),
  strategicTier: z.enum(STRATEGIC_TIERS).default("TIER_4_FOUNDATIONAL"),
  primaryAccountOwnerId: z.string().optional().nullable(),
  customerSuccessOwnerId: z.string().optional().nullable(),
  executiveSponsorId: z.string().optional().nullable(),
  technicalOwnerId: z.string().optional().nullable(),
  reviewCadence: z.enum(REVIEW_CADENCES).default("QUARTERLY"),
  industry: z.string().optional().nullable(),
  businessDomain: z.string().optional().nullable(),
  targetOutcomes: z.array(z.string()).default([]),
  internalStrategicNotes: z.string().optional().nullable(),
});
export type ConfigureStrategicProfileInput = z.infer<typeof ConfigureStrategicProfileSchema>;

export const AssignStakeholderRoleSchema = z.object({
  contactId: z.string().min(1, "Customer contact ID is required"),
  role: z.enum(STAKEHOLDER_ROLES),
  department: z.string().optional().nullable(),
  relationshipOwnerId: z.string().optional().nullable(),
  status: z.enum(STAKEHOLDER_STATUSES).default("ACTIVE"),
  verificationSource: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type AssignStakeholderRoleInput = z.infer<typeof AssignStakeholderRoleSchema>;

export const UpdateStakeholderRoleSchema = z.object({
  role: z.enum(STAKEHOLDER_ROLES).optional(),
  department: z.string().optional().nullable(),
  relationshipOwnerId: z.string().optional().nullable(),
  status: z.enum(STAKEHOLDER_STATUSES).optional(),
  verificationSource: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  changeReason: z.string().optional().nullable(),
});
export type UpdateStakeholderRoleInput = z.infer<typeof UpdateStakeholderRoleSchema>;

export const CreateAccountPlanSchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  planNumber: z.string().min(1, "Plan number is required"),
  title: z.string().min(1, "Plan title is required"),
  planYear: z.number().int().min(2024).max(2035).default(2027),
  executiveSummary: z.string().optional().nullable(),
  visionStatement: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  reviewDueAt: z.string().datetime().optional().nullable(),
});
export type CreateAccountPlanInput = z.infer<typeof CreateAccountPlanSchema>;

export const UpdateAccountPlanSchema = z.object({
  title: z.string().min(1).optional(),
  executiveSummary: z.string().optional().nullable(),
  visionStatement: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  reviewDueAt: z.string().datetime().optional().nullable(),
});
export type UpdateAccountPlanInput = z.infer<typeof UpdateAccountPlanSchema>;

export const ApproveAccountPlanSchema = z.object({
  changeSummary: z.string().optional().nullable(),
});
export type ApproveAccountPlanInput = z.infer<typeof ApproveAccountPlanSchema>;

export const CreateSuccessObjectiveSchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  accountPlanId: z.string().optional().nullable(),
  objectiveNumber: z.string().min(1, "Objective number is required"),
  title: z.string().min(1, "Objective title is required"),
  description: z.string().optional().nullable(),
  businessRationale: z.string().optional().nullable(),
  priority: z.enum(OBJECTIVE_PRIORITIES).default("MEDIUM"),
  category: z.enum(OBJECTIVE_CATEGORIES).default("ADOPTION_SCALE"),
  targetDate: z.string().datetime(),
  ownerUserId: z.string().optional().nullable(),
  successCriteria: z.string().optional().nullable(),
  measurementMethod: z.string().optional().nullable(),
  baselineValue: z.number().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  unit: z.string().optional().nullable(),
});
export type CreateSuccessObjectiveInput = z.infer<typeof CreateSuccessObjectiveSchema>;

export const UpdateSuccessObjectiveSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  businessRationale: z.string().optional().nullable(),
  status: z.enum(OBJECTIVE_STATUSES).optional(),
  priority: z.enum(OBJECTIVE_PRIORITIES).optional(),
  targetDate: z.string().datetime().optional(),
  ownerUserId: z.string().optional().nullable(),
  successCriteria: z.string().optional().nullable(),
  measurementMethod: z.string().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  progressPercent: z.number().min(0).max(100).optional(),
});
export type UpdateSuccessObjectiveInput = z.infer<typeof UpdateSuccessObjectiveSchema>;

export const RecordObjectiveEvidenceSchema = z.object({
  evidenceType: z.enum(OBJECTIVE_EVIDENCE_TYPES),
  observedValue: z.number().optional().nullable(),
  observationTimestamp: z.string().datetime().optional(),
  description: z.string().min(1, "Evidence description is required"),
  sourceRef: z.string().optional().nullable(),
});
export type RecordObjectiveEvidenceInput = z.infer<typeof RecordObjectiveEvidenceSchema>;

export const RecordObjectiveBlockerSchema = z.object({
  title: z.string().min(1, "Blocker title is required"),
  description: z.string().optional().nullable(),
  severity: z.enum(BLOCKER_SEVERITIES).default("MEDIUM"),
  expectedResolutionDate: z.string().datetime().optional().nullable(),
});
export type RecordObjectiveBlockerInput = z.infer<typeof RecordObjectiveBlockerSchema>;

export const ResolveObjectiveBlockerSchema = z.object({
  resolutionNotes: z.string().min(1, "Resolution notes are required"),
});
export type ResolveObjectiveBlockerInput = z.infer<typeof ResolveObjectiveBlockerSchema>;

export const CreateStrategicInitiativeSchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  accountPlanId: z.string().optional().nullable(),
  initiativeNumber: z.string().min(1, "Initiative number is required"),
  title: z.string().min(1, "Initiative title is required"),
  description: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  targetCompletionDate: z.string().datetime(),
  linkedRevenueOpportunityId: z.string().optional().nullable(),
});
export type CreateStrategicInitiativeInput = z.infer<typeof CreateStrategicInitiativeSchema>;

export const UpdateStrategicInitiativeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  status: z.enum(INITIATIVE_STATUSES).optional(),
  targetCompletionDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional().nullable(),
  linkedRevenueOpportunityId: z.string().optional().nullable(),
});
export type UpdateStrategicInitiativeInput = z.infer<typeof UpdateStrategicInitiativeSchema>;

export const ScheduleExecutiveReviewSchema = z.object({
  customerAccountId: z.string().min(1, "Customer account ID is required"),
  reviewNumber: z.string().min(1, "Review number is required"),
  reviewPeriod: z.string().min(1, "Review period (e.g. Q1 2027) is required"),
  plannedDate: z.string().datetime(),
  reviewOwnerId: z.string().optional().nullable(),
  executiveSponsorId: z.string().optional().nullable(),
  meetingNotes: z.string().optional().nullable(),
});
export type ScheduleExecutiveReviewInput = z.infer<typeof ScheduleExecutiveReviewSchema>;

export const UpdateExecutiveReviewSchema = z.object({
  plannedDate: z.string().datetime().optional(),
  conductedDate: z.string().datetime().optional().nullable(),
  status: z.enum(EXECUTIVE_REVIEW_STATUSES).optional(),
  meetingNotes: z.string().optional().nullable(),
  agreedSummary: z.string().optional().nullable(),
  nextReviewDate: z.string().datetime().optional().nullable(),
});
export type UpdateExecutiveReviewInput = z.infer<typeof UpdateExecutiveReviewSchema>;

export const RecordReviewCommitmentSchema = z.object({
  title: z.string().min(1, "Commitment title is required"),
  description: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  generateSuccessTask: z.boolean().default(true),
});
export type RecordReviewCommitmentInput = z.infer<typeof RecordReviewCommitmentSchema>;

export const CompleteExecutiveReviewSchema = z.object({
  agreedSummary: z.string().min(1, "Executive agreed summary is required"),
  nextReviewDate: z.string().datetime().optional().nullable(),
  meetingNotes: z.string().optional().nullable(),
});
export type CompleteExecutiveReviewInput = z.infer<typeof CompleteExecutiveReviewSchema>;

// ==========================================
// 3. PORTFOLIO DTO INTERFACES
// ==========================================

export interface StakeholderCoverageSummary {
  customerAccountId: string;
  totalContacts: number;
  mappedRolesCount: number;
  hasExecutiveSponsor: boolean;
  hasBusinessDecisionMaker: boolean;
  hasTechnicalDecisionMaker: boolean;
  hasChampion: boolean;
  isRecentlyVerified: boolean;
  isSingleThreaded: boolean;
  coverageStatus: RelationshipCoverageStatus;
  rolesBreakdown: Record<string, number>;
}

export interface PortfolioQueueItem {
  customerAccountId: string;
  accountName: string;
  accountSegment: AccountSegment;
  priorityLevel: PortfolioPriorityLevel;
  priorityScore: number;
  reasons: string[];
  ownerUserId?: string | null;
  overdueTasksCount: number;
  openBlockersCount: number;
  healthStatus?: string | null;
  renewalUrgency?: string | null;
  nextAction: string;
  evidenceRef: string;
}

export interface PortfolioOverviewMetrics {
  totalManagedAccounts: number;
  segmentDistribution: Record<AccountSegment, number>;
  priorityDistribution: Record<PortfolioPriorityLevel, number>;
  strategicAccountsCount: number;
  overdueReviewsCount: number;
  blockedObjectivesCount: number;
  singleThreadedAccountsCount: number;
  activePlansCount: number;
  atRiskObjectivesCount: number;
  priorityQueue: PortfolioQueueItem[];
}
