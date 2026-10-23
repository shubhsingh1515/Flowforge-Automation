import { z } from "zod";

// ==========================================
// OBSERVABILITY & DIAGNOSTICS
// ==========================================

export type TimelineMilestoneType =
  | "QUEUED"
  | "STARTED"
  | "NODE_STARTED"
  | "NODE_COMPLETED"
  | "WAITING_APPROVAL"
  | "APPROVAL_RESOLVED"
  | "RETRY_SCHEDULED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface DiagnosticMilestone {
  id: string;
  type: TimelineMilestoneType;
  timestamp: string;
  durationMs?: number;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  attempt?: number;
  details?: Record<string, any>;
}

export interface FailureSummary {
  failingNodeId?: string;
  failingNodeName?: string;
  errorCategory: string;
  errorMessage: string;
  isRetryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  suggestedAction: string;
}

export interface ExecutionDiagnosticsDto {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  correlationId: string | null;
  traceparent: string | null;
  attempt: number;
  maxAttempts: number;
  milestones: DiagnosticMilestone[];
  failureSummary?: FailureSummary | null;
  steps: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: string;
    attempt: number;
    durationMs: number | null;
    errorCategory: string | null;
    errorMessage: string | null;
    inputData: any;
    outputData: any;
    startedAt: string;
    finishedAt: string | null;
  }>;
}

// ==========================================
// QUEUE & RELIABILITY METRICS
// ==========================================

export interface QueueHealthMetricsDto {
  queueName: string;
  status: "healthy" | "degraded" | "unhealthy";
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  delayedCount: number;
  oldestJobAgeSeconds: number;
  workerCount: number;
  isPaused: boolean;
}

export const ReconciliationRequestSchema = z.object({
  mode: z.enum(["dry-run", "execute"]).default("dry-run"),
  maxAgeMinutes: z.number().int().min(5).max(1440).default(15),
  limit: z.number().int().min(1).max(500).default(50),
});

export type ReconciliationRequestInput = z.infer<typeof ReconciliationRequestSchema>;

export interface ReconciliationAnomaly {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  minutesInStatus: number;
  reason: string;
  proposedAction: "MARK_FAILED_TIMEOUT" | "RETRY" | "CANCEL" | "CRASH_RECOVERY_RESUME";
}

export interface ReconciliationResultDto {
  mode: "dry-run" | "execute";
  scannedCount: number;
  anomaliesFound: number;
  reconciledCount: number;
  anomalies: ReconciliationAnomaly[];
  durationMs: number;
}

// ==========================================
// OPERATIONAL OVERVIEW & ALERTS
// ==========================================

export interface OperationalAlertDto {
  id: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  triggeredAt: string;
}

export interface OperationalOverviewDto {
  systemStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  uptimeSeconds: number;
  environment: string;
  database: {
    status: "healthy" | "unhealthy";
    poolConnected: boolean;
    latencyMs: number;
  };
  redis: {
    status: "healthy" | "unhealthy";
    latencyMs: number;
  };
  queue: QueueHealthMetricsDto;
  executions: {
    lastHourTotal: number;
    lastHourSuccess: number;
    lastHourFailed: number;
    failureRatePercent: number;
    averageDurationMs: number;
  };
  activeAlerts: OperationalAlertDto[];
}
