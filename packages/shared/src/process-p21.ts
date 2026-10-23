import { z } from "zod";

// ==========================================
// PROCESS DOMAINS, CRITICALITY & STATES
// ==========================================

export type ProcessBusinessDomain =
  | "OPERATIONS"
  | "FINANCE"
  | "SALES"
  | "CUSTOMER_SUCCESS"
  | "ENGINEERING"
  | "HR"
  | "SECURITY";

export type ProcessCriticality = "LOW" | "MEDIUM" | "HIGH" | "MISSION_CRITICAL";

export type ProcessLifecycleStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";

export type BusinessProcessInstanceStatus =
  | "CREATED"
  | "IN_PROGRESS"
  | "WAITING"
  | "AT_RISK"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ProcessEventType =
  | "MILESTONE_STARTED"
  | "MILESTONE_COMPLETED"
  | "MILESTONE_FAILED"
  | "MILESTONE_SKIPPED"
  | "APPROVAL_WAITING"
  | "OUTCOME_RECORDED";

export type ProcessSlaStatus = "MET" | "AT_RISK" | "BREACHED" | "INSUFFICIENT_DATA";

// ==========================================
// PROCESS DEFINITIONS & VERSIONS
// ==========================================

export interface ProcessMilestone {
  id: string;
  name: string;
  workflowId: string;
  releaseArtifactId?: string;
  order: number;
  isEntry?: boolean;
  isTerminal?: boolean;
  expectedDurationMs?: number;
  requiredApprovals?: number;
}

export interface ProcessCorrelationRule {
  milestoneId: string;
  correlationField: string; // e.g. "orderId", "customerId", "ticketId"
  sourceType: "TRIGGER" | "STEP_OUTPUT" | "METADATA";
  nodeId?: string;
}

export interface ProcessOutcomeMapping {
  name: string; // e.g. "CUSTOMER_ONBOARDED", "ORDER_FULFILLED", "PAYMENT_REJECTED"
  milestoneId: string;
  condition: {
    field: string;
    operator: "EQUALS" | "EXISTS" | "NOT_EQUALS";
    value?: any;
  };
  isSuccess: boolean;
}

export const CreateProcessDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-_]+$/, "Slug must contain only lowercase alphanumeric, dashes, or underscores"),
  description: z.string().max(500).optional(),
  businessDomain: z.enum(["OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"]).default("OPERATIONS"),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"]).default("MEDIUM"),
  ownerUserId: z.string().uuid().optional(),
  owningTeamId: z.string().uuid().optional(),
  escalationContact: z.string().max(150).optional(),
  milestones: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    workflowId: z.string().uuid(),
    releaseArtifactId: z.string().uuid().optional(),
    order: z.number().int().min(1),
    isEntry: z.boolean().optional(),
    isTerminal: z.boolean().optional(),
    expectedDurationMs: z.number().int().positive().optional(),
    requiredApprovals: z.number().int().min(0).optional(),
  })).min(1, "A business process requires at least one milestone workflow mapping"),
  correlationRules: z.array(z.object({
    milestoneId: z.string().min(1),
    correlationField: z.string().min(1),
    sourceType: z.enum(["TRIGGER", "STEP_OUTPUT", "METADATA"]).default("TRIGGER"),
    nodeId: z.string().optional(),
  })).default([]),
  outcomeMappings: z.array(z.object({
    name: z.string().min(1),
    milestoneId: z.string().min(1),
    condition: z.object({
      field: z.string().min(1),
      operator: z.enum(["EQUALS", "EXISTS", "NOT_EQUALS"]),
      value: z.any().optional(),
    }),
    isSuccess: z.boolean().default(true),
  })).default([]),
  targetSlaDurationMs: z.number().int().positive().optional(),
});

export type CreateProcessDefinitionInput = z.infer<typeof CreateProcessDefinitionSchema>;

export const UpdateProcessDefinitionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  businessDomain: z.enum(["OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"]).optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"]).optional(),
  lifecycleStatus: z.enum(["DRAFT", "ACTIVE", "DEPRECATED", "ARCHIVED"]).optional(),
  ownerUserId: z.string().uuid().optional(),
  owningTeamId: z.string().uuid().optional(),
  escalationContact: z.string().max(150).optional(),
});

export type UpdateProcessDefinitionInput = z.infer<typeof UpdateProcessDefinitionSchema>;

// ==========================================
// PROCESS INSTANCE & EVENT INGESTION
// ==========================================

export const IngestProcessEventSchema = z.object({
  processDefinitionId: z.string().uuid(),
  correlationKey: z.string().min(1).max(150),
  milestoneId: z.string().min(1),
  eventType: z.enum([
    "MILESTONE_STARTED",
    "MILESTONE_COMPLETED",
    "MILESTONE_FAILED",
    "MILESTONE_SKIPPED",
    "APPROVAL_WAITING",
    "OUTCOME_RECORDED",
  ]),
  workflowId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  stepId: z.string().optional(),
  durationMs: z.number().int().min(0).optional(),
  errorCategory: z.string().optional(),
  details: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional(),
});

export type IngestProcessEventInput = z.infer<typeof IngestProcessEventSchema>;

// ==========================================
// PROCESS MINING & ANALYTICS
// ==========================================

export interface ProcessObservedPath {
  path: string[]; // e.g. ["Order Placed", "Invoice Formatted", "Payment Charged"]
  frequency: number;
  percentage: number;
  averageDurationMs: number;
  reworkRate: number;
}

export interface MilestoneMiningStats {
  milestoneId: string;
  name: string;
  visitCount: number;
  medianDurationMs: number;
  p95DurationMs: number;
  failureRate: number;
  waitingForApprovalMs: number;
  waitingForExternalMs: number;
  reworkCount: number;
}

export interface ProcessMiningBottleneck {
  milestoneId: string;
  name: string;
  reason: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  impactMs: number;
}

export interface ProcessOptimizationRecommendation {
  id: string;
  processDefinitionId: string;
  milestoneId: string;
  title: string;
  evidence: string;
  sampleSize: number;
  measuredBaselineMs: number;
  proposedAction: string;
  expectedBenefit: string;
  riskAssessment: string;
  confidence: number;
  safeToApply: boolean;
}

export interface ProcessMiningResult {
  processDefinitionId: string;
  instancesExamined: number;
  timeRangeDays: number;
  eventCompleteness: number; // 0.0 - 1.0
  dataSufficiency: "SUFFICIENT" | "INSUFFICIENT_DATA";
  observedPaths: ProcessObservedPath[];
  milestoneStats: MilestoneMiningStats[];
  bottlenecks: ProcessMiningBottleneck[];
  recommendations: ProcessOptimizationRecommendation[];
}

export interface ProcessMetricsSummary {
  processDefinitionId: string;
  totalInstances: number;
  activeInstances: number;
  completedInstances: number;
  failedInstances: number;
  cancelledInstances: number;
  completionRate: number;
  failureRate: number;
  medianDurationMs: number;
  p90DurationMs: number;
  p95DurationMs: number;
  approvalWaitDurationMs: number;
  externalWaitDurationMs: number;
  deadlineAttainmentRate: number;
  outcomesRecorded: Record<string, number>;
  timeRangeDays: number;
}

// ==========================================
// PROCESS SLA & DEADLINE MANAGEMENT
// ==========================================

export const CreateProcessSlaPolicySchema = z.object({
  processDefinitionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  targetDurationMs: z.number().int().positive(),
  warningThresholdMs: z.number().int().positive(),
  maxApprovalWaitMs: z.number().int().positive().optional(),
});

export type CreateProcessSlaPolicyInput = z.infer<typeof CreateProcessSlaPolicySchema>;

export interface ProcessSlaEvaluationResult {
  instanceId: string;
  correlationKey: string;
  processDefinitionId: string;
  processName: string;
  status: ProcessSlaStatus;
  elapsedMs: number;
  targetMs: number;
  isBreached: boolean;
  isAtRisk: boolean;
  incidentCreated?: boolean;
}
