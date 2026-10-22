-- AlterTable
ALTER TABLE "workflows" ADD COLUMN "webhookSlug" TEXT,
ADD COLUMN "webhookSecret" TEXT;

-- CreateTable
CREATE TABLE "webhook_event_receipts" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceIp" TEXT,
    "headers" JSONB,
    "payload" JSONB,
    "executionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_triggers" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_triggers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "retryOfId" TEXT,
ADD COLUMN "correlationId" TEXT,
ADD COLUMN "errorCategory" TEXT,
ADD COLUMN "executionTrace" JSONB,
ADD COLUMN "nextRetryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workflow_step_executions" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "correlationId" TEXT,
ADD COLUMN "errorCategory" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workflows_webhookSlug_key" ON "workflows"("webhookSlug");

-- CreateIndex
CREATE INDEX "webhook_event_receipts_workflowId_createdAt_idx" ON "webhook_event_receipts"("workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_receipts_workflowId_eventId_key" ON "webhook_event_receipts"("workflowId", "eventId");

-- CreateIndex
CREATE INDEX "scheduled_triggers_workflowId_idx" ON "scheduled_triggers"("workflowId");

-- CreateIndex
CREATE INDEX "scheduled_triggers_status_nextRunAt_idx" ON "scheduled_triggers"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "workflow_executions_correlationId_idx" ON "workflow_executions"("correlationId");

-- AddForeignKey
ALTER TABLE "webhook_event_receipts" ADD CONSTRAINT "webhook_event_receipts_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
