import { z } from "zod";

// ==========================================
// 1. CONSTANTS & ENUMS
// ==========================================

export const FEEDBACK_SOURCES = [
  "SURVEY",
  "USER_MANUAL",
  "CRM_INTEGRATION",
  "SUPPORT_INTEGRATION",
  "COMMUNICATION_REPLY",
  "CUSTOMER_EVENT",
] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_CATEGORIES = [
  "PRODUCT_USABILITY",
  "ONBOARDING",
  "WORKFLOW_RELIABILITY",
  "INTEGRATION_QUALITY",
  "PERFORMANCE",
  "DOCUMENTATION",
  "SUPPORT_EXPERIENCE",
  "BUSINESS_OUTCOMES",
  "SECURITY_GOVERNANCE",
  "PRICING_COMMERCIAL",
  "FEATURE_REQUEST",
  "OTHER",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_TYPES = [
  "NPS_COMMENT",
  "CSAT_COMMENT",
  "CES_COMMENT",
  "SUPPORT_FEEDBACK",
  "UNSOLICITED_FEEDBACK",
  "INTERVIEW_NOTE",
  "FEATURE_WISH",
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "REVIEW_REQUIRED",
  "ACTION_REQUIRED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "DISMISSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const SURVEY_TYPES = [
  "NPS",
  "CSAT",
  "CES",
  "ONBOARDING",
  "POST_SUPPORT",
  "WORKFLOW_EXPERIENCE",
  "CUSTOM",
] as const;
export type SurveyType = (typeof SURVEY_TYPES)[number];

export const SURVEY_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "NUMERIC_SCALE",
  "RATING_SCALE",
  "SHORT_TEXT",
  "LONG_TEXT",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const SURVEY_DELIVERY_CHANNELS = [
  "EMAIL",
  "IN_APP",
  "MANUAL_LINK",
] as const;
export type SurveyDeliveryChannel = (typeof SURVEY_DELIVERY_CHANNELS)[number];

export const SURVEY_DELIVERY_STATUSES = [
  "SCHEDULED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "RESPONDED",
  "EXPIRED",
  "FAILED",
] as const;
export type SurveyDeliveryStatus = (typeof SURVEY_DELIVERY_STATUSES)[number];

export const SENTIMENT_VALUES = [
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "MIXED",
] as const;
export type SentimentValue = (typeof SENTIMENT_VALUES)[number];

export const CLASSIFICATION_METHODS = [
  "DETERMINISTIC_RULE",
  "AI_ASSISTED",
  "HUMAN_CLASSIFIED",
] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];

export const CLASSIFICATION_REVIEW_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "CORRECTED",
  "REJECTED",
] as const;
export type ClassificationReviewStatus = (typeof CLASSIFICATION_REVIEW_STATUSES)[number];

export const EXPERIENCE_ISSUE_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export type ExperienceIssueSeverity = (typeof EXPERIENCE_ISSUE_SEVERITIES)[number];

export const EXPERIENCE_ISSUE_STATUSES = [
  "OPEN",
  "TRIAGED",
  "INVESTIGATING",
  "ACTION_PLANNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "WONT_FIX",
] as const;
export type ExperienceIssueStatus = (typeof EXPERIENCE_ISSUE_STATUSES)[number];

export const ROOT_CAUSE_STATUSES = [
  "UNKNOWN",
  "HYPOTHESIS",
  "INVESTIGATING",
  "CONFIRMED",
  "NOT_REPRODUCIBLE",
] as const;
export type RootCauseStatus = (typeof ROOT_CAUSE_STATUSES)[number];

export const ACTION_PLAN_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ActionPlanStatus = (typeof ACTION_PLAN_STATUSES)[number];

export const METRIC_TYPES = [
  "NPS",
  "CSAT",
  "CES",
  "GENERAL_FEEDBACK",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const EVALUATION_WINDOWS = [
  "LAST_30_DAYS",
  "LAST_90_DAYS",
  "ALL_TIME",
] as const;
export type EvaluationWindow = (typeof EVALUATION_WINDOWS)[number];

// ==========================================
// 2. STATE TRANSITIONS
// ==========================================

export const ALLOWED_FEEDBACK_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  RECEIVED: ["PROCESSING", "REVIEW_REQUIRED", "ACTION_REQUIRED", "DISMISSED"],
  PROCESSING: ["REVIEW_REQUIRED", "ACTION_REQUIRED", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
  REVIEW_REQUIRED: ["ACTION_REQUIRED", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
  ACTION_REQUIRED: ["IN_PROGRESS", "RESOLVED", "DISMISSED"],
  IN_PROGRESS: ["RESOLVED", "CLOSED", "DISMISSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  DISMISSED: ["RECEIVED"],
};

export const ALLOWED_ISSUE_TRANSITIONS: Record<ExperienceIssueStatus, readonly ExperienceIssueStatus[]> = {
  OPEN: ["TRIAGED", "INVESTIGATING", "WONT_FIX"],
  TRIAGED: ["INVESTIGATING", "ACTION_PLANNED", "WONT_FIX"],
  INVESTIGATING: ["ACTION_PLANNED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"],
  ACTION_PLANNED: ["IN_PROGRESS", "RESOLVED", "WONT_FIX"],
  IN_PROGRESS: ["RESOLVED", "INVESTIGATING"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  WONT_FIX: ["OPEN"],
};

// ==========================================
// 3. VALIDATION SCHEMAS
// ==========================================

export const SurveyQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  questionType: z.enum(QUESTION_TYPES),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().default(false),
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

// Feedback Record Schemas
export const CreateFeedbackRecordSchema = z.object({
  customerAccountId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  source: z.enum(FEEDBACK_SOURCES),
  category: z.enum(FEEDBACK_CATEGORIES).default("PRODUCT_USABILITY").optional(),
  feedbackType: z.enum(FEEDBACK_TYPES).default("UNSOLICITED_FEEDBACK").optional(),
  rawText: z.string().min(1),
  redactedText: z.string().optional(),
  submissionTimestamp: z.string().datetime().optional(),
  relatedWorkflowId: z.string().optional(),
  relatedIntegrationId: z.string().optional(),
  relatedJourneyStage: z.string().optional(),
  relatedObjectiveId: z.string().optional(),
  relatedIncidentId: z.string().optional(),
  relatedExecutionId: z.string().optional(),
  sourceSystem: z.string().default("flowforge").optional(),
  externalRecordId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  consentContext: z.record(z.any()).optional(),
  dataClassification: z.enum(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("INTERNAL").optional(),
});
export type CreateFeedbackRecordInput = z.infer<typeof CreateFeedbackRecordSchema>;

export const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
});
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusSchema>;

export const ResolveFeedbackSchema = z.object({
  resolutionSummary: z.string().min(1),
  resolutionEvidence: z.record(z.any()).default({}),
});
export type ResolveFeedbackInput = z.infer<typeof ResolveFeedbackSchema>;

export const LinkFeedbackDuplicateSchema = z.object({
  duplicateOfFeedbackId: z.string().uuid(),
});
export type LinkFeedbackDuplicateInput = z.infer<typeof LinkFeedbackDuplicateSchema>;

// Survey Definition Schemas
export const CreateSurveyDefinitionSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  surveyType: z.enum(SURVEY_TYPES),
  targetingRules: z.record(z.any()).default({}),
  consentRequirements: z.record(z.any()).default({}),
  cooldownDays: z.number().int().min(1).default(30),
  initialQuestions: z.array(SurveyQuestionSchema).min(1),
  title: z.string().min(2),
  introText: z.string().optional(),
  thankYouText: z.string().optional(),
});
export type CreateSurveyDefinitionInput = z.infer<typeof CreateSurveyDefinitionSchema>;

export const UpdateSurveyDefinitionSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.enum(SURVEY_STATUSES).optional(),
  targetingRules: z.record(z.any()).optional(),
  consentRequirements: z.record(z.any()).optional(),
  cooldownDays: z.number().int().min(1).optional(),
});
export type UpdateSurveyDefinitionInput = z.infer<typeof UpdateSurveyDefinitionSchema>;

export const CreateSurveyVersionSchema = z.object({
  title: z.string().min(2),
  introText: z.string().optional(),
  thankYouText: z.string().optional(),
  questionsJson: z.array(SurveyQuestionSchema).min(1),
  publishImmediately: z.boolean().default(false),
});
export type CreateSurveyVersionInput = z.infer<typeof CreateSurveyVersionSchema>;

// Survey Delivery Schema
export const DeliverSurveySchema = z.object({
  surveyDefinitionId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  channel: z.enum(SURVEY_DELIVERY_CHANNELS).default("EMAIL"),
  recipientEmail: z.string().email().optional(),
  expirationDays: z.number().int().min(1).max(90).default(14),
  idempotencyKey: z.string().optional(),
});
export type DeliverSurveyInput = z.infer<typeof DeliverSurveySchema>;

// Survey Response Schemas
export const SubmitSurveyResponseSchema = z.object({
  surveyDeliveryId: z.string().uuid().optional(),
  customerAccountId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  primaryScore: z.number().min(0).max(10).optional(),
  freeTextFeedback: z.string().optional(),
  answersJson: z.record(z.any()).default({}),
});
export type SubmitSurveyResponseInput = z.infer<typeof SubmitSurveyResponseSchema>;

export const PublicSurveyResponseSchema = z.object({
  token: z.string().min(1),
  primaryScore: z.number().min(0).max(10).optional(),
  freeTextFeedback: z.string().optional(),
  answersJson: z.record(z.any()).default({}),
});
export type PublicSurveyResponseInput = z.infer<typeof PublicSurveyResponseSchema>;

// Theme & Classification Schemas
export const CreateFeedbackThemeSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  category: z.enum(FEEDBACK_CATEGORIES),
  description: z.string().optional(),
});
export type CreateFeedbackThemeInput = z.infer<typeof CreateFeedbackThemeSchema>;

export const ClassifyFeedbackSchema = z.object({
  themeId: z.string().uuid().optional(),
  themeName: z.string().min(1),
  category: z.enum(FEEDBACK_CATEGORIES),
  sentiment: z.enum(SENTIMENT_VALUES).default("NEUTRAL"),
  classificationMethod: z.enum(CLASSIFICATION_METHODS).default("DETERMINISTIC_RULE"),
  confidenceScore: z.number().min(0).max(1).optional(),
});
export type ClassifyFeedbackInput = z.infer<typeof ClassifyFeedbackSchema>;

export const ReviewClassificationSchema = z.object({
  reviewStatus: z.enum(CLASSIFICATION_REVIEW_STATUSES),
  correctedThemeName: z.string().optional(),
  correctedCategory: z.enum(FEEDBACK_CATEGORIES).optional(),
  correctedSentiment: z.enum(SENTIMENT_VALUES).optional(),
  correctionReason: z.string().optional(),
});
export type ReviewClassificationInput = z.infer<typeof ReviewClassificationSchema>;

// Experience Issue Schemas
export const CreateExperienceIssueSchema = z.object({
  customerAccountId: z.string().uuid().optional(),
  title: z.string().min(3),
  description: z.string().min(5),
  category: z.enum(FEEDBACK_CATEGORIES).default("PRODUCT_USABILITY"),
  severity: z.enum(EXPERIENCE_ISSUE_SEVERITIES).default("MEDIUM"),
  ownerUserId: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  relatedIncidentId: z.string().optional(),
  feedbackIds: z.array(z.string().uuid()).optional(),
  rootCauseStatus: z.enum(ROOT_CAUSE_STATUSES).default("HYPOTHESIS"),
  rootCauseDetails: z.string().optional(),
});
export type CreateExperienceIssueInput = z.infer<typeof CreateExperienceIssueSchema>;

export const UpdateExperienceIssueSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  severity: z.enum(EXPERIENCE_ISSUE_SEVERITIES).optional(),
  status: z.enum(EXPERIENCE_ISSUE_STATUSES).optional(),
  ownerUserId: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  rootCauseStatus: z.enum(ROOT_CAUSE_STATUSES).optional(),
  rootCauseDetails: z.string().optional(),
  resolutionSummary: z.string().optional(),
  resolutionEvidence: z.record(z.any()).optional(),
  closeReason: z.string().optional(),
});
export type UpdateExperienceIssueInput = z.infer<typeof UpdateExperienceIssueSchema>;

export const LinkFeedbackToIssueSchema = z.object({
  feedbackId: z.string().uuid(),
});
export type LinkFeedbackToIssueInput = z.infer<typeof LinkFeedbackToIssueSchema>;

// Action Plan Schemas
export const CreateActionPlanSchema = z.object({
  issueId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(5),
  ownerUserId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  expectedOutcome: z.string().optional(),
  successMeasure: z.string().optional(),
  materializeTask: z.boolean().default(true),
});
export type CreateActionPlanInput = z.infer<typeof CreateActionPlanSchema>;

export const UpdateActionPlanSchema = z.object({
  status: z.enum(ACTION_PLAN_STATUSES).optional(),
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  ownerUserId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  completionEvidence: z.record(z.any()).optional(),
});
export type UpdateActionPlanInput = z.infer<typeof UpdateActionPlanSchema>;

// Query & Filter Schemas
export const FeedbackFilterSchema = z.object({
  customerAccountId: z.string().uuid().optional(),
  source: z.enum(FEEDBACK_SOURCES).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  sentiment: z.enum(SENTIMENT_VALUES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type FeedbackFilter = z.infer<typeof FeedbackFilterSchema>;

export const ExperienceMetricQuerySchema = z.object({
  metricType: z.enum(METRIC_TYPES).default("NPS"),
  evaluationWindow: z.enum(EVALUATION_WINDOWS).default("LAST_30_DAYS"),
  customerAccountId: z.string().uuid().optional(),
});
export type ExperienceMetricQuery = z.infer<typeof ExperienceMetricQuerySchema>;
