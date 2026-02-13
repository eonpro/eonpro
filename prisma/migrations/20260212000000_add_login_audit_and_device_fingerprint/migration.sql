-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN "deviceFingerprint" TEXT;

-- CreateTable
CREATE TABLE "LoginAudit" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAudit_email_createdAt_idx" ON "LoginAudit"("email", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAudit_outcome_createdAt_idx" ON "LoginAudit"("outcome", "createdAt" DESC);
