import crypto from "crypto";
import { Worker, Job } from "bullmq";
import { prisma } from "@flowforge/database";
import { OUTBOUND_WEBHOOK_QUEUE, OutboundWebhookJobData } from "./outboundWebhookQueue.js";
import { redisConnection } from "./queue.js";
import { validateUrlForSsrf } from "../engine/security/ssrf.js";

let outboundWorkerInstance: Worker<OutboundWebhookJobData> | null = null;

export function createOutboundWebhookWorker(concurrency = 5): Worker<OutboundWebhookJobData> {
  const worker = new Worker<OutboundWebhookJobData>(
    OUTBOUND_WEBHOOK_QUEUE,
    async (job: Job<OutboundWebhookJobData>) => {
      const { deliveryId, webhookId, eventType, payload } = job.data;
      const startTime = Date.now();

      const webhook = await prisma.outboundWebhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || !webhook.active) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "FAILED",
            errorMessage: webhook ? "Webhook is inactive." : "Webhook endpoint no longer exists.",
          },
        }).catch(() => {});
        return;
      }

      // 1. SSRF URL Security Validation
      const allowLocal = process.env.NODE_ENV === "test" || process.env.ALLOW_LOCAL_TEST_REQUESTS === "true";
      try {
        await validateUrlForSsrf(webhook.url, { allowLocalhostForTesting: allowLocal });
      } catch (err: any) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "FAILED",
            errorMessage: `SSRF Violation: ${err.message}`,
            durationMs: Date.now() - startTime,
          },
        }).catch(() => {});
        return; // Terminal failure - do not retry SSRF violations
      }

      // 2. Sign Payload with HMAC-SHA256
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(payload);
      const hmacHex = crypto
        .createHmac("sha256", webhook.secret)
        .update(`${timestamp}.${payloadString}`)
        .digest("hex");
      const signatureHeader = `t=${timestamp},v1=${hmacHex}`;

      // 3. Dispatch Outbound Request with Timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "FlowForge-Outbound-Webhook/1.0",
            "X-FlowForge-Event": eventType,
            "X-FlowForge-Delivery": deliveryId,
            "X-FlowForge-Timestamp": timestamp.toString(),
            "X-FlowForge-Signature": signatureHeader,
          },
          body: payloadString,
          signal: controller.signal,
          redirect: "error", // Prevent open redirects bypassing SSRF checks
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const rawText = await res.text().catch(() => "");
        const boundedBody = rawText.substring(0, 1024);

        if (res.ok) {
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: "SUCCESS",
              statusCode: res.status,
              responseBody: boundedBody,
              durationMs,
              deliveredAt: new Date(),
            },
          });
        } else {
          const attempt = job.attemptsMade + 1;
          const isFinal = attempt >= (job.opts.attempts || 3);

          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: isFinal ? "FAILED" : "PENDING",
              statusCode: res.status,
              responseBody: boundedBody,
              errorMessage: `Endpoint responded with status ${res.status}`,
              attempt,
              durationMs,
            },
          });

          if (!isFinal) {
            throw new Error(`Outbound webhook HTTP ${res.status} - scheduling retry`);
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const attempt = job.attemptsMade + 1;
        const isFinal = attempt >= (job.opts.attempts || 3);
        const errorMsg = err.name === "AbortError" ? "Request timed out after 5000ms" : err.message;

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: isFinal ? "FAILED" : "PENDING",
            errorMessage: errorMsg,
            attempt,
            durationMs,
          },
        }).catch(() => {});

        if (!isFinal) {
          throw err;
        }
      }
    },
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on("failed", (job, err) => {
    console.warn(`Outbound webhook delivery job failed: ${job?.id} - ${err.message}`);
  });

  return worker;
}

export function startOutboundWebhookWorker(concurrency = 5) {
  if (!outboundWorkerInstance) {
    outboundWorkerInstance = createOutboundWebhookWorker(concurrency);
    console.log(`⚡ Outbound webhook worker started (concurrency: ${concurrency})`);
  }
  return outboundWorkerInstance;
}

export async function stopOutboundWebhookWorker() {
  if (outboundWorkerInstance) {
    await outboundWorkerInstance.close();
    outboundWorkerInstance = null;
  }
}
