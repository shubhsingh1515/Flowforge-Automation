-- Phase 27: Enterprise Customer Portfolio Intelligence, Strategic Account Planning & Stakeholder Mapping Migration

-- Create CustomerStrategicAccountProfile
CREATE TABLE IF NOT EXISTS "customer_strategic_account_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "accountSegment" TEXT NOT NULL DEFAULT 'STANDARD',
    "strategicTier" TEXT NOT NULL DEFAULT 'TIER_4_FOUNDATIONAL',
    "primaryAccountOwnerId" TEXT,
    "customerSuccessOwnerId" TEXT,
    "executiveSponsorId" TEXT,
    "technicalOwnerId" TEXT,
    "reviewCadence" TEXT NOT NULL DEFAULT 'QUARTERLY',
    "lastStrategicReviewAt" TIMESTAMP(3),
    "nextStrategicReviewAt" TIMESTAMP(3),
    "industry" TEXT,
    "businessDomain" TEXT,
    "targetOutcomes" JSONB NOT NULL DEFAULT '[]',
    "internalStrategicNotes" TEXT,
    "relationshipCoverageStatus" TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "priorityLevel" TEXT NOT NULL DEFAULT 'ROUTINE_MANAGEMENT',
    "priorityScore" DOUBLE PRECISION,
    "priorityFactors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_strategic_account_profiles_pkey" PRIMARY KEY ("id")
);

-- Create CustomerStakeholderRelationship
CREATE TABLE IF NOT EXISTS "customer_stakeholder_relationships" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "relationshipOwnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3),
    "verificationSource" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_stakeholder_relationships_pkey" PRIMARY KEY ("id")
);

-- Create CustomerStakeholderRoleHistory
CREATE TABLE IF NOT EXISTS "customer_stakeholder_role_histories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "previousRole" TEXT,
    "newRole" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changeReason" TEXT,
    "actorId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_stakeholder_role_histories_pkey" PRIMARY KEY ("id")
);

-- Create CustomerAccountPlan
CREATE TABLE IF NOT EXISTS "customer_account_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "planYear" INTEGER NOT NULL DEFAULT 2027,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "executiveSummary" TEXT,
    "visionStatement" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_account_plans_pkey" PRIMARY KEY ("id")
);

-- Create CustomerAccountPlanVersion
CREATE TABLE IF NOT EXISTS "customer_account_plan_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountPlanId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changeSummary" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_account_plan_versions_pkey" PRIMARY KEY ("id")
);

-- Create CustomerSuccessObjective
CREATE TABLE IF NOT EXISTS "customer_success_objectives" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "accountPlanId" TEXT,
    "objectiveNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "businessRationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT NOT NULL DEFAULT 'ADOPTION_SCALE',
    "targetDate" TIMESTAMP(3) NOT NULL,
    "achievedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "successCriteria" TEXT,
    "measurementMethod" TEXT,
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "unit" TEXT,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_success_objectives_pkey" PRIMARY KEY ("id")
);

-- Create CustomerObjectiveEvidence
CREATE TABLE IF NOT EXISTS "customer_objective_evidences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION,
    "observationTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "sourceRef" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_objective_evidences_pkey" PRIMARY KEY ("id")
);

-- Create CustomerObjectiveBlocker
CREATE TABLE IF NOT EXISTS "customer_objective_blockers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedResolutionDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "linkedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_objective_blockers_pkey" PRIMARY KEY ("id")
);

-- Create CustomerStrategicInitiative
CREATE TABLE IF NOT EXISTS "customer_strategic_initiatives" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "accountPlanId" TEXT,
    "initiativeNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "targetCompletionDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "linkedRevenueOpportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_strategic_initiatives_pkey" PRIMARY KEY ("id")
);

-- Create CustomerStrategicMilestone
CREATE TABLE IF NOT EXISTS "customer_strategic_milestones" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "customer_strategic_milestones_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExecutiveReview
CREATE TABLE IF NOT EXISTS "customer_executive_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "reviewNumber" TEXT NOT NULL,
    "reviewPeriod" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "conductedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "reviewOwnerId" TEXT,
    "executiveSponsorId" TEXT,
    "meetingNotes" TEXT,
    "agreedSummary" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "prepDataSnapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_executive_reviews_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExecutiveReviewParticipant
CREATE TABLE IF NOT EXISTS "customer_executive_review_participants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "attendanceStatus" TEXT NOT NULL DEFAULT 'INVITED',

    CONSTRAINT "customer_executive_review_participants_pkey" PRIMARY KEY ("id")
);

-- Create CustomerExecutiveReviewCommitment
CREATE TABLE IF NOT EXISTS "customer_executive_review_commitments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "linkedTaskId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_executive_review_commitments_pkey" PRIMARY KEY ("id")
);

-- Create CustomerPortfolioPriorityEvaluation
CREATE TABLE IF NOT EXISTS "customer_portfolio_priority_evaluations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0',
    "priorityLevel" TEXT NOT NULL,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "evaluationTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contributingFactors" JSONB NOT NULL DEFAULT '[]',
    "recommendedActions" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_portfolio_priority_evaluations_pkey" PRIMARY KEY ("id")
);

-- Indexes & Unique Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "customer_strategic_account_profiles_customerAccountId_key" ON "customer_strategic_account_profiles"("customerAccountId");
CREATE INDEX IF NOT EXISTS "customer_strategic_account_profiles_workspaceId_accountSegment_idx" ON "customer_strategic_account_profiles"("workspaceId", "accountSegment");
CREATE INDEX IF NOT EXISTS "customer_strategic_account_profiles_workspaceId_priorityLevel_idx" ON "customer_strategic_account_profiles"("workspaceId", "priorityLevel");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_stakeholder_relationships_customerAccountId_contactId_role_key" ON "customer_stakeholder_relationships"("customerAccountId", "contactId", "role");
CREATE INDEX IF NOT EXISTS "customer_stakeholder_relationships_workspaceId_customerAccountId_role_idx" ON "customer_stakeholder_relationships"("workspaceId", "customerAccountId", "role");

CREATE INDEX IF NOT EXISTS "customer_stakeholder_role_histories_workspaceId_relationshipId_changedAt_idx" ON "customer_stakeholder_role_histories"("workspaceId", "relationshipId", "changedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_plans_workspaceId_planNumber_key" ON "customer_account_plans"("workspaceId", "planNumber");
CREATE INDEX IF NOT EXISTS "customer_account_plans_workspaceId_customerAccountId_status_idx" ON "customer_account_plans"("workspaceId", "customerAccountId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_plan_versions_accountPlanId_versionNumber_key" ON "customer_account_plan_versions"("accountPlanId", "versionNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_success_objectives_workspaceId_objectiveNumber_key" ON "customer_success_objectives"("workspaceId", "objectiveNumber");
CREATE INDEX IF NOT EXISTS "customer_success_objectives_workspaceId_customerAccountId_status_idx" ON "customer_success_objectives"("workspaceId", "customerAccountId", "status");
CREATE INDEX IF NOT EXISTS "customer_success_objectives_workspaceId_targetDate_idx" ON "customer_success_objectives"("workspaceId", "targetDate");

CREATE INDEX IF NOT EXISTS "customer_objective_evidences_workspaceId_objectiveId_observationTimestamp_idx" ON "customer_objective_evidences"("workspaceId", "objectiveId", "observationTimestamp");

CREATE INDEX IF NOT EXISTS "customer_objective_blockers_workspaceId_objectiveId_status_idx" ON "customer_objective_blockers"("workspaceId", "objectiveId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_strategic_initiatives_workspaceId_initiativeNumber_key" ON "customer_strategic_initiatives"("workspaceId", "initiativeNumber");
CREATE INDEX IF NOT EXISTS "customer_strategic_initiatives_workspaceId_customerAccountId_status_idx" ON "customer_strategic_initiatives"("workspaceId", "customerAccountId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_executive_reviews_workspaceId_reviewNumber_key" ON "customer_executive_reviews"("workspaceId", "reviewNumber");
CREATE INDEX IF NOT EXISTS "customer_executive_reviews_workspaceId_customerAccountId_plannedDate_idx" ON "customer_executive_reviews"("workspaceId", "customerAccountId", "plannedDate");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_executive_review_commitments_workspaceId_idempotencyKey_key" ON "customer_executive_review_commitments"("workspaceId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "customer_portfolio_priority_evaluations_workspaceId_customerAccountId_isLatest_idx" ON "customer_portfolio_priority_evaluations"("workspaceId", "customerAccountId", "isLatest");
CREATE INDEX IF NOT EXISTS "customer_portfolio_priority_evaluations_workspaceId_priorityLevel_idx" ON "customer_portfolio_priority_evaluations"("workspaceId", "priorityLevel");

-- Foreign Keys
ALTER TABLE "customer_strategic_account_profiles" ADD CONSTRAINT "customer_strategic_account_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_strategic_account_profiles" ADD CONSTRAINT "customer_strategic_account_profiles_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_stakeholder_relationships" ADD CONSTRAINT "customer_stakeholder_relationships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_stakeholder_relationships" ADD CONSTRAINT "customer_stakeholder_relationships_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_stakeholder_relationships" ADD CONSTRAINT "customer_stakeholder_relationships_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_stakeholder_role_histories" ADD CONSTRAINT "customer_stakeholder_role_histories_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "customer_stakeholder_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_account_plans" ADD CONSTRAINT "customer_account_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_account_plans" ADD CONSTRAINT "customer_account_plans_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_account_plan_versions" ADD CONSTRAINT "customer_account_plan_versions_accountPlanId_fkey" FOREIGN KEY ("accountPlanId") REFERENCES "customer_account_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_success_objectives" ADD CONSTRAINT "customer_success_objectives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_success_objectives" ADD CONSTRAINT "customer_success_objectives_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_success_objectives" ADD CONSTRAINT "customer_success_objectives_accountPlanId_fkey" FOREIGN KEY ("accountPlanId") REFERENCES "customer_account_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_objective_evidences" ADD CONSTRAINT "customer_objective_evidences_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "customer_success_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_objective_blockers" ADD CONSTRAINT "customer_objective_blockers_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "customer_success_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_strategic_initiatives" ADD CONSTRAINT "customer_strategic_initiatives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_strategic_initiatives" ADD CONSTRAINT "customer_strategic_initiatives_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_strategic_initiatives" ADD CONSTRAINT "customer_strategic_initiatives_accountPlanId_fkey" FOREIGN KEY ("accountPlanId") REFERENCES "customer_account_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_strategic_milestones" ADD CONSTRAINT "customer_strategic_milestones_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "customer_strategic_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_executive_reviews" ADD CONSTRAINT "customer_executive_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_executive_reviews" ADD CONSTRAINT "customer_executive_reviews_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_executive_review_participants" ADD CONSTRAINT "customer_executive_review_participants_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "customer_executive_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_executive_review_participants" ADD CONSTRAINT "customer_executive_review_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_executive_review_commitments" ADD CONSTRAINT "customer_executive_review_commitments_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "customer_executive_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_portfolio_priority_evaluations" ADD CONSTRAINT "customer_portfolio_priority_evaluations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portfolio_priority_evaluations" ADD CONSTRAINT "customer_portfolio_priority_evaluations_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
