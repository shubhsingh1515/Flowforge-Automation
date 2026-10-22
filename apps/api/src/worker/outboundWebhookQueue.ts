import { Queue } from "bullmq";
import { redisConnection } from "./queue.js";

export const OUTBOUND_WEBHOOK_QUEUE = "outbound-webhooks";

export interface OutboundWebhookJobData {
  deliveryId: string;
  webhookId: string;
  workspaceId: string;
  eventType: string;
  payload: any;
  attempt?: number;
}

export const outboundWebhookQueue = new Queue<OutboundWebhookJobData>(OUTBOUND_WEBHOOK_QUEUE, {
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

export async function enqueueOutboundWebhook(data: OutboundWebhookJobData) {
  const jobKey = `wh_${data.deliveryId}_att_${data.attempt || 1}`;
  return outboundWebhookQueue.add(`deliver_${data.deliveryId}`, data, {
    jobId: jobKey,
  });
}
