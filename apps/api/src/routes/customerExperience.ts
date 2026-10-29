import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest } from "../plugins/auth.js";
import { customerFeedbackService } from "../services/customerFeedbackService.js";
import { customerSurveyService } from "../services/customerSurveyService.js";
import { customerExperienceMetricsService } from "../services/customerExperienceMetricsService.js";
import { voiceOfCustomerService } from "../services/voiceOfCustomerService.js";
import { customerExperienceIssueService } from "../services/customerExperienceIssueService.js";
import { customerExperienceOverviewService } from "../services/customerExperienceOverviewService.js";
import {
  CreateFeedbackRecordSchema,
  UpdateFeedbackStatusSchema,
  ResolveFeedbackSchema,
  LinkFeedbackDuplicateSchema,
  CreateSurveyDefinitionSchema,
  UpdateSurveyDefinitionSchema,
  CreateSurveyVersionSchema,
  DeliverSurveySchema,
  SubmitSurveyResponseSchema,
  PublicSurveyResponseSchema,
  CreateFeedbackThemeSchema,
  ClassifyFeedbackSchema,
  ReviewClassificationSchema,
  CreateExperienceIssueSchema,
  UpdateExperienceIssueSchema,
  LinkFeedbackToIssueSchema,
  CreateActionPlanSchema,
  UpdateActionPlanSchema,
  FeedbackFilterSchema,
  ExperienceMetricQuerySchema,
} from "@flowforge/shared";

export async function customerExperienceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. EXECUTIVE EXPERIENCE OVERVIEW
  // ==========================================

  app.get(
    "/customer-experience/overview",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Experience"],
        summary: "Executive overview of customer satisfaction, feedback, and issues",
        querystring: z.object({
          customerAccountId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const overview = await customerExperienceOverviewService.getOverview(
        workspaceId,
        request.query.customerAccountId
      );
      return reply.send({ data: overview });
    }
  );

  // ==========================================
  // 2. CUSTOMER FEEDBACK REGISTRY
  // ==========================================

  // Create Feedback Record
  app.post(
    "/customer-feedback",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "Create a customer feedback record",
        body: CreateFeedbackRecordSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const feedback = await customerFeedbackService.createFeedback(workspaceId, request.body as any, userId);
      return reply.status(201).send({ data: feedback });
    }
  );

  // List Feedback Records
  app.get(
    "/customer-feedback",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "List customer feedback records with filtering",
        querystring: FeedbackFilterSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customerFeedbackService.listFeedback(workspaceId, request.query as any);
      return reply.send({ data: result });
    }
  );

  // Get Feedback Record Details
  app.get(
    "/customer-feedback/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "Get customer feedback details by ID",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const feedback = await customerFeedbackService.getFeedback(workspaceId, request.params.id);
      return reply.send({ data: feedback });
    }
  );

  // Update Feedback Status
  app.patch(
    "/customer-feedback/:id/status",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "Update feedback status",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateFeedbackStatusSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await customerFeedbackService.updateStatus(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: updated });
    }
  );

  // Resolve Feedback with Evidence
  app.post(
    "/customer-feedback/:id/resolve",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "Resolve customer feedback with verified evidence",
        params: z.object({ id: z.string().uuid() }),
        body: ResolveFeedbackSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const resolved = await customerFeedbackService.resolveFeedback(
        workspaceId,
        request.params.id,
        userId || "system",
        request.body
      );
      return reply.send({ data: resolved });
    }
  );

  // Link Feedback as Duplicate
  app.post(
    "/customer-feedback/:id/duplicate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Feedback"],
        summary: "Mark feedback as duplicate of an existing record",
        params: z.object({ id: z.string().uuid() }),
        body: LinkFeedbackDuplicateSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await customerFeedbackService.linkDuplicate(
        workspaceId,
        request.params.id,
        request.body.duplicateOfFeedbackId,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // ==========================================
  // 3. SURVEYS & DELIVERY
  // ==========================================

  // Create Survey Definition
  app.post(
    "/customer-surveys",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Create a survey definition and publish version 1",
        body: CreateSurveyDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const survey = await customerSurveyService.createDefinition(workspaceId, request.body, userId);
      return reply.status(201).send({ data: survey });
    }
  );

  // List Survey Definitions
  app.get(
    "/customer-surveys",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "List survey definitions in workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const surveys = await customerSurveyService.listDefinitions(workspaceId);
      return reply.send({ data: surveys });
    }
  );

  // Get Survey Definition Details
  app.get(
    "/customer-surveys/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Get survey definition details by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const survey = await customerSurveyService.getDefinition(workspaceId, request.params.id);
      return reply.send({ data: survey });
    }
  );

  // Update Survey Definition
  app.patch(
    "/customer-surveys/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Update survey definition metadata",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateSurveyDefinitionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await customerSurveyService.updateDefinition(workspaceId, request.params.id, request.body, userId);
      return reply.send({ data: updated });
    }
  );

  // Create Survey Version
  app.post(
    "/customer-surveys/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Create a new immutable survey version",
        params: z.object({ id: z.string().uuid() }),
        body: CreateSurveyVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const version = await customerSurveyService.createVersion(
        workspaceId,
        request.params.id,
        userId || "system",
        request.body
      );
      return reply.status(201).send({ data: version });
    }
  );

  // Publish Survey Version
  app.post(
    "/customer-surveys/:id/versions/:versionNumber/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Publish a survey version",
        params: z.object({ id: z.string().uuid(), versionNumber: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const version = await customerSurveyService.publishVersion(
        workspaceId,
        request.params.id,
        request.params.versionNumber,
        userId || "system"
      );
      return reply.send({ data: version });
    }
  );

  // Deliver Survey
  app.post(
    "/customer-surveys/deliver",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Deliver survey invitation enforcing consent and cooldown limits",
        body: DeliverSurveySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const deliveryResult = await customerSurveyService.deliverSurvey(workspaceId, request.body, userId);
      return reply.status(201).send({ data: deliveryResult });
    }
  );

  // Authenticated Survey Response Submission
  app.post(
    "/customer-surveys/:id/responses",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "Submit a survey response",
        params: z.object({ id: z.string().uuid() }),
        body: SubmitSurveyResponseSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const response = await customerSurveyService.submitResponse(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.status(201).send({ data: response });
    }
  );

  // Public Survey Response Submission (No Auth Required, Validates Secure Token)
  app.post(
    "/customer-surveys/public/respond",
    {
      schema: {
        tags: ["Customer Surveys"],
        summary: "Submit a survey response via public secure token",
        body: PublicSurveyResponseSchema,
      },
    },
    async (request, reply) => {
      const response = await customerSurveyService.submitPublicResponse(request.body);
      return reply.status(201).send({ data: { success: true, responseId: response.id } });
    }
  );

  // List Survey Responses
  app.get(
    "/customer-surveys/responses",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Surveys"],
        summary: "List survey responses",
        querystring: z.object({
          surveyDefinitionId: z.string().uuid().optional(),
          customerAccountId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const responses = await customerSurveyService.listResponses(workspaceId, request.query);
      return reply.send({ data: responses });
    }
  );

  // ==========================================
  // 4. EXPERIENCE METRICS ENGINE
  // ==========================================

  // Evaluate Experience Metrics
  app.get(
    "/customer-experience/metrics/evaluate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Experience Metrics"],
        summary: "Evaluate NPS, CSAT, or CES metrics",
        querystring: ExperienceMetricQuerySchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await customerExperienceMetricsService.evaluateMetrics(workspaceId, request.query);
      return reply.send({ data: result });
    }
  );

  // Metric Evaluation History
  app.get(
    "/customer-experience/metrics/history",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Customer Experience Metrics"],
        summary: "Get past metric evaluation snapshots",
        querystring: z.object({
          metricType: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const history = await customerExperienceMetricsService.getHistory(workspaceId, request.query.metricType);
      return reply.send({ data: history });
    }
  );

  // ==========================================
  // 5. VOICE OF CUSTOMER: THEMES & CLASSIFICATION
  // ==========================================

  // List Themes
  app.get(
    "/customer-experience/themes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Voice of Customer Themes"],
        summary: "List Voice of Customer themes",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const themes = await voiceOfCustomerService.listThemes(workspaceId);
      return reply.send({ data: themes });
    }
  );

  // Create Theme
  app.post(
    "/customer-experience/themes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Voice of Customer Themes"],
        summary: "Create a Voice of Customer theme",
        body: CreateFeedbackThemeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const theme = await voiceOfCustomerService.createTheme(workspaceId, request.body, userId);
      return reply.status(201).send({ data: theme });
    }
  );

  // Theme Analytics
  app.get(
    "/customer-experience/themes/analytics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Voice of Customer Themes"],
        summary: "Retrieve theme analytics, frequency, and sentiment distribution",
        querystring: z.object({
          windowDays: z.coerce.number().int().min(1).max(365).default(30),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const analytics = await voiceOfCustomerService.getThemeAnalytics(workspaceId, request.query.windowDays);
      return reply.send({ data: analytics });
    }
  );

  // Classify Feedback Record
  app.post(
    "/customer-feedback/:id/classify",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Voice of Customer Themes"],
        summary: "Classify feedback text",
        params: z.object({ id: z.string().uuid() }),
        body: ClassifyFeedbackSchema.partial().optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const classification = await voiceOfCustomerService.classifyFeedback(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.status(201).send({ data: classification });
    }
  );

  // Review Classification (Human in the Loop)
  app.post(
    "/customer-experience/classifications/:id/review",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Voice of Customer Themes"],
        summary: "Confirm or correct feedback classification",
        params: z.object({ id: z.string().uuid() }),
        body: ReviewClassificationSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await voiceOfCustomerService.reviewClassification(
        workspaceId,
        request.params.id,
        userId || "system",
        request.body
      );
      return reply.send({ data: updated });
    }
  );

  // ==========================================
  // 6. EXPERIENCE ISSUES & ACTION PLANS
  // ==========================================

  // Create Experience Issue
  app.post(
    "/customer-experience/issues",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Create an experience issue linked to customer feedback",
        body: CreateExperienceIssueSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const issue = await customerExperienceIssueService.createIssue(workspaceId, request.body, userId);
      return reply.status(201).send({ data: issue });
    }
  );

  // List Experience Issues
  app.get(
    "/customer-experience/issues",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "List experience issues with status and severity filters",
        querystring: z.object({
          status: z.string().optional(),
          severity: z.string().optional(),
          customerAccountId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const issues = await customerExperienceIssueService.listIssues(workspaceId, request.query);
      return reply.send({ data: issues });
    }
  );

  // Get Experience Issue Details
  app.get(
    "/customer-experience/issues/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Get experience issue details by ID",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const issue = await customerExperienceIssueService.getIssue(workspaceId, request.params.id);
      return reply.send({ data: issue });
    }
  );

  // Update Experience Issue
  app.patch(
    "/customer-experience/issues/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Update experience issue status or root cause",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateExperienceIssueSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await customerExperienceIssueService.updateIssue(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: updated });
    }
  );

  // Link Feedback to Issue
  app.post(
    "/customer-experience/issues/:id/feedback",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Link feedback record to experience issue",
        params: z.object({ id: z.string().uuid() }),
        body: LinkFeedbackToIssueSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const link = await customerExperienceIssueService.linkFeedback(
        workspaceId,
        request.params.id,
        request.body.feedbackId,
        userId
      );
      return reply.status(201).send({ data: link });
    }
  );

  // Create Action Plan (Optionally Materializes CustomerSuccessTask)
  app.post(
    "/customer-experience/issues/:id/actions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Create an action plan for an issue",
        params: z.object({ id: z.string().uuid() }),
        body: CreateActionPlanSchema.omit({ issueId: true }),
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const actionPlan = await customerExperienceIssueService.createActionPlan(
        workspaceId,
        { ...request.body, issueId: request.params.id },
        userId
      );
      return reply.status(201).send({ data: actionPlan });
    }
  );

  // Update Action Plan Status
  app.patch(
    "/customer-experience/actions/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Experience Issues"],
        summary: "Update action plan progress or complete it",
        params: z.object({ id: z.string().uuid() }),
        body: UpdateActionPlanSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.authUser!;
      const updated = await customerExperienceIssueService.updateActionPlan(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.send({ data: updated });
    }
  );
}
