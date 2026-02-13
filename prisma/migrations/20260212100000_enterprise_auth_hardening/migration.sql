-- AlterTable UserSession: add refreshTokenHash for rotation + reuse detection
ALTER TABLE "UserSession" ADD COLUMN "refreshTokenHash" TEXT;

-- CreateIndex: unique for non-null hashes (allows multiple NULLs for legacy sessions)
CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key" ON "UserSession"("refreshTokenHash") WHERE "refreshTokenHash" IS NOT NULL;

-- AlterTable LoginAudit: add clinicId, failureReason, requestId
ALTER TABLE "LoginAudit" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "LoginAudit" ADD COLUMN "clinicId" INTEGER;
ALTER TABLE "LoginAudit" ADD COLUMN "requestId" TEXT;

-- CreateIndex for LoginAudit
CREATE INDEX "LoginAudit_clinicId_createdAt_idx" ON "LoginAudit"("clinicId", "createdAt" DESC);

CREATE INDEX "LoginAudit_requestId_idx" ON "LoginAudit"("requestId");
