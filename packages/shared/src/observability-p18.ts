import { z } from "zod";

// ==========================================
// PHASE 18: OBSERVABILITY 2.0 & SELF-HEALING
// ==========================================

export const INCIDENT_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "MITIGATING",
  "RESOLVED",
  "CLOSED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_CATEGORIES = [
  "SLO_BREACH",
  "WORKER_FAILURE",
  "QUEUE_SATURATION",
  "INTEGRATION_ERROR",
  "OUTBOX_BACKLOG",
  "REGIONAL_DEGRADATION",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const REMEDIATION_AUTONOMY_MODES = [
  "OBSERVE_ONLY",
  "APPROVAL_REQUIRED",
  "POLICY_AUTOMATED",
] as const;
export type RemediationAutonomyMode = (typeof REMEDIATION_AUTONOMY_MODES)[number];

export const REMEDIATION_ACTION_KEYS = [
  "RETRY_RETRYABLE_EXECUTION",
  "REQUEUE_ABANDONED_JOB",
  "REPLAY_FAILED_OUTBOX_EVENT",
  "PAUSE_FAILING_DEPLOYMENT",
  "SCALE_CONCURRENCY_BACKPRESSURE",
] as const;
export type RemediationActionKey = (typeof REMEDIATION_ACTION_KEYS)[number];

export const REMEDIATION_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "VERIFIED",
  "UNVERIFIED",
] as const;
export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

export const REMEDIATION_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RemediationRiskLevel = (typeof REMEDIATION_RISK_LEVELS)[number];

export const CAPACITY_SIGNAL_TYPES = [
  "QUEUE_AGE_SPIKE",
  "DRAIN_TIME_DETERIORATION",
  "OUTBOX_ACCUMULATION",
  "WORKER_LEASE_SATURATION",
  "DB_POOL_PRESSURE",
] as const;
export type CapacitySignalType = (typeof CAPACITY_SIGNAL_TYPES)[number];

export const OperationalIncidentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(INCIDENT_STATUSES),
  category: z.enum(INCIDENT_CATEGORIES),
  sourceService: z.string(),
  correlationKey: z.string(),
  rootCauseSummary: z.string().nullable().optional(),
  candidateCauses: z.any().nullable().optional(),
  suggestedAction: z.string().nullable().optional(),
  affectedWorkflows: z.array(z.string()),
  affectedRegions: z.array(z.string()),
  assignedToUserId: z.string().nullable().optional(),
  acknowledgedAt: z.date().or(z.string()).nullable().optional(),
  resolvedAt: z.date().or(z.string()).nullable().optional(),
  closedAt: z.date().or(z.string()).nullable().optional(),
  metadata: z.any().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type OperationalIncidentDTO = z.infer<typeof OperationalIncidentSchema>;

export const UpdateIncidentStatusSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().max(1000).optional(),
});
export type UpdateIncidentStatusDTO = z.infer<typeof UpdateIncidentStatusSchema>;

export const AssignIncidentSchema = z.object({
  assignedToUserId: z.string().nullable(),
  note: z.string().max(1000).optional(),
});
export type AssignIncidentDTO = z.infer<typeof AssignIncidentSchema>;

export const AddIncidentNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});
export type AddIncidentNoteDTO = z.infer<typeof AddIncidentNoteSchema>;

export const RemediationPolicySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  autonomyMode: z.enum(REMEDIATION_AUTONOMY_MODES),
  allowedActions: z.array(z.string()),
  maxAutomatedActionsPerIncident: z.number().int().min(1).max(10),
  cooldownMinutes: z.number().int().min(1).max(1440),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RemediationPolicyDTO = z.infer<typeof RemediationPolicySchema>;

export const UpdateRemediationPolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  autonomyMode: z.enum(REMEDIATION_AUTONOMY_MODES).optional(),
  allowedActions: z.array(z.string()).optional(),
  maxAutomatedActionsPerIncident: z.number().int().min(1).max(10).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
});
export type UpdateRemediationPolicyDTO = z.infer<typeof UpdateRemediationPolicySchema>;

export const RemediationOperationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  incidentId: z.string().nullable().optional(),
  actionKey: z.enum(REMEDIATION_ACTION_KEYS),
  status: z.enum(REMEDIATION_STATUSES),
  riskLevel: z.enum(REMEDIATION_RISK_LEVELS),
  targetType: z.string(),
  targetId: z.string(),
  parameters: z.any().nullable().optional(),
  requestedByUserId: z.string().nullable().optional(),
  approvedByUserId: z.string().nullable().optional(),
  approvedAt: z.date().or(z.string()).nullable().optional(),
  executedAt: z.date().or(z.string()).nullable().optional(),
  verifiedAt: z.date().or(z.string()).nullable().optional(),
  resultSummary: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RemediationOperationDTO = z.infer<typeof RemediationOperationSchema>;

export const CreateRemediationSchema = z.object({
  incidentId: z.string().optional(),
  actionKey: z.enum(REMEDIATION_ACTION_KEYS),
  targetType: z.string(),
  targetId: z.string(),
  parameters: z.record(z.any()).optional().default({}),
});
export type CreateRemediationDTO = z.infer<typeof CreateRemediationSchema>;

export const ApproveRemediationSchema = z.object({
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type ApproveRemediationDTO = z.infer<typeof ApproveRemediationSchema>;

export const OperationalCapacityWarningSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable().optional(),
  regionKey: z.string(),
  signalType: z.enum(CAPACITY_SIGNAL_TYPES),
  severity: z.enum(["WARNING", "CRITICAL"]),
  currentValue: z.number(),
  baselineValue: z.number(),
  thresholdValue: z.number(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT_DATA"]),
  recommendation: z.string(),
  isResolved: z.boolean(),
  createdAt: z.date().or(z.string()),
  resolvedAt: z.date().or(z.string()).nullable().optional(),
});
export type OperationalCapacityWarningDTO = z.infer<typeof OperationalCapacityWarningSchema>;

export const UnifiedHealthSummarySchema = z.object({
  overallStatus: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
  timestamp: z.string(),
  services: z.object({
    workers: z.object({
      status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
      activeWorkers: z.number(),
      heartbeatFreshnessSec: z.number(),
    }),
    queues: z.object({
      status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
      depth: z.number(),
      projectedDrainTimeSec: z.number(),
      oldestJobAgeSec: z.number(),
    }),
    executionEngine: z.object({
      status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
      successRate24h: z.number(),
      p95DurationMs: z.number(),
    }),
    outbox: z.object({
      status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
      pendingCount: z.number(),
      deadLetterCount: z.number(),
    }),
    database: z.object({
      status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]),
      connectionSaturationPct: z.number(),
    }),
    regions: z.object({
      authoritativeRegion: z.string(),
      activeFailoverEpoch: z.number(),
      multiRegionReady: z.boolean(),
    }),
  }),
  activeIncidentCount: z.number(),
  sloAttainmentPct: z.number(),
  activeWarningsCount: z.number(),
});
export type UnifiedHealthSummaryDTO = z.infer<typeof UnifiedHealthSummarySchema>;
