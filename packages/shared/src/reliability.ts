import { z } from "zod";

// ==========================================
// 1. TRANSACTIONAL OUTBOX SCHEMAS & DTOS
// ==========================================

export const OutboxStatusEnum = z.enum(["PENDING", "PROCESSING", "DELIVERED", "FAILED", "DEAD_LETTER"]);
export type OutboxStatus = z.infer<typeof OutboxStatusEnum>;

export interface TransactionalOutboxEventDto {
  id: string;
  workspaceId: string;
  eventType: string;
  payload: Record<string, any>;
  idempotencyKey: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface OutboxOverviewDto {
  pendingCount: number;
  processingCount: number;
  deliveredCount: number;
  deadLetterCount: number;
  oldestPendingAgeSeconds: number;
  recentEvents: TransactionalOutboxEventDto[];
}

export const ReplayOutboxSchema = z.object({
  eventIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ReplayOutboxInput = z.infer<typeof ReplayOutboxSchema>;

// ==========================================
// 2. BACKUP & DISASTER RECOVERY SCHEMAS & DTOS
// ==========================================

export const BackupStatusEnum = z.enum(["VERIFIED", "CORRUPTED", "RESTORE_FAILED"]);
export type BackupStatus = z.infer<typeof BackupStatusEnum>;

export interface BackupVerificationRecordDto {
  id: string;
  workspaceId: string | null;
  backupFileName: string;
  checksumSha256: string;
  fileSizeBytes: number | null;
  status: BackupStatus | string;
  isolatedTargetDb: string | null;
  restoredTableCount: number | null;
  verificationReport: Record<string, any> | null;
  verifiedAt: string;
  durationMs: number | null;
  errorMessage: string | null;
  triggeredByUserId: string | null;
  createdAt: string;
}

export const RunBackupVerificationSchema = z.object({
  backupFileName: z.string().optional(),
  isolatedDbName: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});
export type RunBackupVerificationInput = z.infer<typeof RunBackupVerificationSchema>;

// ==========================================
// 3. HIGH AVAILABILITY & RELIABILITY OVERVIEW
// ==========================================

export interface HAReliabilityOverviewDto {
  database: {
    status: string;
    latencyMs: number;
    poolAvailable: boolean;
  };
  redis: {
    status: string;
    persistence: string;
    connected: boolean;
  };
  queue: {
    depth: number;
    active: number;
    waiting: number;
    delayed: number;
    failed: number;
    backpressureActive: boolean;
    backpressureThreshold: number;
  };
  worker: {
    activeLeases: number;
    reconciledTimeoutCount: number;
    heartbeatHealthy: boolean;
    workerConcurrency: number;
  };
  outbox: OutboxOverviewDto;
  disasterRecovery: {
    lastBackupVerifiedAt: string | null;
    lastBackupStatus: string | null;
    lastBackupChecksum: string | null;
    rtoTargetSeconds: number;
    rpoTargetSeconds: number;
  };
}

// ==========================================
// 4. RECOVERY AUDIT SCHEMAS & DTOS
// ==========================================

export interface RecoveryAuditRecordDto {
  id: string;
  workspaceId: string | null;
  operationType: string;
  targetResource: string;
  operatorId: string | null;
  isDryRun: boolean;
  status: string;
  details: Record<string, any> | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}
