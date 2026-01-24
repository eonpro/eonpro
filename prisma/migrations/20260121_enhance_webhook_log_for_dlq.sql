-- Enhance WebhookLog for Dead Letter Queue functionality

-- Add new columns for DLQ
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "eventId" TEXT;
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "eventType" TEXT;
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER DEFAULT 0;
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "lastRetryAt" TIMESTAMP(3);
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Make some columns optional (they were previously required)
ALTER TABLE "WebhookLog" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "WebhookLog" ALTER COLUMN "method" DROP NOT NULL;
ALTER TABLE "WebhookLog" ALTER COLUMN "statusCode" DROP NOT NULL;

-- Create unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookLog_source_eventId_key" ON "WebhookLog"("source", "eventId") WHERE "eventId" IS NOT NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "WebhookLog_source_eventId_idx" ON "WebhookLog"("source", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookLog_source_status_idx" ON "WebhookLog"("source", "status");
