import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { config } from "../config.js";
import { QueueHealthMetricsDto } from "@flowforge/shared";

export const QUEUE_NAME = "workflow-execution";
export const QUEUE_BACKPRESSURE_THRESHOLD = parseInt(
  process.env.QUEUE_BACKPRESSURE_THRESHOLD || "5000",
  10
);

// Redis connection instance
export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  versionId?: string | null;
  triggerPayload: any;
  correlationId: string;
  traceparent?: string;
  attempt?: number;
  resumeNodeId?: string;
}

export const workflowQueue = new Queue<WorkflowJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 5000,
    },
  },
});

/**
 * Checks whether the workflow queue depth exceeds safe backpressure thresholds.
 */
export async function checkQueueBackpressure(): Promise<{
  isBackpressureActive: boolean;
  waitingCount: number;
  threshold: number;
  retryAfterSeconds: number;
}> {
  try {
    const waitingCount = await workflowQueue.getWaitingCount();
    const isBackpressureActive = waitingCount >= QUEUE_BACKPRESSURE_THRESHOLD;
    return {
      isBackpressureActive,
      waitingCount,
      threshold: QUEUE_BACKPRESSURE_THRESHOLD,
      retryAfterSeconds: isBackpressureActive ? 30 : 0,
    };
  } catch (_e) {
    return {
      isBackpressureActive: false,
      waitingCount: 0,
      threshold: QUEUE_BACKPRESSURE_THRESHOLD,
      retryAfterSeconds: 0,
    };
  }
}

export async function enqueueWorkflowExecution(
  data: WorkflowJobData,
  enforceBackpressure = false
) {
  if (enforceBackpressure) {
    const bp = await checkQueueBackpressure();
    if (bp.isBackpressureActive) {
      const err: any = new Error(
        `Queue backpressure threshold reached (${bp.waitingCount} waiting >= ${bp.threshold}). Load shedding active.`
      );
      err.statusCode = 429;
      err.retryAfterSeconds = bp.retryAfterSeconds;
      throw err;
    }
  }

  const jobKey = data.resumeNodeId
    ? `job_${data.executionId}_resume_${Date.now()}`
    : `job_${data.executionId}_att_${data.attempt || 1}`;

  return workflowQueue.add(`exec_${data.executionId}`, data, {
    jobId: jobKey,
  });
}

export async function getQueueHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  redisStatus: string;
  metrics: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    oldestJobAgeSeconds: number;
  };
  details?: QueueHealthMetricsDto;
  backpressure?: {
    isBackpressureActive: boolean;
    threshold: number;
  };
  error?: string;
}> {
  try {
    const isConnected = redisConnection.status === "ready" || redisConnection.status === "connect";
    const [waiting, active, completed, failed, delayed, waitingJobs] = await Promise.all([
      workflowQueue.getWaitingCount(),
      workflowQueue.getActiveCount(),
      workflowQueue.getCompletedCount(),
      workflowQueue.getFailedCount(),
      workflowQueue.getDelayedCount(),
      workflowQueue.getWaiting(0, 0),
    ]);

    const oldestJob = waitingJobs && waitingJobs[0];
    const oldestJobAgeSeconds =
      oldestJob && oldestJob.timestamp
        ? Math.max(0, Math.round((Date.now() - oldestJob.timestamp) / 1000))
        : 0;

    const details: QueueHealthMetricsDto = {
      queueName: QUEUE_NAME,
      status: isConnected ? "healthy" : "degraded",
      waitingCount: waiting,
      activeCount: active,
      completedCount: completed,
      failedCount: failed,
      delayedCount: delayed,
      oldestJobAgeSeconds,
      workerCount: active > 0 ? 1 : 0,
      isPaused: await workflowQueue.isPaused(),
    };

    return {
      status: isConnected ? "healthy" : "degraded",
      redisStatus: redisConnection.status,
      metrics: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        oldestJobAgeSeconds,
      },
      details,
      backpressure: {
        isBackpressureActive: waiting >= QUEUE_BACKPRESSURE_THRESHOLD,
        threshold: QUEUE_BACKPRESSURE_THRESHOLD,
      },
    };
  } catch (err: any) {
    return {
      status: "unhealthy",
      redisStatus: redisConnection.status,
      metrics: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        oldestJobAgeSeconds: 0,
      },
      backpressure: {
        isBackpressureActive: false,
        threshold: QUEUE_BACKPRESSURE_THRESHOLD,
      },
      error: err.message,
    };
  }
}
