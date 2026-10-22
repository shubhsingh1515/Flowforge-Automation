import { FastifyInstance } from "fastify";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { enqueueWorkflowExecution } from "../worker/queue.js";
import * as crypto from "node:crypto";
import { z } from "zod";

function verifyHmacSignature(rawBody: string, secret: string, signatureHeader?: string): boolean {
  if (!signatureHeader) return false;
  try {
    const computed = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function webhookRoutes(server: FastifyInstance) {
  // Webhook ingestion endpoint
  server.post("/webhooks/:slug", {
    schema: {
      tags: ["Webhooks"],
      summary: "Ingest incoming external webhook event for an active workflow",
      params: z.object({ slug: z.string() }),
    },
    handler: async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const rawPayload = request.body || {};
      const headersRecord: Record<string, any> = {};

      for (const [k, v] of Object.entries(request.headers)) {
        headersRecord[k] = v;
      }

      // 1. Locate Workflow by webhookSlug
      const workflow = await prisma.workflow.findUnique({
        where: { webhookSlug: slug },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      if (!workflow) {
        return reply.status(404).send({
          error: "Not Found",
          message: `No workflow registered for webhook endpoint "${slug}".`,
          statusCode: 404,
        });
      }

      // 2. Validate Workflow Status is ACTIVE
      if (workflow.status !== "ACTIVE") {
        return reply.status(409).send({
          error: "Conflict",
          message: `Workflow "${workflow.name}" is currently ${workflow.status}. Please activate the workflow to receive live webhook events.`,
          statusCode: 409,
        });
      }

      // 3. Optional HMAC Signature Verification
      if (workflow.webhookSecret) {
        const sigHeader =
          (request.headers["x-hub-signature-256"] as string) ||
          (request.headers["x-signature"] as string) ||
          (request.headers["x-webhook-signature"] as string);

        const rawBodyString = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
        const isValidSig = verifyHmacSignature(rawBodyString, workflow.webhookSecret, sigHeader);

        if (!isValidSig) {
          return reply.status(401).send({
            error: "Unauthorized",
            message: "Invalid HMAC signature header. Verification failed.",
            statusCode: 401,
          });
        }
      }

      // 4. Extract or Generate Event ID for Deduplication
      const explicitEventId =
        (request.headers["x-event-id"] as string) ||
        (request.headers["x-request-id"] as string) ||
        (rawPayload as any)?.event_id ||
        (rawPayload as any)?.id ||
        (rawPayload as any)?.eventId;

      let eventId = explicitEventId ? String(explicitEventId) : null;
      if (!eventId) {
        // Fallback: Generate deterministic hash from payload + timestamp window (5s) to catch duplicate bursts
        const hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(rawPayload) + Math.floor(Date.now() / 5000))
          .digest("hex");
        eventId = `evt_${hash.substring(0, 16)}`;
      }

      // 5. Deduplication check
      const existingReceipt = await prisma.webhookEventReceipt.findUnique({
        where: {
          workflowId_eventId: {
            workflowId: workflow.id,
            eventId,
          },
        },
      });

      if (existingReceipt) {
        return reply.status(200).send({
          status: "duplicate",
          received: true,
          eventId,
          message: "Duplicate event detected and safely ignored.",
          executionId: existingReceipt.executionId,
        });
      }

      // 6. Create Execution and Event Receipt Transactionally
      const correlationId = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sourceIp = request.ip || (request.headers["x-forwarded-for"] as string) || "unknown";

      const triggerPayload = {
        headers: headersRecord,
        body: rawPayload,
        query: request.query || {},
        method: request.method,
        eventId,
        receivedAt: new Date().toISOString(),
      };

      const [execution, _receipt] = await prisma.$transaction([
        prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            versionId: workflow.versions[0]?.id || null,
            status: ExecutionStatus.PENDING,
            correlationId,
            triggerEvent: triggerPayload as any,
          },
        }),
        prisma.webhookEventReceipt.create({
          data: {
            workflowId: workflow.id,
            eventId,
            sourceIp,
            headers: headersRecord as any,
            payload: rawPayload as any,
          },
        }),
      ]);

      // Link execution ID to receipt
      await prisma.webhookEventReceipt.update({
        where: { workflowId_eventId: { workflowId: workflow.id, eventId } },
        data: { executionId: execution.id },
      });

      // 7. Enqueue in BullMQ Background Queue
      await enqueueWorkflowExecution({
        executionId: execution.id,
        workflowId: workflow.id,
        versionId: workflow.versions[0]?.id || null,
        triggerPayload,
        correlationId,
      });

      return reply.status(202).send({
        status: "queued",
        executionId: execution.id,
        workflowId: workflow.id,
        eventId,
        correlationId,
        receivedAt: new Date().toISOString(),
      });
    },
  });
}
