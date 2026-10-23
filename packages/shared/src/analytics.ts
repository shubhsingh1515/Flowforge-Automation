import { z } from "zod";

// ==========================================
// 1. PRODUCT ANALYTICS SCHEMAS & TYPES
// ==========================================

export const AnalyticsTimeRangeSchema = z.enum(["24h", "7d", "30d", "90d", "custom"]).default("7d");
export type AnalyticsTimeRange = z.infer<typeof AnalyticsTimeRangeSchema>;

export const AnalyticsQuerySchema = z.object({
  timeRange: AnalyticsTimeRangeSchema.default("7d"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  workflowId: z.string().uuid().optional(),
  status: z.enum(["SUCCESS", "FAILED", "CANCELLED", "RUNNING", "ALL"]).optional(),
  errorCategory: z.string().optional(),
});

export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>;

export interface DurationPercentiles {
  p50: number; // Median duration in ms
  p90: number; // 90th percentile duration in ms
  p99: number; // 99th percentile duration in ms
}

export interface VolumeDataPoint {
  bucket: string;       // e.g. "2026-10-23 02:00" or "2026-10-23"
  timestamp: string;
  total: number;
  success: number;
  failed: number;
}

export interface TopErrorCategory {
  category: string;
  count: number;
  percentage: number;
}

export interface MostExecutedWorkflow {
  workflowId: string;
  workflowName: string;
  count: number;
  successRate: number;
}

export interface RepeatedFailureWorkflow {
  workflowId: string;
  workflowName: string;
  failureCount: number;
  lastErrorCategory: string;
  lastFailedAt: string;
}

export interface IntegrationFailureMetric {
  nodeType: string;
  errorCount: number;
}

export interface WorkflowAnalyticsOverview {
  timeRange: AnalyticsTimeRange;
  startTime: string;
  endTime: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  runningExecutions: number;
  successRatePercent: number;
  failureRatePercent: number;
  durationPercentiles: DurationPercentiles;
  volumeOverTime: VolumeDataPoint[];
  topErrorCategories: TopErrorCategory[];
  mostExecutedWorkflows: MostExecutedWorkflow[];
  repeatedFailureWorkflows: RepeatedFailureWorkflow[];
  integrationFailures: IntegrationFailureMetric[];
  currentCycleUsage: {
    consumed: number;
    allowance: number;
    percentUsed: number;
  };
  trendVsPreviousPeriod: {
    executionsChangePercent: number;
    successRateChangePercent: number;
  };
}

// ==========================================
// 2. USAGE INTELLIGENCE & FORECASTING SCHEMAS
// ==========================================

export const UsageAlertConfigSchema = z.object({
  threshold50: z.boolean().default(true),
  threshold80: z.boolean().default(true),
  threshold90: z.boolean().default(true),
  threshold100: z.boolean().default(true),
  notifyEmail: z.boolean().default(true),
  notifyInApp: z.boolean().default(true),
});

export type UsageAlertConfigInput = z.infer<typeof UsageAlertConfigSchema>;

export interface UsageForecastDto {
  billingPeriodStart: string;
  billingPeriodEnd: string;
  daysElapsed: number;
  daysTotal: number;
  currentConsumption: number;
  planAllowance: number;
  percentUsed: number;
  burnRatePerDay: number;
  projectedPeriodEndTotal: number;
  projectedPercentOfAllowance: number;
  isProjectedToExceed: number; // 0 if safe, percentage over allowance if exceeding
  forecastConfidence: "HIGH" | "MEDIUM" | "INSUFFICIENT_DATA";
  explanation: string;
  dailyUsageHistory: Array<{ date: string; quantity: number }>;
}

// ==========================================
// 3. IN-APP NOTIFICATIONS SCHEMAS & TYPES
// ==========================================

export const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  read: z.preprocess((val) => (val === "true" ? true : val === "false" ? false : undefined), z.boolean().optional()),
  category: z.enum(["info", "warning", "error", "success"]).optional(),
});

export type NotificationQueryInput = z.infer<typeof NotificationQuerySchema>;

export interface NotificationDto {
  id: string;
  workspaceId: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  category: "info" | "warning" | "error" | "success";
  read: boolean;
  readAt?: string | null;
  metadata?: any;
  createdAt: string;
}

// ==========================================
// 4. CUSTOMER FEEDBACK SCHEMAS
// ==========================================

export const CustomerFeedbackSchema = z.object({
  category: z.enum(["BUG", "FEATURE_REQUEST", "USABILITY", "GENERAL"]),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().min(5).max(3000),
  contactEmail: z.string().email().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CustomerFeedbackInput = z.infer<typeof CustomerFeedbackSchema>;

// ==========================================
// 5. SUPPORT DIAGNOSTICS BUNDLE SCHEMAS
// ==========================================

export const SupportBundleRequestSchema = z.object({
  includeExecutionIds: z.array(z.string()).max(20).optional(),
  notes: z.string().max(500).optional(),
});

export type SupportBundleRequestInput = z.infer<typeof SupportBundleRequestSchema>;

export interface SupportBundleDto {
  id: string;
  workspaceId: string;
  workspaceName: string;
  status: string;
  summary: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
  downloadUrl: string;
}

// ==========================================
// 6. PUBLIC SYSTEM STATUS OVERVIEW
// ==========================================

export interface PublicStatusOverviewDto {
  status: "OPERATIONAL" | "DEGRADED" | "MAINTENANCE";
  updatedAt: string;
  services: {
    workflowEngine: "OPERATIONAL" | "DEGRADED";
    database: "OPERATIONAL" | "DEGRADED";
    queueSystem: "OPERATIONAL" | "DEGRADED";
    webhooks: "OPERATIONAL" | "DEGRADED";
    apiGateway: "OPERATIONAL" | "DEGRADED";
  };
  uptimeLast30DaysPercent: number;
  activeIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    startedAt: string;
    status: string;
  }>;
}
