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
const DLQ_SCAN_COUNT = parseInt(process.env.DLQ_SCAN_COUNT ?? '200', 10);
const DLQ_SCAN_MAX_ENTRIES = parseInt(process.env.DLQ_SCAN_MAX_ENTRIES ?? '5000', 10);
const DURABLE_FALLBACK_ENDPOINT = 'dlq-fallback';
const DURABLE_FALLBACK_ENABLED = process.env.DLQ_DURABLE_FALLBACK_ENABLED !== 'false';

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

interface DurableDlqRecord {
  id: number;
  source: string | null;
  eventId: string | null;
  payload: unknown;
  retryCount: number;
  metadata: unknown;
}

// =============================================================================
// REDIS CLIENT HELPER
// =============================================================================

async function withRequiredRedis<T>(
  label: string,
  operation: (redis: NonNullable<ReturnType<typeof cache.getClient>>) => Promise<T>,
): Promise<T> {
  const result = await cache.withClient<T | null>(
    `deadLetterQueue:${label}`,
    null,
    operation,
  );
  if (result === null) {
    throw new Error('Redis not configured — DLQ requires Upstash');
  }
  return result;
}

function getDurableMetadata(submission: QueuedSubmission): Record<string, unknown> {
  return {
    dlq: true,
    id: submission.id,
    source: submission.source,
    attemptCount: submission.attemptCount,
    lastError: submission.lastError,
    nextRetryAt: submission.nextRetryAt,
    createdAt: submission.createdAt,
    metadata: submission.metadata ?? {},
  };
}

function parseDurableSubmission(record: DurableDlqRecord): QueuedSubmission | null {
  const payload = record.payload;
  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  const dlqMeta =
    metadata.dlq && typeof metadata.dlq === 'object'
      ? (metadata.dlq as Record<string, unknown>)
      : metadata;

  if (!payload || typeof payload !== 'object') return null;
  const id = typeof record.eventId === 'string' ? record.eventId : undefined;
  if (!id) return null;

  const source =
    typeof record.source === 'string' &&
    [
      'weightlossintake',
      'wellmedr-intake',
      'wellmedr-invoice',
      'heyflow',
      'medlink',
      'direct',
      'overtime-intake',
    ].includes(record.source)
      ? (record.source as QueuedSubmission['source'])
      : 'direct';

  const nextRetryAt =
    typeof dlqMeta.nextRetryAt === 'string'
      ? dlqMeta.nextRetryAt
      : calculateNextRetry(Math.max(0, record.retryCount));
  const createdAt =
    typeof dlqMeta.createdAt === 'string' ? dlqMeta.createdAt : new Date().toISOString();
  const lastAttemptAt =
    typeof dlqMeta.lastAttemptAt === 'string' ? dlqMeta.lastAttemptAt : new Date().toISOString();
  const lastError =
    typeof dlqMeta.lastError === 'string' ? dlqMeta.lastError : 'Unknown error';

  return {
    id,
    payload: payload as Record<string, unknown>,
    source,
    attemptCount: Math.max(0, record.retryCount),
    lastAttemptAt,
    lastError,
    nextRetryAt,
    createdAt,
    metadata:
      dlqMeta.metadata && typeof dlqMeta.metadata === 'object'
        ? (dlqMeta.metadata as QueuedSubmission['metadata'])
        : undefined,
  };
}

async function createDurableFallbackRecord(submission: QueuedSubmission): Promise<void> {
  if (!DURABLE_FALLBACK_ENABLED) return;
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.webhookLog.upsert({
      where: {
        source_eventId: {
          source: submission.source,
          eventId: submission.id,
        },
      },
      create: {
        source: submission.source,
        eventId: submission.id,
        eventType: 'dlq_submission',
        endpoint: DURABLE_FALLBACK_ENDPOINT,
        method: 'SYSTEM',
        status: 'PROCESSING_ERROR',
        payload: submission.payload,
        retryCount: submission.attemptCount,
        lastRetryAt: new Date(submission.lastAttemptAt),
        metadata: getDurableMetadata(submission),
      },
      update: {
        status: 'PROCESSING_ERROR',
        payload: submission.payload,
        retryCount: submission.attemptCount,
        lastRetryAt: new Date(submission.lastAttemptAt),
        metadata: getDurableMetadata(submission),
      },
    });
  } catch (error) {
    logger.error('[DLQ] Durable fallback write failed', {
      id: submission.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function listDurableFallbackRecords(): Promise<QueuedSubmission[]> {
  if (!DURABLE_FALLBACK_ENABLED) return [];
  try {
    const { prisma } = await import('@/lib/db');
    const rows = await prisma.webhookLog.findMany({
      where: {
        endpoint: DURABLE_FALLBACK_ENDPOINT,
      },
      select: {
        id: true,
        source: true,
        eventId: true,
        payload: true,
        retryCount: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    const parsed: QueuedSubmission[] = [];
    for (const row of rows) {
      const submission = parseDurableSubmission(row as DurableDlqRecord);
      if (submission) parsed.push(submission);
    }
    return parsed;
  } catch (error) {
    logger.error('[DLQ] Durable fallback read failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function removeDurableFallbackRecord(id: string, source: QueuedSubmission['source']): Promise<void> {
  if (!DURABLE_FALLBACK_ENABLED) return;
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.webhookLog.deleteMany({
      where: {
        endpoint: DURABLE_FALLBACK_ENDPOINT,
        source,
        eventId: id,
      },
    });
  } catch (error) {
    logger.error('[DLQ] Durable fallback delete failed', {
      id,
      source,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Incrementally scan DLQ hash entries to avoid loading very large hashes
 * with a single HGETALL call.
 */
async function scanDlqEntries(): Promise<Record<string, string>> {
  return withRequiredRedis('scanDlqEntries', async (redis) => {
    const entries: Record<string, string> = {};
    let entryCount = 0;
    let cursor: string | number = 0;
    do {
      const [nextCursor, batch] = await redis.hscan(DLQ_KEY, cursor, { count: DLQ_SCAN_COUNT });
      for (let i = 0; i < batch.length; i += 2) {
        const field = batch[i];
        const value = batch[i + 1];
        if (typeof field === 'string' && typeof value === 'string') {
          entries[field] = value;
          entryCount += 1;
          if (entryCount >= DLQ_SCAN_MAX_ENTRIES) {
            logger.warn('[DLQ] Scan entry cap reached; returning partial result set', {
              scanMaxEntries: DLQ_SCAN_MAX_ENTRIES,
            });
            return entries;
          }
        }
      }
      cursor = nextCursor;
    } while (String(cursor) !== '0');
    return entries;
  });
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

  try {
    await withRequiredRedis('queueFailedSubmission', async (redis) => {
      await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
      await redis.hincrby(DLQ_STATS_KEY, 'totalQueued', 1);
      return true;
    });
  } catch (error) {
    logger.error('[DLQ] Redis queue write failed; using durable fallback', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Dual-write for durability and outage recovery.
  await createDurableFallbackRecord(submission);

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
  let all: Record<string, string> = {};
  try {
    all = await scanDlqEntries();
  } catch (error) {
    logger.warn('[DLQ] Redis scan failed; reading durable fallback store', {
      error: error instanceof Error ? error.message : String(error),
    });
    const durableRows = await listDurableFallbackRecords();
    const now = Date.now();
    return durableRows
      .filter(
        (submission) =>
          new Date(submission.nextRetryAt).getTime() <= now &&
          submission.attemptCount < MAX_RETRY_ATTEMPTS,
      )
      .sort((a, b) => new Date(a.nextRetryAt).getTime() - new Date(b.nextRetryAt).getTime());
  }

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
  let all: Record<string, string> = {};
  try {
    all = await scanDlqEntries();
  } catch (error) {
    logger.warn('[DLQ] Redis scan failed; returning durable fallback rows', {
      error: error instanceof Error ? error.message : String(error),
    });
    return listDurableFallbackRecords();
  }

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
  let raw: string | null = null;
  try {
    raw = await withRequiredRedis('updateSubmissionAttempt:get', async (redis) =>
      redis.hget<string>(DLQ_KEY, id),
    );
  } catch (error) {
    logger.warn('[DLQ] Redis read failed during update; trying durable fallback', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!raw) {
    const durableRows = await listDurableFallbackRecords();
    const durable = durableRows.find((row) => row.id === id);
    if (durable) {
      const updated: QueuedSubmission = {
        ...durable,
        attemptCount: durable.attemptCount + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error || durable.lastError,
        nextRetryAt: success
          ? durable.nextRetryAt
          : calculateNextRetry(durable.attemptCount + 1),
      };

      if (success) {
        await removeDurableFallbackRecord(updated.id, updated.source);
      } else {
        await createDurableFallbackRecord(updated);
      }
      return;
    }
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
    await withRequiredRedis('updateSubmissionAttempt:success', async (redis) => {
      await redis.hdel(DLQ_KEY, id);
      await redis.hincrby(DLQ_STATS_KEY, 'totalProcessed', 1);
      await redis.hset(DLQ_STATS_KEY, { lastProcessedAt: new Date().toISOString() });
      return true;
    });

    logger.info(`[DLQ] Successfully processed ${id} after ${submission.attemptCount} attempts`);
    await removeDurableFallbackRecord(submission.id, submission.source);
  } else if (submission.attemptCount >= MAX_RETRY_ATTEMPTS) {
    // Move to exhausted state
    submission.lastError = error || 'Max retries exhausted';
    await withRequiredRedis('updateSubmissionAttempt:exhausted', async (redis) => {
      await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
      await redis.hincrby(DLQ_STATS_KEY, 'totalExhausted', 1);
      return true;
    });

    logger.error(`[DLQ] Submission ${id} exhausted all ${MAX_RETRY_ATTEMPTS} retries`, {
      metadata: submission.metadata,
      lastError: error,
    });

    // Trigger alert
    await sendExhaustionAlert(submission);
    await createDurableFallbackRecord(submission);
  } else {
    // Update for next retry
    submission.lastError = error || 'Unknown error';
    submission.nextRetryAt = calculateNextRetry(submission.attemptCount);
    await withRequiredRedis('updateSubmissionAttempt:failed', async (redis) => {
      await redis.hset(DLQ_KEY, { [id]: JSON.stringify(submission) });
      await redis.hincrby(DLQ_STATS_KEY, 'totalFailed', 1);
      return true;
    });

    logger.info(
      `[DLQ] Submission ${id} failed attempt ${submission.attemptCount}, next retry at ${submission.nextRetryAt}`
    );
    await createDurableFallbackRecord(submission);
  }
}

/**
 * Remove a submission from the queue (manual intervention)
 */
export async function removeSubmission(id: string): Promise<boolean> {
  try {
    const result = await withRequiredRedis('removeSubmission', async (redis) =>
      redis.hdel(DLQ_KEY, id),
    );
    if (result === 1) return true;
  } catch {
    // continue to durable fallback removal
  }

  const durableRows = await listDurableFallbackRecords();
  const match = durableRows.find((row) => row.id === id);
  if (match) {
    await removeDurableFallbackRecord(match.id, match.source);
    return true;
  }
  return false;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<DLQStats & { pending: number; exhausted: number }> {
  let statsRaw: Record<string, string> | null = null;
  try {
    statsRaw = await withRequiredRedis('getQueueStats', async (redis) =>
      redis.hgetall<Record<string, string>>(DLQ_STATS_KEY),
    );
  } catch {
    statsRaw = null;
  }
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
