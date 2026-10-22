-- AlterTable
ALTER TABLE "connected_accounts" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "connected_accounts" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "oauth_authorization_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_states_state_key" ON "oauth_authorization_states"("state");

-- CreateIndex
CREATE INDEX "oauth_authorization_states_state_idx" ON "oauth_authorization_states"("state");

-- CreateIndex
CREATE INDEX "oauth_authorization_states_workspaceId_idx" ON "oauth_authorization_states"("workspaceId");
