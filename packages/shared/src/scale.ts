import { z } from "zod";

// ==========================================
// PHASE 16: ENTERPRISE SCALE, REGION READINESS & CAPACITY MANAGEMENT
// ==========================================

export const SUPPORTED_REGIONS = ["us-east-1", "eu-central-1", "ap-southeast-1"] as const;
export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

export const PRIMARY_AUTHORITATIVE_REGION: SupportedRegion = "us-east-1";

export const DATA_RESIDENCY_ZONES = ["GLOBAL", "US", "EU", "APAC"] as const;
export type DataResidencyZone = (typeof DATA_RESIDENCY_ZONES)[number];

export const WORKLOAD_PRIORITIES = ["BATCH", "STANDARD", "HIGH_PRIORITY"] as const;
export type WorkloadPriority = (typeof WORKLOAD_PRIORITIES)[number];

export const REGION_STATUSES = ["HEALTHY", "DEGRADED", "EVACUATING", "STANDBY"] as const;
export type RegionStatus = (typeof REGION_STATUSES)[number];

export const RegionDeploymentConfigSchema = z.object({
  id: z.string(),
  regionKey: z.string(),
  regionName: z.string(),
  isAuthoritative: z.boolean(),
  status: z.enum(REGION_STATUSES),
  apiEndpoint: z.string().nullable().optional(),
  maxConnectionPool: z.number().int().default(50),
  queueBackpressureThreshold: z.number().int().default(5000),
  drainRatePerSec: z.number().nullable().optional(),
  activeTenantCount: z.number().int().default(0),
  currentEpoch: z.number().int().default(0),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RegionDeploymentConfigDTO = z.infer<typeof RegionDeploymentConfigSchema>;

export const CapacityMetricSampleSchema = z.object({
  id: z.string().optional(),
  regionKey: z.string().default("us-east-1"),
  queueDepth: z.number().int(),
  activeWorkers: z.number().int(),
  avgProcessingTimeMs: z.number(),
  projectedDrainTimeSec: z.number(),
  dbConnectionSaturation: z.number(),
  workerSaturation: z.number(),
  enqueueRatePerSec: z.number(),
  completionRatePerSec: z.number(),
  timestamp: z.date().or(z.string()).default(() => new Date().toISOString()),
});
export type CapacityMetricSampleDTO = z.infer<typeof CapacityMetricSampleSchema>;

export const NoisyNeighborDiagnosticSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  activeExecutions: z.number().int(),
  concurrencyLimit: z.number().int(),
  saturationRatio: z.number(),
  planTier: z.string(),
});
export type NoisyNeighborDiagnostic = z.infer<typeof NoisyNeighborDiagnosticSchema>;

export const CapacitySummarySchema = z.object({
  deploymentTier: z.literal("Tier A (Horizontally Scalable Single-Region) / Tier B (Region-Aware Readiness)"),
  authoritativeRegion: z.string(),
  activeReplicas: z.object({
    apiReplicas: z.number().int(),
    workerReplicas: z.number().int(),
  }),
  queueMetrics: z.object({
    waitingJobs: z.number().int(),
    activeJobs: z.number().int(),
    delayedJobs: z.number().int(),
    failedJobs: z.number().int(),
    oldestWaitingJobAgeSec: z.number(),
    enqueueRatePerSec: z.number(),
    completionRatePerSec: z.number(),
    projectedDrainTimeSec: z.number(),
  }),
  workerCapacity: z.object({
    totalCapacity: z.number().int(),
    allocatedConcurrency: z.number().int(),
    workerSaturationPercent: z.number(),
  }),
  dbConnectionBudget: z.object({
    maxConnections: z.number().int(),
    activeConnections: z.number().int(),
    poolSaturationPercent: z.number(),
    status: z.enum(["HEALTHY", "WARNING", "EXHAUSTED"]),
  }),
  backpressure: z.object({
    active: z.boolean(),
    status: z.enum(["NORMAL", "ELEVATED", "CRITICAL"]),
    reason: z.string().nullable().optional(),
    recommendedRetryAfterSec: z.number().int(),
  }),
  noisyNeighbors: z.array(NoisyNeighborDiagnosticSchema),
  regions: z.array(RegionDeploymentConfigSchema),
  timestamp: z.string(),
});
export type CapacitySummaryDTO = z.infer<typeof CapacitySummarySchema>;

export const RegionalFailoverDrillRequestSchema = z.object({
  sourceRegion: z.string(),
  targetRegion: z.string(),
  notes: z.string().max(500).optional(),
});
export type RegionalFailoverDrillRequest = z.infer<typeof RegionalFailoverDrillRequestSchema>;

export const RegionalPlacementUpdateSchema = z.object({
  homeRegion: z.enum(SUPPORTED_REGIONS).optional(),
  dataResidency: z.enum(DATA_RESIDENCY_ZONES).optional(),
  maxConcurrentExecutions: z.number().int().positive().max(100).nullable().optional(),
  workloadPriority: z.enum(WORKLOAD_PRIORITIES).optional(),
});
export type RegionalPlacementUpdate = z.infer<typeof RegionalPlacementUpdateSchema>;
