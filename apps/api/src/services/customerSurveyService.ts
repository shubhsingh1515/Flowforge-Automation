import crypto from "crypto";
import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateSurveyDefinitionInput,
  UpdateSurveyDefinitionInput,
  CreateSurveyVersionInput,
  DeliverSurveyInput,
  SubmitSurveyResponseInput,
  PublicSurveyResponseInput,
} from "@flowforge/shared";
import { customerFeedbackService } from "./customerFeedbackService.js";
import { auditLogService } from "./auditLog.js";

export class CustomerSurveyService {
  /**
   * Hashes a secure token for lookup.
   */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Classifies primary score into categorical sentiment/score classification.
   */
  private classifyScore(surveyType: string, score?: number): string | null {
    if (score === undefined || score === null) return null;

    if (surveyType === "NPS") {
      if (score >= 9) return "PROMOTER";
      if (score >= 7) return "PASSIVE";
      return "DETRACTOR";
    }

    if (surveyType === "CSAT") {
      if (score >= 4) return "SATISFIED";
      if (score === 3) return "NEUTRAL";
      return "DISSATISFIED";
    }

    if (surveyType === "CES") {
      if (score >= 5) return "LOW_EFFORT";
      if (score === 4) return "MODERATE_EFFORT";
      return "HIGH_EFFORT";
    }

    return "COMPLETED";
  }

  /**
   * Creates a survey definition and publishes Version 1.
   */
  public async createDefinition(workspaceId: string, input: CreateSurveyDefinitionInput, actorUserId?: string) {
    const existing = await prisma.customerSurveyDefinition.findFirst({
      where: { workspaceId, slug: input.slug },
    });
    if (existing) {
      throw new HttpError(409, `Survey definition with slug '${input.slug}' already exists.`);
    }

    const definition = await prisma.customerSurveyDefinition.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        surveyType: input.surveyType,
        status: "ACTIVE",
        targetingRules: input.targetingRules || {},
        consentRequirements: input.consentRequirements || {},
        cooldownDays: input.cooldownDays || 30,
        currentVersionNumber: 1,
        versions: {
          create: {
            workspaceId,
            versionNumber: 1,
            isPublished: true,
            publishedAt: new Date(),
            publishedByUserId: actorUserId,
            title: input.title,
            introText: input.introText,
            thankYouText: input.thankYouText,
            questionsJson: input.initialQuestions as any,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "SURVEY_DEFINITION_CREATED",
      entityType: "CustomerSurveyDefinition",
      entityId: definition.id,
      metadata: { description: `Survey '${definition.name}' (${definition.surveyType}) created and published v1.` },
    });

    return definition;
  }

  /**
   * Lists survey definitions for workspace.
   */
  public async listDefinitions(workspaceId: string) {
    return prisma.customerSurveyDefinition.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
        _count: {
          select: {
            deliveries: true,
            responses: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves a survey definition by ID or slug.
   */
  public async getDefinition(workspaceId: string, idOrSlug: string) {
    const survey = await prisma.customerSurveyDefinition.findFirst({
      where: {
        workspaceId,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
        },
        _count: {
          select: { deliveries: true, responses: true },
        },
      },
    });

    if (!survey) {
      throw new HttpError(404, `Survey definition '${idOrSlug}' not found.`);
    }

    return survey;
  }

  /**
   * Updates definition metadata (without altering published versions).
   */
  public async updateDefinition(workspaceId: string, id: string, input: UpdateSurveyDefinitionInput, actorUserId?: string) {
    const survey = await this.getDefinition(workspaceId, id);

    const updated = await prisma.customerSurveyDefinition.update({
      where: { id: survey.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.targetingRules ? { targetingRules: input.targetingRules } : {}),
        ...(input.consentRequirements ? { consentRequirements: input.consentRequirements } : {}),
        ...(input.cooldownDays ? { cooldownDays: input.cooldownDays } : {}),
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "SURVEY_DEFINITION_UPDATED",
      entityType: "CustomerSurveyDefinition",
      entityId: survey.id,
      metadata: { description: `Survey '${survey.name}' updated.` },
    });

    return updated;
  }

  /**
   * Creates an immutable new survey version.
   */
  public async createVersion(
    workspaceId: string,
    definitionId: string,
    userId: string,
    input: CreateSurveyVersionInput
  ) {
    const survey = await this.getDefinition(workspaceId, definitionId);
    const nextVersionNumber = survey.currentVersionNumber + 1;

    const version = await prisma.customerSurveyVersion.create({
      data: {
        workspaceId,
        surveyDefinitionId: survey.id,
        versionNumber: nextVersionNumber,
        isPublished: input.publishImmediately || false,
        publishedAt: input.publishImmediately ? new Date() : null,
        publishedByUserId: input.publishImmediately ? userId : null,
        title: input.title,
        introText: input.introText,
        thankYouText: input.thankYouText,
        questionsJson: input.questionsJson as any,
      },
    });

    if (input.publishImmediately) {
      await prisma.customerSurveyDefinition.update({
        where: { id: survey.id },
        data: { currentVersionNumber: nextVersionNumber, status: "ACTIVE" },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "SURVEY_VERSION_CREATED",
      entityType: "CustomerSurveyVersion",
      entityId: version.id,
      metadata: { description: `Survey '${survey.name}' created version ${nextVersionNumber} (published: ${input.publishImmediately}).` },
    });

    return version;
  }

  /**
   * Publishes an existing survey version immutably.
   */
  public async publishVersion(workspaceId: string, definitionId: string, versionNumber: number, userId: string) {
    const survey = await this.getDefinition(workspaceId, definitionId);

    const version = await prisma.customerSurveyVersion.findUnique({
      where: {
        surveyDefinitionId_versionNumber: {
          surveyDefinitionId: survey.id,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new HttpError(404, `Survey version ${versionNumber} not found for survey '${survey.name}'.`);
    }

    const updatedVersion = await prisma.customerSurveyVersion.update({
      where: { id: version.id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        publishedByUserId: userId,
      },
    });

    await prisma.customerSurveyDefinition.update({
      where: { id: survey.id },
      data: {
        currentVersionNumber: versionNumber,
        status: "ACTIVE",
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "SURVEY_VERSION_PUBLISHED",
      entityType: "CustomerSurveyVersion",
      entityId: version.id,
      metadata: { description: `Survey '${survey.name}' published version ${versionNumber}.` },
    });

    return updatedVersion;
  }

  /**
   * Delivers a survey to an account / contact, enforcing consent and cooldown rules.
   */
  public async deliverSurvey(workspaceId: string, input: DeliverSurveyInput, actorUserId?: string) {
    // 1. Verify account
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);
    }

    // 2. Verify survey definition and active published version
    const survey = await this.getDefinition(workspaceId, input.surveyDefinitionId);
    if (survey.status !== "ACTIVE") {
      throw new HttpError(400, `Survey '${survey.name}' is not currently active.`);
    }

    const latestPublishedVersion = await prisma.customerSurveyVersion.findFirst({
      where: {
        surveyDefinitionId: survey.id,
        isPublished: true,
      },
      orderBy: { versionNumber: "desc" },
    });
    if (!latestPublishedVersion) {
      throw new HttpError(400, `Survey '${survey.name}' does not have an active published version.`);
    }

    // 3. Verify Contact & Consent Safeguard
    let recipientEmail = input.recipientEmail;
    if (input.contactId) {
      const contact = await prisma.customerContact.findFirst({
        where: { id: input.contactId, customerAccountId: input.customerAccountId, workspaceId },
      });
      if (!contact) {
        throw new HttpError(404, `Contact '${input.contactId}' not found for customer account.`);
      }

      if (contact.consentStatus === "OPTED_OUT") {
        throw new HttpError(
          403,
          `Cannot send survey: Contact '${contact.email}' has explicitly opted out of communications.`
        );
      }
      recipientEmail = contact.email;

      // 4. Cooldown Enforcement: check if survey sent within cooldown period
      const cooldownDate = new Date();
      cooldownDate.setDate(cooldownDate.getDate() - survey.cooldownDays);

      const recentDelivery = await prisma.customerSurveyDelivery.findFirst({
        where: {
          workspaceId,
          surveyDefinitionId: survey.id,
          contactId: contact.id,
          sentAt: { gte: cooldownDate },
          status: { in: ["SENT", "DELIVERED", "OPENED", "RESPONDED"] },
        },
      });

      if (recentDelivery) {
        throw new HttpError(
          429,
          `Survey cooldown in effect: Contact was already surveyed on ${recentDelivery.sentAt.toISOString().slice(0, 10)}. Cooldown is ${survey.cooldownDays} days.`
        );
      }
    }

    // 5. Idempotency Check
    if (input.idempotencyKey) {
      const existing = await prisma.customerSurveyDelivery.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        return {
          delivery: existing,
          token: "[IDEMPOTENT_EXISTING_RECORD]",
        };
      }
    }

    // 6. Generate Opaque Secure Token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const secureTokenHash = this.hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (input.expirationDays || 14));

    const delivery = await prisma.customerSurveyDelivery.create({
      data: {
        workspaceId,
        surveyDefinitionId: survey.id,
        surveyVersionId: latestPublishedVersion.id,
        customerAccountId: account.id,
        contactId: input.contactId,
        channel: input.channel,
        recipientEmail,
        status: "SENT",
        secureTokenHash,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        sentAt: new Date(),
      },
      include: {
        customerAccount: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, email: true } },
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "SURVEY_DELIVERED",
      entityType: "CustomerSurveyDelivery",
      entityId: delivery.id,
      metadata: { description: `Survey '${survey.name}' delivered to ${recipientEmail || account.name} (channel: ${input.channel}).` },
    });

    return {
      delivery,
      token: rawToken, // Return once to caller for URL dispatch
    };
  }

  /**
   * Submits an authenticated or system survey response.
   */
  public async submitResponse(
    workspaceId: string,
    surveyDefinitionId: string,
    input: SubmitSurveyResponseInput,
    actorUserId?: string
  ) {
    const survey = await this.getDefinition(workspaceId, surveyDefinitionId);

    const latestPublishedVersion = await prisma.customerSurveyVersion.findFirst({
      where: { surveyDefinitionId: survey.id, isPublished: true },
      orderBy: { versionNumber: "desc" },
    });
    if (!latestPublishedVersion) {
      throw new HttpError(400, "Survey does not have an active published version.");
    }

    const scoreClassification = this.classifyScore(survey.surveyType, input.primaryScore);

    const response = await prisma.customerSurveyResponse.create({
      data: {
        workspaceId,
        surveyDefinitionId: survey.id,
        surveyVersionId: latestPublishedVersion.id,
        surveyDeliveryId: input.surveyDeliveryId,
        customerAccountId: input.customerAccountId,
        contactId: input.contactId,
        primaryScore: input.primaryScore,
        scoreClassification,
        freeTextFeedback: input.freeTextFeedback,
        answersJson: input.answersJson || {},
        submittedAt: new Date(),
        isVerified: true,
      },
      include: {
        customerAccount: true,
        contact: true,
      },
    });

    // If delivery is linked, update delivery status
    if (input.surveyDeliveryId) {
      await prisma.customerSurveyDelivery.update({
        where: { id: input.surveyDeliveryId },
        data: {
          status: "RESPONDED",
          respondedAt: new Date(),
        },
      });
    }

    // Closed-Loop: Materialize CustomerFeedbackRecord if freeText is provided
    if (input.freeTextFeedback && input.freeTextFeedback.trim().length > 0) {
      let feedbackType: any = "UNSOLICITED_FEEDBACK";
      if (survey.surveyType === "NPS") feedbackType = "NPS_COMMENT";
      else if (survey.surveyType === "CSAT") feedbackType = "CSAT_COMMENT";
      else if (survey.surveyType === "CES") feedbackType = "CES_COMMENT";

      await customerFeedbackService.createFeedback(
        workspaceId,
        {
          customerAccountId: input.customerAccountId,
          contactId: input.contactId,
          source: "SURVEY",
          category: "PRODUCT_USABILITY",
          feedbackType,
          rawText: input.freeTextFeedback,
          sourceSystem: `survey:${survey.slug}`,
          externalRecordId: response.id,
        },
        actorUserId
      );
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId,
      action: "SURVEY_RESPONSE_RECORDED",
      entityType: "CustomerSurveyResponse",
      entityId: response.id,
      metadata: { description: `Response recorded for survey '${survey.name}' with score ${input.primaryScore ?? "N/A"}.` },
    });

    return response;
  }

  /**
   * Validates token and processes public survey submission without leaking internal data.
   */
  public async submitPublicResponse(input: PublicSurveyResponseInput) {
    const tokenHash = this.hashToken(input.token);

    const delivery = await prisma.customerSurveyDelivery.findUnique({
      where: { secureTokenHash: tokenHash },
      include: {
        surveyDefinition: true,
      },
    });

    if (!delivery) {
      throw new HttpError(404, "Invalid or unrecognized survey response token.");
    }

    if (delivery.status === "RESPONDED") {
      throw new HttpError(409, "This survey invitation has already been completed.");
    }

    if (new Date() > delivery.expiresAt) {
      await prisma.customerSurveyDelivery.update({
        where: { id: delivery.id },
        data: { status: "EXPIRED" },
      });
      throw new HttpError(410, "This survey link has expired.");
    }

    return this.submitResponse(
      delivery.workspaceId,
      delivery.surveyDefinitionId,
      {
        surveyDeliveryId: delivery.id,
        customerAccountId: delivery.customerAccountId,
        contactId: delivery.contactId || undefined,
        primaryScore: input.primaryScore,
        freeTextFeedback: input.freeTextFeedback,
        answersJson: input.answersJson,
      }
    );
  }

  /**
   * Lists survey responses for workspace.
   */
  public async listResponses(workspaceId: string, filters?: { surveyDefinitionId?: string; customerAccountId?: string }) {
    const where: any = { workspaceId };
    if (filters?.surveyDefinitionId) where.surveyDefinitionId = filters.surveyDefinitionId;
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;

    return prisma.customerSurveyResponse.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: 100,
      include: {
        surveyDefinition: { select: { id: true, name: true, slug: true, surveyType: true } },
        customerAccount: { select: { id: true, name: true, slug: true } },
        contact: { select: { id: true, name: true, email: true } },
      },
    });
  }
}

export const customerSurveyService = new CustomerSurveyService();
