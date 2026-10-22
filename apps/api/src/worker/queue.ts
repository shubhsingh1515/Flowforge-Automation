import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { config } from "../config.js";

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
  attempt?: number;
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
  return workflowQueue.add(`exec_${data.executionId}`, data, {
    jobId: `job_${data.executionId}_att_${data.attempt || 1}`,
  });
}

export async function getQueueHealth() {
  try {
    const isConnected = redisConnection.status === "ready" || redisConnection.status === "connect";
    const [waiting, active, completed, failed] = await Promise.all([
      workflowQueue.getWaitingCount(),
      workflowQueue.getActiveCount(),
      workflowQueue.getCompletedCount(),
      workflowQueue.getFailedCount(),
    ]);

    return {
      status: isConnected ? "healthy" : "degraded",
      redisStatus: redisConnection.status,
      metrics: {
        waiting,
        active,
        completed,
        failed,
      },
    };
  } catch (err: any) {
    return {
      status: "unhealthy",
      error: err.message,
    };
  }
}
