import { prisma } from "@flowforge/database";
import { CustomerFeedbackInput, SupportBundleRequestInput, PublicStatusOverviewDto } from "@flowforge/shared";
import { redactSensitiveData } from "./tracing.js";
import { auditLogService } from "./auditLog.js";
import { redisConnection } from "../worker/queue.js";

export class SupportService {
  async generateSupportBundle(
    workspaceId: string,
    requestedByUserId: string,
    input?: SupportBundleRequestInput
  ) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscription: true,
        workflows: {
          select: {
            id: true,
            name: true,
            status: true,
            triggerType: true,
            createdAt: true,
          },
        },
        connectedAccounts: {
          select: {
            id: true,
            integrationKey: true,
            status: true,
            lastVerifiedAt: true,
            createdAt: true,
            // Credentials EXCLUDED strictly
          },
        },
        outboundWebhooks: {
          select: {
            id: true,
            name: true,
            url: true,
            active: true,
            events: true,
            createdAt: true,
            // Secret EXCLUDED strictly
          },
        },
      },
    });

    if (!workspace) throw new Error("Workspace not found");

    // Fetch recent failed executions (up to 15)
    const failedExecutions = await prisma.workflowExecution.findMany({
      where: {
        workflow: { workspaceId },
        status: "FAILED",
      },
      select: {
        id: true,
        workflowId: true,
        status: true,
        errorCategory: true,
        errorSummary: true,
        durationMs: true,
        startedAt: true,
        finishedAt: true,
        diagnostics: true,
        timeline: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    // Recent outbound webhook delivery failures
    const failedDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        workspaceId,
        status: "FAILED",
      },
      select: {
        id: true,
        webhookId: true,
        eventType: true,
        statusCode: true,
        errorMessage: true,
        attempt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const rawBundle = {
      appVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        planTier: workspace.subscription?.planTier || "FREE",
        subscriptionStatus: workspace.subscription?.status || "ACTIVE",
        createdAt: workspace.createdAt.toISOString(),
      },
      diagnostics: {
        workflowCount: workspace.workflows.length,
        workflows: workspace.workflows,
        connectedAccounts: workspace.connectedAccounts,
        outboundWebhooks: workspace.outboundWebhooks,
        recentFailedExecutions: failedExecutions,
        recentWebhookFailures: failedDeliveries,
      },
      userNotes: input?.notes || null,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    // Scrub any potential residual sensitive keys recursively
    const sanitizedBundle = redactSensitiveData(rawBundle);
    const payloadStr = JSON.stringify(sanitizedBundle);
    const sizeBytes = Buffer.byteLength(payloadStr, "utf8");

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

    const bundle = await prisma.supportBundle.create({
      data: {
        workspaceId,
        requestedByUserId,
        status: "COMPLETED",
        summary: `Support diagnostics bundle for ${workspace.name} (${workspace.workflows.length} workflows, ${failedExecutions.length} recent failures)`,
        payload: sanitizedBundle as any,
        sizeBytes,
        expiresAt,
      },
    });

    // Record audit event
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: requestedByUserId,
      action: "SUPPORT_BUNDLE_GENERATED",
      targetType: "SUPPORT_BUNDLE",
      targetId: bundle.id,
      metadata: { sizeBytes, expiresAt },
    });

    return {
      id: bundle.id,
      workspaceId: bundle.workspaceId,
      status: bundle.status,
      summary: bundle.summary,
      sizeBytes: bundle.sizeBytes,
      expiresAt: bundle.expiresAt.toISOString(),
      createdAt: bundle.createdAt.toISOString(),
      downloadUrl: `/api/v1/support/bundle/${bundle.id}/download`,
    };
  }

  async getSupportBundle(workspaceId: string, bundleId: string) {
    const bundle = await prisma.supportBundle.findUnique({
      where: { id: bundleId },
    });

    if (!bundle || bundle.workspaceId !== workspaceId) {
      throw new Error("Support bundle not found or access denied");
    }

    if (new Date() > bundle.expiresAt) {
      throw new Error("This support bundle has expired");
    }

    return bundle.payload;
  }

  async submitFeedback(
    workspaceId: string,
    userId: string,
    input: CustomerFeedbackInput
  ) {
    // Rate limit: max 50 submissions per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSubmissions = await prisma.customerFeedback.count({
      where: {
        workspaceId,
        userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentSubmissions >= 50) {
      throw new Error("Feedback submission limit reached (max 50 per hour). Please try again later.");
    }

    const record = await prisma.customerFeedback.create({
      data: {
        workspaceId,
        userId,
        category: input.category,
        rating: input.rating || null,
        comment: input.comment.trim(),
        contactEmail: input.contactEmail || null,
        metadata: input.metadata || {},
      },
    });

    return {
      success: true,
      feedbackId: record.id,
      message: "Thank you for your feedback! The engineering team will review it shortly.",
    };
  }

  async getPublicStatus(): Promise<PublicStatusOverviewDto> {
    let dbStatus: "OPERATIONAL" | "DEGRADED" = "OPERATIONAL";
    let redisStatus: "OPERATIONAL" | "DEGRADED" = "OPERATIONAL";

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "DEGRADED";
    }

    try {
      const pong = await redisConnection.ping();
      if (pong !== "PONG") redisStatus = "DEGRADED";
    } catch {
      redisStatus = "DEGRADED";
    }

    const overallStatus: "OPERATIONAL" | "DEGRADED" =
      dbStatus === "OPERATIONAL" && redisStatus === "OPERATIONAL" ? "OPERATIONAL" : "DEGRADED";

    return {
      status: overallStatus,
      updatedAt: new Date().toISOString(),
      services: {
        workflowEngine: overallStatus,
        database: dbStatus,
        queueSystem: redisStatus,
        webhooks: overallStatus,
        apiGateway: "OPERATIONAL",
      },
      uptimeLast30DaysPercent: 99.98,
      activeIncidents: [],
    };
  }
}

export const supportService = new SupportService();
