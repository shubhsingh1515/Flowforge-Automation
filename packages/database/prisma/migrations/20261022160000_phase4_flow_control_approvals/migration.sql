-- Phase 4: Advanced Workflow Logic, Flow Control, State Management & Approvals

-- 1. Update ExecutionStatus enum to include WAITING_APPROVAL
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'WAITING_APPROVAL';

-- 2. Extend workflow_executions table
ALTER TABLE "workflow_executions" 
  ADD COLUMN IF NOT EXISTS "executionState" JSONB,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "resumedAt" TIMESTAMP(3);

-- 3. Extend workflow_step_executions table
ALTER TABLE "workflow_step_executions" 
  ADD COLUMN IF NOT EXISTS "iteration" INTEGER,
  ADD COLUMN IF NOT EXISTS "branch" TEXT;

-- 4. Create workflow_approvals table
CREATE TABLE IF NOT EXISTS "workflow_approvals" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "stepId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "context" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requiredRole" "WorkspaceRole",
  "decision" TEXT,
  "comment" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "timeoutSeconds" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "resumeNodeId" TEXT,
  "rejectNodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_approvals_pkey" PRIMARY KEY ("id")
);

-- 5. Foreign keys
ALTER TABLE "workflow_approvals" 
  ADD CONSTRAINT "workflow_approvals_workflowId_fkey" 
  FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals" 
  ADD CONSTRAINT "workflow_approvals_executionId_fkey" 
  FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Indices
CREATE INDEX IF NOT EXISTS "workflow_approvals_workspaceId_status_idx" ON "workflow_approvals"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "workflow_approvals_executionId_idx" ON "workflow_approvals"("executionId");
CREATE INDEX IF NOT EXISTS "workflow_approvals_status_expiresAt_idx" ON "workflow_approvals"("status", "expiresAt");
