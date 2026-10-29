import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateFeedbackThemeInput,
  ClassifyFeedbackInput,
  ReviewClassificationInput,
  FeedbackCategory,
  SentimentValue,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

const DEFAULT_THEMES = [
  { name: "Workflow Reliability", slug: "workflow-reliability", category: "WORKFLOW_RELIABILITY", description: "Failures, retries, and execution stability." },
  { name: "Canvas Usability", slug: "canvas-usability", category: "PRODUCT_USABILITY", description: "UI builder, drag-and-drop, and navigation friction." },
  { name: "Integration Quality", slug: "integration-quality", category: "INTEGRATION_QUALITY", description: "Third-party connector limits, authentication, and payload mapping." },
  { name: "System Performance", slug: "system-performance", category: "PERFORMANCE", description: "Latency, throughput, and execution delays." },
  { name: "Onboarding Experience", slug: "onboarding-experience", category: "ONBOARDING", description: "Initial setup, template cloning, and team invitation." },
  { name: "Support Responsiveness", slug: "support-responsiveness", category: "SUPPORT_EXPERIENCE", description: "Help desk speed, diagnostic clarity, and ticketing." },
];

export class VoiceOfCustomerService {
  /**
   * Seeds default themes if none exist in the workspace.
   */
  public async ensureDefaultThemes(workspaceId: string) {
    const count = await prisma.customerFeedbackTheme.count({ where: { workspaceId } });
    if (count === 0) {
      for (const t of DEFAULT_THEMES) {
        await prisma.customerFeedbackTheme.create({
          data: {
            workspaceId,
            name: t.name,
            slug: t.slug,
            category: t.category,
            description: t.description,
            status: "ACTIVE",
          },
        });
      }
    }
  }

  /**
   * Lists themes in the workspace.
   */
  public async listThemes(workspaceId: string) {
    await this.ensureDefaultThemes(workspaceId);
    return prisma.customerFeedbackTheme.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { classifications: true } },
      },
    });
  }

  /**
   * Creates a new VoC theme.
   */
  public async createTheme(workspaceId: string, input: CreateFeedbackThemeInput, actorUserId?: string) {
    const existing = await prisma.customerFeedbackTheme.findFirst({
      where: { workspaceId, slug: input.slug },
    });
    if (existing) {
      throw new HttpError(409, `Theme with slug '${input.slug}' already exists.`);
    }

    const theme = await prisma.customerFeedbackTheme.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug,
        category: input.category,
        description: input.description,
        status: "ACTIVE",
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "VOC_THEME_CREATED",
      entityType: "CustomerFeedbackTheme",
      entityId: theme.id,
      metadata: { description: `VoC Theme '${theme.name}' created.` },
    });

    return theme;
  }

  /**
   * Deterministically classifies customer feedback text.
   */
  public async classifyFeedback(
    workspaceId: string,
    feedbackId: string,
    input?: Partial<ClassifyFeedbackInput>,
    actorUserId?: string
  ) {
    const feedback = await prisma.customerFeedbackRecord.findFirst({
      where: { id: feedbackId, workspaceId },
    });
    if (!feedback) {
      throw new HttpError(404, `Feedback record '${feedbackId}' not found.`);
    }

    // Determine classification: either provided or keyword matched
    let themeName = input?.themeName;
    let category: FeedbackCategory = input?.category || (feedback.category as FeedbackCategory);
    let sentiment: SentimentValue = input?.sentiment || "NEUTRAL";
    let method = input?.classificationMethod || "DETERMINISTIC_RULE";

    if (!themeName) {
      const lowerText = feedback.rawText.toLowerCase();

      if (/broken|crash|error|failure|bug|down|timed out|disconnect/i.test(lowerText)) {
        themeName = "Workflow Reliability";
        category = "WORKFLOW_RELIABILITY";
        sentiment = "NEGATIVE";
      } else if (/slow|lag|delay|latency|taking too long|performance/i.test(lowerText)) {
        themeName = "System Performance";
        category = "PERFORMANCE";
        sentiment = "NEGATIVE";
      } else if (/confusing|clunky|hard to use|navigation|cannot find|ui/i.test(lowerText)) {
        themeName = "Canvas Usability";
        category = "PRODUCT_USABILITY";
        sentiment = "NEGATIVE";
      } else if (/love|great|smooth|fast|excellent|helpful|awesome|easy/i.test(lowerText)) {
        themeName = "Canvas Usability";
        category = "PRODUCT_USABILITY";
        sentiment = "POSITIVE";
      } else if (/integration|connector|salesforce|webhook|api/i.test(lowerText)) {
        themeName = "Integration Quality";
        category = "INTEGRATION_QUALITY";
        sentiment = "NEUTRAL";
      } else {
        themeName = "General Usability";
        category = "PRODUCT_USABILITY";
        sentiment = "NEUTRAL";
      }
    }

    // Match theme record if available
    const themeRecord = await prisma.customerFeedbackTheme.findFirst({
      where: { workspaceId, name: { equals: themeName, mode: "insensitive" } },
    });

    const classification = await prisma.customerFeedbackClassification.create({
      data: {
        workspaceId,
        feedbackId: feedback.id,
        themeId: themeRecord?.id,
        themeName,
        category,
        sentiment,
        classificationMethod: method,
        confidenceScore: input?.confidenceScore ?? 0.85,
        reviewStatus: "PROPOSED",
      },
      include: {
        theme: true,
      },
    });

    return classification;
  }

  /**
   * Human review queue confirmation or correction.
   */
  public async reviewClassification(
    workspaceId: string,
    classificationId: string,
    userId: string,
    input: ReviewClassificationInput
  ) {
    const classification = await prisma.customerFeedbackClassification.findFirst({
      where: { id: classificationId, workspaceId },
      include: { feedback: true },
    });
    if (!classification) {
      throw new HttpError(404, `Classification '${classificationId}' not found.`);
    }

    const updated = await prisma.customerFeedbackClassification.update({
      where: { id: classification.id },
      data: {
        reviewStatus: input.reviewStatus,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        ...(input.correctedThemeName ? { themeName: input.correctedThemeName } : {}),
        ...(input.correctedCategory ? { category: input.correctedCategory } : {}),
        ...(input.correctedSentiment ? { sentiment: input.correctedSentiment } : {}),
        ...(input.correctionReason ? { correctionReason: input.correctionReason } : {}),
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "FEEDBACK_CLASSIFICATION_REVIEWED",
      entityType: "CustomerFeedbackClassification",
      entityId: classification.id,
      metadata: { description: `Classification reviewed: ${input.reviewStatus} by ${userId}.` },
    });

    return updated;
  }

  /**
   * Retrieves theme analytics and frequency breakdown.
   */
  public async getThemeAnalytics(workspaceId: string, windowDays: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    const classifications = await prisma.customerFeedbackClassification.findMany({
      where: {
        workspaceId,
        createdAt: { gte: startDate },
      },
      include: {
        feedback: { select: { customerAccountId: true } },
      },
    });

    const themeMap = new Map<string, { count: number; accounts: Set<string>; positive: number; negative: number; neutral: number }>();

    for (const c of classifications) {
      const entry = themeMap.get(c.themeName) || {
        count: 0,
        accounts: new Set<string>(),
        positive: 0,
        negative: 0,
        neutral: 0,
      };

      entry.count++;
      if (c.feedback?.customerAccountId) entry.accounts.add(c.feedback.customerAccountId);
      if (c.sentiment === "POSITIVE") entry.positive++;
      else if (c.sentiment === "NEGATIVE") entry.negative++;
      else entry.neutral++;

      themeMap.set(c.themeName, entry);
    }

    const themes = Array.from(themeMap.entries()).map(([name, data]) => ({
      themeName: name,
      feedbackCount: data.count,
      affectedAccountsCount: data.accounts.size,
      sentimentDistribution: {
        positive: data.positive,
        negative: data.negative,
        neutral: data.neutral,
      },
    }));

    themes.sort((a, b) => b.feedbackCount - a.feedbackCount);

    return {
      windowDays,
      totalClassifications: classifications.length,
      themes,
    };
  }
}

export const voiceOfCustomerService = new VoiceOfCustomerService();
