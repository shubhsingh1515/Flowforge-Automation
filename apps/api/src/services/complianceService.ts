import crypto from "crypto";
import { prisma, Prisma } from "@flowforge/database";
import { CreateComplianceExportInput } from "@flowforge/shared";
import { redactSensitiveData } from "./tracing.js";

export class ComplianceService {
  /**
   * Enterprise Multi-Dimensional Audit Search.
   */
  async searchAuditLogs(
    workspaceId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      actorId?: string;
      targetType?: string;
      action?: string;
      keyword?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.action) where.action = filters.action;

    const [total, logs] = await Promise.all([
      prisma.workspaceAuditLog.count({ where }),
      prisma.workspaceAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    // Redact any raw sensitive keys in metadata
    const sanitized = logs.map((log) => ({
      ...log,
      metadata: log.metadata ? redactSensitiveData(log.metadata) : null,
    }));

    return {
      data: sanitized,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Synthesizes an auditable, bounded compliance evidence export package.
   */
  async createComplianceExport(workspaceId: string, actorUserId: string, input: CreateComplianceExportInput) {
    const startStr = input.timeRangeStart || input.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const endStr = input.timeRangeEnd || input.endDate || new Date().toISOString();
    const start = new Date(startStr);
    const end = new Date(endStr);

    // Limit window to 90 days max per bounded export policy
    const maxWindowMs = 90 * 86400000;
    if (end.getTime() - start.getTime() > maxWindowMs) {
      const error: any = new Error("Export time window cannot exceed 90 days.");
      error.statusCode = 400;
      throw error;
    }

    // Gather records based on scope
    const [auditLogs, governancePolicy, reviews, releases] = await Promise.all([
      prisma.workspaceAuditLog.findMany({
        where: { workspaceId, createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.workspaceGovernancePolicy.findUnique({
        where: { workspaceId },
      }),
      prisma.workflowReview.findMany({
        where: { workspaceId, createdAt: { gte: start, lte: end } },
        include: { author: { select: { name: true, email: true } } },
      }),
      prisma.workflowReleaseArtifact.findMany({
        where: { workspaceId, createdAt: { gte: start, lte: end } },
        select: { id: true, releaseNumber: true, contentHash: true, summary: true, createdAt: true },
      }),
    ]);

    const evidencePackage: any = {
      complianceStandard: "SOC2-Type-II / ISO-27001 Evidence Manifest",
      workspaceId,
      exportedAt: new Date().toISOString(),
      evidenceMetadata: {
        reason: input.reason || "Auditor verification evidence export",
        requestedByUserId: actorUserId,
      },
      timeRange: { start: start.toISOString(), end: end.toISOString() },
      recordCounts: {
        auditLogs: auditLogs.length,
        reviews: reviews.length,
        releases: releases.length,
      },
      governancePolicy: governancePolicy || {},
      auditLogs: auditLogs.map((l) => redactSensitiveData(l)),
      collaborativeReviews: reviews,
      immutableReleases: releases,
    };

    const serialized = JSON.stringify(evidencePackage, null, 2);
    const integritySha256 = crypto.createHash("sha256").update(serialized).digest("hex");
    evidencePackage.integritySha256 = integritySha256;

    const downloadToken = "ffexp_" + crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 3600000); // 48-hour bounded expiry

    const job = await prisma.complianceExportJob.create({
      data: {
        workspaceId,
        requestedByUserId: actorUserId,
        scope: input.scope || "ALL",
        timeRangeStart: start,
        timeRangeEnd: end,
        status: "COMPLETED",
        downloadToken,
        fileSizeBytes: Buffer.byteLength(serialized, "utf8"),
        recordCount: auditLogs.length + reviews.length + releases.length,
        sanitizedPayload: evidencePackage,
        expiresAt,
        completedAt: new Date(),
      },
    });

    return {
      id: job.id,
      scope: job.scope,
      status: job.status,
      recordCount: job.recordCount,
      fileSizeBytes: job.fileSizeBytes,
      downloadToken: job.downloadToken,
      expiresAt: job.expiresAt,
    };
  }

  /**
   * Retrieves and downloads a compliance evidence package via authorized download token.
   */
  async getExportByToken(workspaceId: string, token: string) {
    const job = await prisma.complianceExportJob.findFirst({
      where: { workspaceId, downloadToken: token },
    });

    if (!job) {
      const error: any = new Error("Invalid or expired compliance export token.");
      error.statusCode = 404;
      throw error;
    }

    if (job.expiresAt && job.expiresAt < new Date()) {
      await prisma.complianceExportJob.update({
        where: { id: job.id },
        data: { status: "EXPIRED", sanitizedPayload: Prisma.JsonNull },
      });
      const error: any = new Error("This compliance export has expired.");
      error.statusCode = 410;
      throw error;
    }

    return job.sanitizedPayload;
  }

  /**
   * Lists compliance evidence export jobs for a workspace.
   */
  async listComplianceExports(workspaceId: string) {
    const jobs = await prisma.complianceExportJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workspaceId: true,
        scope: true,
        status: true,
        recordCount: true,
        fileSizeBytes: true,
        downloadToken: true,
        requestedByUserId: true,
        expiresAt: true,
        createdAt: true,
        sanitizedPayload: true,
      },
    });

    return jobs.map((j) => ({
      ...j,
      requestedAt: j.createdAt,
      reason:
        (j.sanitizedPayload as any)?.evidenceMetadata?.reason ||
        (j.sanitizedPayload as any)?.reason ||
        "Compliance Evidence Export",
    }));
  }
}

export const complianceService = new ComplianceService();
