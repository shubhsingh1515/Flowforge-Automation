import { z } from "zod";

// ==========================================
// 1. ENUMS & CONSTANTS
// ==========================================

export const INSIGHT_CATEGORIES = [
  "WORKFLOW_RELIABILITY_REGRESSION",
  "PROCESS_BOTTLENECK",
  "SLA_BREACH_RISK",
  "EVENT_DELIVERY_DEGRADATION",
  "DATA_QUALITY_DETERIORATION",
  "DATA_FRESHNESS_VIOLATION",
  "CONNECTOR_FAILURE_CONCENTRATION",
  "ANOMALOUS_EXECUTION_VOLUME",
] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const INSIGHT_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export const INSIGHT_STATUSES = ["OPEN", "ACKNOWLEDGED", "DISMISSED", "RESOLVED"] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export const DECISION_ACTION_TYPES = [
  "RETRY_WORKFLOW_EXECUTION",
  "REPLAY_EVENT_DELIVERY",
  "REFRESH_DATA_PIPELINE",
  "ADJUST_WORKER_CONCURRENCY",
  "TRIGGER_PROCESS_REVIEW",
  "CREATE_OPERATIONAL_INCIDENT",
  "RECOMMEND_CONFIGURATION_CHANGE",
] as const;

export type DecisionActionType = (typeof DECISION_ACTION_TYPES)[number];

export const DECISION_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
] as const;

export type DecisionProposalStatus = (typeof DECISION_STATUSES)[number];

export const FORECAST_TARGET_METRICS = [
  "PROCESS_SLA_BREACH_PROBABILITY",
  "EXPECTED_COMPLETION_TIME_MS",
  "QUEUE_BACKLOG",
  "EVENT_DELIVERY_DELAY_MS",
  "WORKFLOW_FAILURE_RISK",
] as const;

export type ForecastTargetMetric = (typeof FORECAST_TARGET_METRICS)[number];

export const FORECAST_METHODS = [
  "MOVING_AVERAGE",
  "HISTORICAL_PERCENTILE",
  "TREND_EXTRAPOLATION",
  "STATISTICAL_REGRESSION",
] as const;

export type ForecastMethod = (typeof FORECAST_METHODS)[number];

export const OUTCOME_VERDICTS = ["IMPROVED", "WORSENED", "NEUTRAL", "INSUFFICIENT_DATA"] as const;
export type OutcomeVerdict = (typeof OUTCOME_VERDICTS)[number];

// ==========================================
// 2. ZOD INPUT SCHEMAS
// ==========================================

export const CreateIntelligenceWorkspaceSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  businessQuestion: z.string().min(5).max(500),
  targetResources: z.array(z.string()).default([]),
  timeRangeHours: z.number().int().min(1).max(2160).default(168), // up to 90 days
});

export type CreateIntelligenceWorkspaceInput = z.infer<typeof CreateIntelligenceWorkspaceSchema>;

export const GenerateForecastSchema = z.object({
  targetMetric: z.enum(FORECAST_TARGET_METRICS),
  resourceType: z.enum(["WORKFLOW", "PROCESS", "EVENT", "DATA_PRODUCT", "QUEUE"]),
  resourceId: z.string().min(1),
  horizonHours: z.number().int().min(1).max(168).default(24),
  modelMethod: z.enum(FORECAST_METHODS).default("HISTORICAL_PERCENTILE"),
});

export type GenerateForecastInput = z.infer<typeof GenerateForecastSchema>;

export const StartInvestigationSchema = z.object({
  insightId: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  issueDescription: z.string().min(10).max(2000),
  resourceType: z.enum(["WORKFLOW", "PROCESS", "EVENT", "DATA_PRODUCT", "CONNECTOR"]).optional(),
  resourceId: z.string().optional(),
  timeRangeHours: z.number().int().min(1).max(720).default(48),
});

export type StartInvestigationInput = z.infer<typeof StartInvestigationSchema>;

export const CreateDecisionProposalSchema = z.object({
  intelligenceWorkspaceId: z.string().uuid().optional(),
  insightId: z.string().uuid().optional(),
  actionType: z.enum(DECISION_ACTION_TYPES),
  targetResourceType: z.string().min(1).max(50),
  targetResourceId: z.string().min(1).max(150),
  parameters: z.record(z.any()).default({}),
  rationale: z.string().min(10).max(1000),
  expectedBenefit: z.string().min(5).max(500),
  estimatedRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

export type CreateDecisionProposalInput = z.infer<typeof CreateDecisionProposalSchema>;

export const ApproveDecisionProposalSchema = z.object({
  comment: z.string().max(500).optional(),
  executeImmediately: z.boolean().default(true),
});

export type ApproveDecisionProposalInput = z.infer<typeof ApproveDecisionProposalSchema>;

export const RejectDecisionProposalSchema = z.object({
  reason: z.string().min(3).max(500),
});

export type RejectDecisionProposalInput = z.infer<typeof RejectDecisionProposalSchema>;

export const EvaluateOutcomeSchema = z.object({
  proposalId: z.string().uuid(),
  targetMetric: z.string().min(1),
  evaluationWindowMinutes: z.number().int().min(5).max(10080).default(60),
});

export type EvaluateOutcomeInput = z.infer<typeof EvaluateOutcomeSchema>;

export const UpdateIntelligencePolicySchema = z.object({
  autoApprovalRiskThreshold: z.enum(["NONE", "LOW"]).optional(),
  maxDailyDecisionExecutions: z.number().int().min(1).max(10000).optional(),
  allowedActionTypes: z.array(z.enum(DECISION_ACTION_TYPES)).optional(),
  requireSimulationForHighRisk: z.boolean().optional(),
  evidenceRetentionDays: z.number().int().min(7).max(365).optional(),
});

export type UpdateIntelligencePolicyInput = z.infer<typeof UpdateIntelligencePolicySchema>;

// ==========================================
// 3. DTOs
// ==========================================

export interface BusinessInsightDto {
  id: string;
  workspaceId: string;
  intelligenceWorkspaceId?: string | null;
  category: InsightCategory;
  severity: InsightSeverity;
  status: InsightStatus;
  title: string;
  summary: string;
  confidence: number;
  correlationKey: string;
  resourceType: string;
  resourceId: string;
  metricsData: Record<string, any>;
  evidenceReferences: any[];
  observationWindowStart: string;
  observationWindowEnd: string;
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  resolvedAt?: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForecastRunDto {
  id: string;
  workspaceId: string;
  intelligenceWorkspaceId?: string | null;
  targetMetric: ForecastTargetMetric;
  resourceType: string;
  resourceId: string;
  horizonHours: number;
  modelMethod: ForecastMethod;
  modelVersion: string;
  sampleCount: number;
  predictedValue: number;
  confidenceIntervalLower?: number | null;
  confidenceIntervalUpper?: number | null;
  status: string;
  actualValue?: number | null;
  evaluationError?: number | null;
  evaluatedAt?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface RootCauseInvestigationDto {
  id: string;
  workspaceId: string;
  intelligenceWorkspaceId?: string | null;
  insightId?: string | null;
  title: string;
  issueDescription: string;
  status: string;
  timeline: any[];
  candidateExplanations: any[];
  contradictoryEvidence?: any[] | null;
  missingEvidence?: any[] | null;
  confidenceScore: number;
  recommendedNextSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DecisionProposalDto {
  id: string;
  workspaceId: string;
  intelligenceWorkspaceId?: string | null;
  insightId?: string | null;
  actionType: DecisionActionType;
  targetResourceType: string;
  targetResourceId: string;
  parameters: Record<string, any>;
  rationale: string;
  expectedBenefit: string;
  estimatedRisk: string;
  confidence: number;
  preconditions?: any[] | null;
  simulationResult?: Record<string, any> | null;
  status: DecisionProposalStatus;
  requiredRole: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  rejectedById?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  expiresAt?: string | null;
  executionStartedAt?: string | null;
  executionCompletedAt?: string | null;
  executionResult?: Record<string, any> | null;
  executionError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionOutcomeEvaluationDto {
  id: string;
  workspaceId: string;
  proposalId: string;
  targetMetric: string;
  baselineValue: number;
  postActionValue: number;
  delta: number;
  outcomeVerdict: OutcomeVerdict;
  confidence: number;
  evaluationWindowMinutes: number;
  evaluatedAt: string;
}
