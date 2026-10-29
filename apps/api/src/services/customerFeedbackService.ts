import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateFeedbackRecordInput,
  UpdateFeedbackStatusInput,
  ResolveFeedbackInput,
  FeedbackFilter,
  ALLOWED_FEEDBACK_TRANSITIONS,
  FeedbackStatus,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerFeedbackService {
  /**
   * Generates a sequential feedback number for the workspace.
   */
  private async generateFeedbackNumber(workspaceId: string): Promise<string> {
    const count = await prisma.customerFeedbackRecord.count({ where: { workspaceId } });
    return `FB-${String(count + 1001).padStart(5, "0")}`;
  }

  /**
   * Redacts basic PII/secrets from raw feedback text.
   */
  private redactFeedback(text: string): string {
    return text
      .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[EMAIL]")
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]")
      .replace(/\b(bearer\s+[a-zA-Z0-9_\-.]+)\b/gi, "[SECRET]")
      .replace(/\b(sk_[a-zA-Z0-9_\-]+)\b/g, "[API_KEY]");
  }

  /**
   * Creates a durable, tenant-isolated feedback record.
   */
  public async createFeedback(workspaceId: string, input: CreateFeedbackRecordInput, actorUserId?: string) {
    // 1. Verify customer account belongs to workspace
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    // 2. Verify contact if provided
    if (input.contactId) {
      const contact = await prisma.customerContact.findFirst({
        where: { id: input.contactId, customerAccountId: input.customerAccountId, workspaceId },
      });
      if (!contact) {
        throw new HttpError(404, `Customer contact '${input.contactId}' not found for account.`);
      }
    }

    // 3. Prevent duplicate imports using idempotencyKey
    if (input.idempotencyKey) {
      const existing = await prisma.customerFeedbackRecord.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return existing;
      }
    }

    const feedbackNumber = await this.generateFeedbackNumber(workspaceId);
    const redactedText = input.redactedText || this.redactFeedback(input.rawText);

    const feedback = await prisma.customerFeedbackRecord.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        contactId: input.contactId,
        feedbackNumber,
        source: input.source,
        category: input.category,
        feedbackType: input.feedbackType,
        rawText: input.rawText,
        redactedText,
        submissionTimestamp: input.submissionTimestamp ? new Date(input.submissionTimestamp) : new Date(),
        relatedWorkflowId: input.relatedWorkflowId,
        relatedIntegrationId: input.relatedIntegrationId,
        relatedJourneyStage: input.relatedJourneyStage,
        relatedObjectiveId: input.relatedObjectiveId,
        relatedIncidentId: input.relatedIncidentId,
        relatedExecutionId: input.relatedExecutionId,
        sourceSystem: input.sourceSystem || "flowforge",
        externalRecordId: input.externalRecordId,
        idempotencyKey: input.idempotencyKey,
        consentContext: input.consentContext || {},
        dataClassification: input.dataClassification || "INTERNAL",
        status: "RECEIVED",
      },
      include: {
        customerAccount: {
          select: { id: true, name: true, slug: true, tier: true },
        },
        contact: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "CUSTOMER_FEEDBACK_RECORDED",
      entityType: "CustomerFeedbackRecord",
      entityId: feedback.id,
      metadata: { description: `Customer feedback ${feedback.feedbackNumber} recorded for ${account.name}` },
    });

    return feedback;
  }

  /**
   * Lists customer feedback records with filtering and pagination.
   */
  public async listFeedback(workspaceId: string, filters: FeedbackFilter) {
    const where: any = { workspaceId };

    if (filters.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters.source) where.source = filters.source;
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;

    if (filters.sentiment) {
      where.classifications = {
        some: { sentiment: filters.sentiment },
      };
    }

    if (filters.search) {
      where.OR = [
        { feedbackNumber: { contains: filters.search, mode: "insensitive" } },
        { rawText: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.customerFeedbackRecord.count({ where }),
      prisma.customerFeedbackRecord.findMany({
        where,
        take: filters.limit || 50,
        skip: filters.offset || 0,
        orderBy: { submissionTimestamp: "desc" },
        include: {
          customerAccount: {
            select: { id: true, name: true, slug: true, tier: true, healthStatus: true },
          },
          contact: {
            select: { id: true, name: true, email: true, role: true },
          },
          classifications: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          issueLinks: {
            include: {
              issue: {
                select: { id: true, issueNumber: true, title: true, severity: true, status: true },
              },
            },
          },
        },
      }),
    ]);

    return { total, records };
  }

  /**
   * Retrieves single feedback record.
   */
  public async getFeedback(workspaceId: string, id: string) {
    const record = await prisma.customerFeedbackRecord.findFirst({
      where: { id, workspaceId },
      include: {
        customerAccount: true,
        contact: true,
        classifications: {
          include: { theme: true },
          orderBy: { createdAt: "desc" },
        },
        issueLinks: {
          include: {
            issue: true,
          },
        },
        duplicates: true,
        duplicateOf: true,
      },
    });

    if (!record) {
      throw new HttpError(404, `Customer feedback record '${id}' not found.`);
    }

    return record;
  }

  /**
   * Updates feedback status enforcing valid lifecycle transitions.
   */
  public async updateStatus(workspaceId: string, id: string, input: UpdateFeedbackStatusInput, actorUserId?: string) {
    const record = await this.getFeedback(workspaceId, id);

    const allowed = ALLOWED_FEEDBACK_TRANSITIONS[record.status as FeedbackStatus] || [];
    if (!allowed.includes(input.status as FeedbackStatus) && record.status !== input.status) {
      throw new HttpError(
        400,
        `Invalid status transition from '${record.status}' to '${input.status}'. Allowed: ${allowed.join(", ")}`
      );
    }

    const updated = await prisma.customerFeedbackRecord.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.category ? { category: input.category } : {}),
      },
      include: {
        customerAccount: true,
        classifications: true,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "CUSTOMER_FEEDBACK_STATUS_UPDATED",
      entityType: "CustomerFeedbackRecord",
      entityId: id,
      metadata: { description: `Feedback ${record.feedbackNumber} transitioned from ${record.status} to ${input.status}` },
    });

    return updated;
  }

  /**
   * Resolves a feedback record with accountable evidence.
   */
  public async resolveFeedback(
    workspaceId: string,
    id: string,
    userId: string,
    input: ResolveFeedbackInput
  ) {
    const record = await this.getFeedback(workspaceId, id);

    const updated = await prisma.customerFeedbackRecord.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolutionSummary: input.resolutionSummary,
        resolutionEvidence: input.resolutionEvidence || {},
        resolvedByUserId: userId,
        resolvedAt: new Date(),
      },
      include: {
        customerAccount: true,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "CUSTOMER_FEEDBACK_RESOLVED",
      entityType: "CustomerFeedbackRecord",
      entityId: id,
      metadata: { description: `Feedback ${record.feedbackNumber} resolved with verified evidence.` },
    });

    return updated;
  }

  /**
   * Links a feedback record as a duplicate of an existing master feedback record.
   */
  public async linkDuplicate(workspaceId: string, id: string, duplicateOfId: string, actorUserId?: string) {
    if (id === duplicateOfId) {
      throw new HttpError(400, "Cannot link a feedback record as a duplicate of itself.");
    }

    const [current, targetMaster] = await Promise.all([
      this.getFeedback(workspaceId, id),
      this.getFeedback(workspaceId, duplicateOfId),
    ]);

    const updated = await prisma.customerFeedbackRecord.update({
      where: { id },
      data: {
        linkedDuplicateOfId: targetMaster.id,
        status: "CLOSED",
        resolutionSummary: `Marked as duplicate of ${targetMaster.feedbackNumber}`,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "CUSTOMER_FEEDBACK_DUPLICATE_LINKED",
      entityType: "CustomerFeedbackRecord",
      entityId: id,
      metadata: { description: `Feedback ${current.feedbackNumber} marked as duplicate of ${targetMaster.feedbackNumber}` },
    });

    return updated;
  }
}

export const customerFeedbackService = new CustomerFeedbackService();
