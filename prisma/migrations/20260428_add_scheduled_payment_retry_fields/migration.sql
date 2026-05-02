-- ============================================================================
-- Migration: add retry-tracking fields to ScheduledPayment
-- ============================================================================
-- Adds attemptCount / lastAttemptAt / failureReason to support bounded
-- retries on the AUTO_CHARGE cron (process-scheduled-payments). Also adds
-- a covering index for the new cron query, which now filters by
-- status + scheduledDate + attemptCount.
--
-- Safe additive change: new columns default to 0 / NULL, no data backfill
-- required, no FK or constraint changes.
-- ============================================================================

ALTER TABLE "ScheduledPayment"
    ADD COLUMN "attemptCount"   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAttemptAt"  TIMESTAMP(3),
    ADD COLUMN "failureReason"  TEXT;

CREATE INDEX "ScheduledPayment_status_scheduledDate_attemptCount_idx"
    ON "ScheduledPayment" ("status", "scheduledDate", "attemptCount");
