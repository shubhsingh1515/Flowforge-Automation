import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { config } from "../config.js";
import { QueueHealthMetricsDto } from "@flowforge/shared";

export const QUEUE_NAME = "workflow-execution";

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

export async function enqueueWorkflowExecution(data: WorkflowJobData) {
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
    const oldestJobAgeSeconds = oldestJob && oldestJob.timestamp ? Math.max(0, Math.round((Date.now() - oldestJob.timestamp) / 1000)) : 0;

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
      error: err.message,
    };
  }
}
