/**
 * Dead Letter Queue (DLQ) for failed EONPRO submissions
 *
 * Uses Upstash Redis for persistent storage across serverless invocations.
 * Implements exponential backoff with 10 retry attempts.
 *
 * Phase 2 of the 5-Phase Integration Plan
 */

import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DLQ_KEY = 'eonpro:dlq';
const DLQ_PROCESSING_KEY = 'eonpro:dlq:processing';
const DLQ_STATS_KEY = 'eonpro:dlq:stats';

const MAX_RETRY_ATTEMPTS = 10;
const BASE_DELAY_MS = 60_000; // 1 minute base delay
const MAX_DELAY_MS = 3_600_000; // 1 hour max delay

// =============================================================================
// TYPES
// =============================================================================

export interface QueuedSubmission {
  id: string;
  payload: Record<string, unknown>;
  source:
    | 'weightlossintake'
    | 'wellmedr-intake'
    | 'wellmedr-invoice'
    | 'heyflow'
    | 'medlink'
    | 'direct'
    | 'overtime-intake';
  attemptCount: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
  createdAt: string;
  metadata?: {
    patientEmail?: string;
    submissionId?: string;
    sessionId?: string;
    treatmentType?: string;
  };
}

export interface DLQStats {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  totalExhausted: number;
  lastProcessedAt: string | null;
}

// =============================================================================
// REDIS CLIENT HELPER
// =============================================================================

function getRedis() {
  const client = cache.getClient();
  if (!client) {
    throw new Error('Redis not configured — DLQ requires Upstash');
  }
  return client;
}

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

/**
 * Check if DLQ is configured and available
 */
export function isDLQConfigured(): boolean {
  return cache.isReady();
}

/**
 * Add a failed submission to the queue
 */
export async function queueFailedSubmission(
  payload: Record<string, unknown>,
  source: QueuedSubmission['source'],
  error: string,
  metadata?: QueuedSubmission['metadata']
): Promise<string> {
  const id = `dlq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const submission: QueuedSubmission = {
    id,
    payload,
    source,
    attemptCount: 0,
    lastAttemptAt: now,
    lastError: error,
    nextRetryAt: calculateNextRetry(0),
    createdAt: now,
    metadata,
  };

  const redis = getRedis();
  await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
  await redis.hincrby(DLQ_STATS_KEY, 'totalQueued', 1);

  logger.info(`[DLQ] Queued submission ${id}`, {
    source,
    error: error.slice(0, 200),
    metadata,
  });

  return id;
}

/**
 * Get all queued submissions ready for retry
 */
export async function getReadySubmissions(): Promise<QueuedSubmission[]> {
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, string>>(DLQ_KEY);

  if (!all || Object.keys(all).length === 0) {
    return [];
  }

  const now = Date.now();
  const ready: QueuedSubmission[] = [];

  const { safeParseJsonString } = await import('@/lib/utils/safe-json');
  for (const value of Object.values(all)) {
    const submission = safeParseJsonString<QueuedSubmission>(value);
    if (!submission) continue;
    const retryTime = new Date(submission.nextRetryAt).getTime();
    if (retryTime <= now && submission.attemptCount < MAX_RETRY_ATTEMPTS) {
      ready.push(submission);
    }
  }

  ready.sort((a, b) => new Date(a.nextRetryAt).getTime() - new Date(b.nextRetryAt).getTime());

  return ready;
}

/**
 * Get all queued submissions (for monitoring)
 */
export async function getAllSubmissions(): Promise<QueuedSubmission[]> {
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, string>>(DLQ_KEY);

  if (!all || Object.keys(all).length === 0) {
    return [];
  }

  const submissions: QueuedSubmission[] = [];

  const { safeParseJsonString } = await import('@/lib/utils/safe-json');
  for (const value of Object.values(all)) {
    const submission = safeParseJsonString<QueuedSubmission>(value);
    if (submission) submissions.push(submission);
  }

  return submissions;
}

/**
 * Update submission after a retry attempt
 */
export async function updateSubmissionAttempt(
  id: string,
  success: boolean,
  error?: string
): Promise<void> {
  const redis = getRedis();
  const raw = await redis.hget<string>(DLQ_KEY, id);

  if (!raw) {
    logger.warn(`[DLQ] Submission ${id} not found for update`);
    return;
  }

  const { safeParseJsonString } = await import('@/lib/utils/safe-json');
  const submission = safeParseJsonString<QueuedSubmission>(raw);
  if (!submission) {
    logger.warn(`[DLQ] Submission ${id} has invalid JSON for update`);
    return;
  }
  submission.attemptCount += 1;
  submission.lastAttemptAt = new Date().toISOString();

  if (success) {
    await redis.hdel(DLQ_KEY, id);
    await redis.hincrby(DLQ_STATS_KEY, 'totalProcessed', 1);
    await redis.hset(DLQ_STATS_KEY, { lastProcessedAt: new Date().toISOString() });

    logger.info(`[DLQ] Successfully processed ${id} after ${submission.attemptCount} attempts`);
  } else if (submission.attemptCount >= MAX_RETRY_ATTEMPTS) {
    // Move to exhausted state
    submission.lastError = error || 'Max retries exhausted';
    await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
    await redis.hincrby(DLQ_STATS_KEY, 'totalExhausted', 1);

    logger.error(`[DLQ] Submission ${id} exhausted all ${MAX_RETRY_ATTEMPTS} retries`, {
      metadata: submission.metadata,
      lastError: error,
    });

    // Trigger alert
    await sendExhaustionAlert(submission);
  } else {
    // Update for next retry
    submission.lastError = error || 'Unknown error';
    submission.nextRetryAt = calculateNextRetry(submission.attemptCount);
    await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
    await redis.hincrby(DLQ_STATS_KEY, 'totalFailed', 1);

    logger.info(
      `[DLQ] Submission ${id} failed attempt ${submission.attemptCount}, next retry at ${submission.nextRetryAt}`
    );
  }
}

/**
 * Remove a submission from the queue (manual intervention)
 */
export async function removeSubmission(id: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.hdel(DLQ_KEY, id);
  return result === 1;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<DLQStats & { pending: number; exhausted: number }> {
  const redis = getRedis();
  const statsRaw = await redis.hgetall<Record<string, string>>(DLQ_STATS_KEY);
  const submissions = await getAllSubmissions();

  const stats: DLQStats = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalExhausted: 0,
    lastProcessedAt: null,
  };

  if (statsRaw) {
    for (const [key, value] of Object.entries(statsRaw)) {
      if (key === 'lastProcessedAt') {
        stats.lastProcessedAt = value;
      } else if (key in stats) {
        (stats as unknown as Record<string, unknown>)[key] = parseInt(value, 10) || 0;
      }
    }
  }

  const pending = submissions.filter((s) => s.attemptCount < MAX_RETRY_ATTEMPTS).length;
  const exhausted = submissions.filter((s) => s.attemptCount >= MAX_RETRY_ATTEMPTS).length;

  return { ...stats, pending, exhausted };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate next retry time with exponential backoff
 * Attempt 1: 1 min, 2: 2 min, 3: 4 min, 4: 8 min, 5: 16 min, 6: 32 min, 7+: 1 hour
 */
function calculateNextRetry(attemptCount: number): string {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attemptCount), MAX_DELAY_MS);
  return new Date(Date.now() + delay).toISOString();
}

/**
 * Send alert when retries are exhausted
 */
async function sendExhaustionAlert(submission: QueuedSubmission): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  const alertEmail = process.env.ALERT_EMAIL;

  const message = {
    text: `[EONPRO DLQ ALERT] Submission exhausted all retries`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'DLQ: Submission Failed After 10 Retries',
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*ID:* ${submission.id}` },
          { type: 'mrkdwn', text: `*Source:* ${submission.source}` },
          { type: 'mrkdwn', text: `*Patient:* ${submission.metadata?.patientEmail || 'Unknown'}` },
          { type: 'mrkdwn', text: `*Created:* ${submission.createdAt}` },
          { type: 'mrkdwn', text: `*Last Error:* ${submission.lastError.slice(0, 100)}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Manual intervention required. Check the admin dashboard or Upstash console.',
        },
      },
    ],
  };

  // Send to Slack if configured
  if (slackWebhookUrl) {
    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      logger.info('[DLQ] Sent Slack alert for exhausted submission');
    } catch (err) {
      logger.error('[DLQ] Failed to send Slack alert:', err);
    }
  }

  // Log for email alert (can be picked up by monitoring)
  if (alertEmail) {
    logger.error(`[DLQ] ALERT EMAIL NEEDED: ${alertEmail}`, {
      submission: {
        id: submission.id,
        source: submission.source,
        metadata: submission.metadata,
        lastError: submission.lastError,
      },
    });
  }
}
