-- Phase 28: Enterprise Customer Experience Intelligence & Voice of Customer Migration

-- Create CustomerFeedbackRecord
CREATE TABLE IF NOT EXISTS "customer_feedback_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "contactId" TEXT,
    "feedbackNumber" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PRODUCT_USABILITY',
    "feedbackType" TEXT NOT NULL DEFAULT 'UNSOLICITED_FEEDBACK',
    "rawText" TEXT NOT NULL,
    "redactedText" TEXT,
    "submissionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedWorkflowId" TEXT,
    "relatedIntegrationId" TEXT,
    "relatedJourneyStage" TEXT,
    "relatedObjectiveId" TEXT,
    "relatedIncidentId" TEXT,
    "relatedExecutionId" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'flowforge',
    "externalRecordId" TEXT,
    "idempotencyKey" TEXT,
    "consentContext" JSONB NOT NULL DEFAULT '{}',
    "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "linkedDuplicateOfId" TEXT,
    "resolutionSummary" TEXT,
    "resolutionEvidence" JSONB NOT NULL DEFAULT '{}',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "surveyResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_feedback_records_pkey" PRIMARY KEY ("id")
);

-- Create CustomerSurveyDefinition
CREATE TABLE IF NOT EXISTS "customer_survey_definitions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "surveyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetingRules" JSONB NOT NULL DEFAULT '{}',
    "consentRequirements" JSONB NOT NULL DEFAULT '{}',
    "cooldownDays" INTEGER NOT NULL DEFAULT 30,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_survey_definitions_pkey" PRIMARY KEY ("id")
);

-- Create CustomerSurveyVersion
CREATE TABLE IF NOT EXISTS "customer_survey_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "surveyDefinitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "title" TEXT NOT NULL,
    "introText" TEXT,
    "thankYouText" TEXT,
    "questionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_survey_versions_pkey" PRIMARY KEY ("id")
);

-- Create CustomerSurveyDelivery
CREATE TABLE IF NOT EXISTS "customer_survey_deliveries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "surveyDefinitionId" TEXT NOT NULL,
    "surveyVersionId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "contactId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipientEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "secureTokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "deliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_survey_deliveries_pkey" PRIMARY KEY ("id")
);

-- Create CustomerSurveyResponse
CREATE TABLE IF NOT EXISTS "customer_survey_responses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "surveyDefinitionId" TEXT NOT NULL,
    "surveyVersionId" TEXT NOT NULL,
    "surveyDeliveryId" TEXT,
    "customerAccountId" TEXT NOT NULL,
    "contactId" TEXT,
    "primaryScore" DOUBLE PRECISION,
    "scoreClassification" TEXT,
    "freeTextFeedback" TEXT,
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_survey_responses_pkey" PRIMARY KEY ("id")
);

-- Create CustomerFeedbackTheme
CREATE TABLE IF NOT EXISTS "customer_feedback_themes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_feedback_themes_pkey" PRIMARY KEY ("id")
);

-- Create CustomerFeedbackClassification
CREATE TABLE IF NOT EXISTS "customer_feedback_classifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "themeId" TEXT,
    "themeName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "classificationMethod" TEXT NOT NULL DEFAULT 'DETERMINISTIC_RULE',
    "confidenceScore" DOUBLE PRECISION,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_feedback_classifications_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExperienceIssue
CREATE TABLE IF NOT EXISTS "customer_experience_issues" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "issueNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PRODUCT_USABILITY',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerUserId" TEXT,
    "targetDate" TIMESTAMP(3),
    "relatedIncidentId" TEXT,
    "rootCauseStatus" TEXT NOT NULL DEFAULT 'HYPOTHESIS',
    "rootCauseDetails" TEXT,
    "resolutionSummary" TEXT,
    "resolutionEvidence" JSONB NOT NULL DEFAULT '{}',
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_experience_issues_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExperienceIssueFeedback
CREATE TABLE IF NOT EXISTS "customer_experience_issue_feedbacks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedByUserId" TEXT,

    CONSTRAINT "customer_experience_issue_feedbacks_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExperienceActionPlan
CREATE TABLE IF NOT EXISTS "customer_experience_action_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "expectedOutcome" TEXT,
    "successMeasure" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "materializedTaskId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completionEvidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_experience_action_plans_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExperienceMetricEvaluation
CREATE TABLE IF NOT EXISTS "customer_experience_metric_evaluations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "evaluationWindow" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "breakdownJson" JSONB NOT NULL DEFAULT '{}',
    "customerAccountId" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_experience_metric_evaluations_pkey" PRIMARY KEY ("id")
);

-- Create Indexes and Foreign Keys
CREATE UNIQUE INDEX IF NOT EXISTS "customer_feedback_records_workspaceId_feedbackNumber_key" ON "customer_feedback_records"("workspaceId", "feedbackNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_feedback_records_workspaceId_idempotencyKey_key" ON "customer_feedback_records"("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_feedback_records_workspaceId_customerAccountId_status_idx" ON "customer_feedback_records"("workspaceId", "customerAccountId", "status");
CREATE INDEX IF NOT EXISTS "customer_feedback_records_workspaceId_category_status_idx" ON "customer_feedback_records"("workspaceId", "category", "status");
CREATE INDEX IF NOT EXISTS "customer_feedback_records_workspaceId_submissionTimestamp_idx" ON "customer_feedback_records"("workspaceId", "submissionTimestamp");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_survey_definitions_workspaceId_slug_key" ON "customer_survey_definitions"("workspaceId", "slug");
CREATE INDEX IF NOT EXISTS "customer_survey_definitions_workspaceId_status_idx" ON "customer_survey_definitions"("workspaceId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_survey_versions_surveyDefinitionId_versionNumber_key" ON "customer_survey_versions"("surveyDefinitionId", "versionNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_survey_deliveries_secureTokenHash_key" ON "customer_survey_deliveries"("secureTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_survey_deliveries_workspaceId_idempotencyKey_key" ON "customer_survey_deliveries"("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_survey_deliveries_workspaceId_customerAccountId_status_idx" ON "customer_survey_deliveries"("workspaceId", "customerAccountId", "status");

CREATE INDEX IF NOT EXISTS "customer_survey_responses_workspaceId_surveyDefinitionId_submittedAt_idx" ON "customer_survey_responses"("workspaceId", "surveyDefinitionId", "submittedAt");
CREATE INDEX IF NOT EXISTS "customer_survey_responses_workspaceId_customerAccountId_submittedAt_idx" ON "customer_survey_responses"("workspaceId", "customerAccountId", "submittedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_feedback_themes_workspaceId_slug_key" ON "customer_feedback_themes"("workspaceId", "slug");

CREATE INDEX IF NOT EXISTS "customer_feedback_classifications_workspaceId_feedbackId_idx" ON "customer_feedback_classifications"("workspaceId", "feedbackId");
CREATE INDEX IF NOT EXISTS "customer_feedback_classifications_workspaceId_themeName_idx" ON "customer_feedback_classifications"("workspaceId", "themeName");
CREATE INDEX IF NOT EXISTS "customer_feedback_classifications_workspaceId_reviewStatus_idx" ON "customer_feedback_classifications"("workspaceId", "reviewStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_experience_issues_workspaceId_issueNumber_key" ON "customer_experience_issues"("workspaceId", "issueNumber");
CREATE INDEX IF NOT EXISTS "customer_experience_issues_workspaceId_status_severity_idx" ON "customer_experience_issues"("workspaceId", "status", "severity");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_experience_issue_feedbacks_issueId_feedbackId_key" ON "customer_experience_issue_feedbacks"("issueId", "feedbackId");
CREATE INDEX IF NOT EXISTS "customer_experience_issue_feedbacks_workspaceId_issueId_idx" ON "customer_experience_issue_feedbacks"("workspaceId", "issueId");

CREATE INDEX IF NOT EXISTS "customer_experience_action_plans_workspaceId_issueId_status_idx" ON "customer_experience_action_plans"("workspaceId", "issueId", "status");

CREATE INDEX IF NOT EXISTS "customer_experience_metric_evaluations_workspaceId_metricType_evaluationWindow_idx" ON "customer_experience_metric_evaluations"("workspaceId", "metricType", "evaluationWindow");
CREATE INDEX IF NOT EXISTS "customer_experience_metric_evaluations_workspaceId_customerAccountId_idx" ON "customer_experience_metric_evaluations"("workspaceId", "customerAccountId");
