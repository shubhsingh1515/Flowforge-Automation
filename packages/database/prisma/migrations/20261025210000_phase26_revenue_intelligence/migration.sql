-- Phase 26: Enterprise Revenue Intelligence, Renewal Management & Retention Governance Migration

-- CreateTable customer_contracts
CREATE TABLE IF NOT EXISTS "customer_contracts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerUserId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "termEndDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "renewalNoticeDeadline" TIMESTAMP(3),
    "contractValue" DOUBLE PRECISION NOT NULL,
    "annualRecurringValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "contractType" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "renewalType" TEXT NOT NULL DEFAULT 'MANUAL',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewalTermsDays" INTEGER NOT NULL DEFAULT 365,
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "sourceSystem" TEXT,
    "externalContractId" TEXT,
    "dataClassification" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
    "previousContractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "customer_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_contract_changes
CREATE TABLE IF NOT EXISTS "customer_contract_changes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "fieldName" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contract_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_renewal_opportunities
CREATE TABLE IF NOT EXISTS "customer_renewal_opportunities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "opportunityNumber" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "renewalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stage" TEXT NOT NULL DEFAULT 'UPCOMING',
    "outcome" TEXT,
    "riskClassification" TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "riskScore" DOUBLE PRECISION,
    "nextAction" TEXT,
    "nextActionDueDate" TIMESTAMP(3),
    "qualificationNotes" TEXT,
    "supportingEvidence" JSONB NOT NULL DEFAULT '[]',
    "lastActivityAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_renewal_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_renewal_timeline_events
CREATE TABLE IF NOT EXISTS "customer_renewal_timeline_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "renewalOpportunityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "description" TEXT,
    "previousStage" TEXT,
    "newStage" TEXT,
    "actorId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_renewal_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_renewal_risk_evaluations
CREATE TABLE IF NOT EXISTS "customer_renewal_risk_evaluations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "renewalOpportunityId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0',
    "riskLevel" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "evaluationTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contributingSignals" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "inputsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "isLatest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_renewal_risk_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_expansion_opportunities
CREATE TABLE IF NOT EXISTS "customer_expansion_opportunities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "opportunityNumber" TEXT NOT NULL,
    "opportunityType" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'DETECTED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "estimateSource" TEXT,
    "evidenceSignals" JSONB NOT NULL DEFAULT '[]',
    "qualificationNotes" TEXT,
    "nextAction" TEXT,
    "nextActionDueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_expansion_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_expansion_stage_histories
CREATE TABLE IF NOT EXISTS "customer_expansion_stage_histories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "notes" TEXT,
    "actorId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_expansion_stage_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable customer_revenue_policies
CREATE TABLE IF NOT EXISTS "customer_revenue_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0',
    "renewalPreparationDays" INTEGER NOT NULL DEFAULT 90,
    "healthReviewDays" INTEGER NOT NULL DEFAULT 60,
    "engagementDays" INTEGER NOT NULL DEFAULT 45,
    "commercialReviewDays" INTEGER NOT NULL DEFAULT 30,
    "riskThresholds" JSONB NOT NULL DEFAULT '{"moderate": 30, "high": 60, "critical": 80}',
    "alertCooldownHours" INTEGER NOT NULL DEFAULT 72,
    "autoTaskGeneration" BOOLEAN NOT NULL DEFAULT true,
    "expansionRules" JSONB NOT NULL DEFAULT '{"utilizationGrowthPercent": 25, "consecutiveHighUsageDays": 14}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_revenue_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contracts_workspaceId_contractNumber_key" ON "customer_contracts"("workspaceId", "contractNumber");
CREATE INDEX IF NOT EXISTS "customer_contracts_workspaceId_status_idx" ON "customer_contracts"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "customer_contracts_workspaceId_renewalDate_idx" ON "customer_contracts"("workspaceId", "renewalDate");
CREATE INDEX IF NOT EXISTS "customer_contracts_workspaceId_customerAccountId_idx" ON "customer_contracts"("workspaceId", "customerAccountId");

CREATE INDEX IF NOT EXISTS "customer_contract_changes_workspaceId_contractId_idx" ON "customer_contract_changes"("workspaceId", "contractId");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_renewal_opportunities_workspaceId_opportunityNumber_key" ON "customer_renewal_opportunities"("workspaceId", "opportunityNumber");
CREATE INDEX IF NOT EXISTS "customer_renewal_opportunities_workspaceId_stage_idx" ON "customer_renewal_opportunities"("workspaceId", "stage");
CREATE INDEX IF NOT EXISTS "customer_renewal_opportunities_workspaceId_targetDate_idx" ON "customer_renewal_opportunities"("workspaceId", "targetDate");
CREATE INDEX IF NOT EXISTS "customer_renewal_opportunities_workspaceId_riskClassification_idx" ON "customer_renewal_opportunities"("workspaceId", "riskClassification");
CREATE INDEX IF NOT EXISTS "customer_renewal_opportunities_workspaceId_customerAccountId_idx" ON "customer_renewal_opportunities"("workspaceId", "customerAccountId");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_renewal_timeline_events_workspaceId_idempotencyKey_key" ON "customer_renewal_timeline_events"("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "customer_renewal_timeline_events_workspaceId_renewalOpportunityId_createdAt_idx" ON "customer_renewal_timeline_events"("workspaceId", "renewalOpportunityId", "createdAt");

CREATE INDEX IF NOT EXISTS "customer_renewal_risk_evaluations_workspaceId_renewalOpportunityId_evaluationTimestamp_idx" ON "customer_renewal_risk_evaluations"("workspaceId", "renewalOpportunityId", "evaluationTimestamp");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_expansion_opportunities_workspaceId_opportunityNumber_key" ON "customer_expansion_opportunities"("workspaceId", "opportunityNumber");
CREATE INDEX IF NOT EXISTS "customer_expansion_opportunities_workspaceId_stage_idx" ON "customer_expansion_opportunities"("workspaceId", "stage");
CREATE INDEX IF NOT EXISTS "customer_expansion_opportunities_workspaceId_customerAccountId_idx" ON "customer_expansion_opportunities"("workspaceId", "customerAccountId");

CREATE INDEX IF NOT EXISTS "customer_expansion_stage_histories_workspaceId_opportunityId_changedAt_idx" ON "customer_expansion_stage_histories"("workspaceId", "opportunityId", "changedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_revenue_policies_workspaceId_key" ON "customer_revenue_policies"("workspaceId");

-- AddForeignKeys
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "customer_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_contract_changes" ADD CONSTRAINT "customer_contract_changes_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "customer_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_renewal_opportunities" ADD CONSTRAINT "customer_renewal_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_renewal_opportunities" ADD CONSTRAINT "customer_renewal_opportunities_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "customer_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_renewal_opportunities" ADD CONSTRAINT "customer_renewal_opportunities_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_renewal_timeline_events" ADD CONSTRAINT "customer_renewal_timeline_events_renewalOpportunityId_fkey" FOREIGN KEY ("renewalOpportunityId") REFERENCES "customer_renewal_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_renewal_risk_evaluations" ADD CONSTRAINT "customer_renewal_risk_evaluations_renewalOpportunityId_fkey" FOREIGN KEY ("renewalOpportunityId") REFERENCES "customer_renewal_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_expansion_opportunities" ADD CONSTRAINT "customer_expansion_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_expansion_opportunities" ADD CONSTRAINT "customer_expansion_opportunities_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_expansion_stage_histories" ADD CONSTRAINT "customer_expansion_stage_histories_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "customer_expansion_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_revenue_policies" ADD CONSTRAINT "customer_revenue_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
