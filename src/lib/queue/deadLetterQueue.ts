/**
 * Dead Letter Queue (DLQ) for failed EONPRO submissions
 * 
 * Uses Upstash Redis for persistent storage across serverless invocations.
 * Implements exponential backoff with 10 retry attempts.
 * 
 * Phase 2 of the 5-Phase Integration Plan
 */

import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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
  source: 'weightlossintake' | 'heyflow' | 'medlink' | 'direct';
  attemptCount: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
  createdAt: string;
  metadata?: {
    patientEmail?: string;
    submissionId?: string;
    sessionId?: string;
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
// UPSTASH REST API HELPERS
// =============================================================================

async function upstashCommand(command: string[]): Promise<unknown> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
    throw new Error('Upstash Redis not configured');
  }

  const response = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upstash error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.result;
}

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

/**
 * Check if DLQ is configured and available
 */
export function isDLQConfigured(): boolean {
  return Boolean(UPSTASH_REST_URL && UPSTASH_REST_TOKEN);
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

  await upstashCommand(['HSET', DLQ_KEY, id, JSON.stringify(submission)]);
  
  // Update stats
  await upstashCommand(['HINCRBY', DLQ_STATS_KEY, 'totalQueued', '1']);
  
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
  const all = await upstashCommand(['HGETALL', DLQ_KEY]) as string[] | null;
  
  if (!all || all.length === 0) {
    return [];
  }

  const now = Date.now();
  const ready: QueuedSubmission[] = [];

  // HGETALL returns [key1, val1, key2, val2, ...]
  for (let i = 0; i < all.length; i += 2) {
    try {
      const submission = JSON.parse(all[i + 1]) as QueuedSubmission;
      const retryTime = new Date(submission.nextRetryAt).getTime();
      
      if (retryTime <= now && submission.attemptCount < MAX_RETRY_ATTEMPTS) {
        ready.push(submission);
      }
    } catch {
      // Skip malformed entries
    }
  }

  // Sort by retry time (oldest first)
  ready.sort((a, b) => 
    new Date(a.nextRetryAt).getTime() - new Date(b.nextRetryAt).getTime()
  );

  return ready;
}

/**
 * Get all queued submissions (for monitoring)
 */
export async function getAllSubmissions(): Promise<QueuedSubmission[]> {
  const all = await upstashCommand(['HGETALL', DLQ_KEY]) as string[] | null;
  
  if (!all || all.length === 0) {
    return [];
  }

  const submissions: QueuedSubmission[] = [];

  for (let i = 0; i < all.length; i += 2) {
    try {
      submissions.push(JSON.parse(all[i + 1]) as QueuedSubmission);
    } catch {
      // Skip malformed entries
    }
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
  const raw = await upstashCommand(['HGET', DLQ_KEY, id]) as string | null;
  
  if (!raw) {
    logger.warn(`[DLQ] Submission ${id} not found for update`);
    return;
  }

  const submission = JSON.parse(raw) as QueuedSubmission;
  submission.attemptCount += 1;
  submission.lastAttemptAt = new Date().toISOString();
  
  if (success) {
    // Remove from queue on success
    await upstashCommand(['HDEL', DLQ_KEY, id]);
    await upstashCommand(['HINCRBY', DLQ_STATS_KEY, 'totalProcessed', '1']);
    await upstashCommand(['HSET', DLQ_STATS_KEY, 'lastProcessedAt', new Date().toISOString()]);
    
    logger.info(`[DLQ] Successfully processed ${id} after ${submission.attemptCount} attempts`);
  } else if (submission.attemptCount >= MAX_RETRY_ATTEMPTS) {
    // Move to exhausted state
    submission.lastError = error || 'Max retries exhausted';
    await upstashCommand(['HSET', DLQ_KEY, id, JSON.stringify(submission)]);
    await upstashCommand(['HINCRBY', DLQ_STATS_KEY, 'totalExhausted', '1']);
    
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
    await upstashCommand(['HSET', DLQ_KEY, id, JSON.stringify(submission)]);
    await upstashCommand(['HINCRBY', DLQ_STATS_KEY, 'totalFailed', '1']);
    
    logger.info(`[DLQ] Submission ${id} failed attempt ${submission.attemptCount}, next retry at ${submission.nextRetryAt}`);
  }
}

/**
 * Remove a submission from the queue (manual intervention)
 */
export async function removeSubmission(id: string): Promise<boolean> {
  const result = await upstashCommand(['HDEL', DLQ_KEY, id]);
  return result === 1;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<DLQStats & { pending: number; exhausted: number }> {
  const statsRaw = await upstashCommand(['HGETALL', DLQ_STATS_KEY]) as string[] | null;
  const submissions = await getAllSubmissions();
  
  const stats: DLQStats = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalExhausted: 0,
    lastProcessedAt: null,
  };

  if (statsRaw) {
    for (let i = 0; i < statsRaw.length; i += 2) {
      const key = statsRaw[i] as keyof DLQStats;
      const value = statsRaw[i + 1];
      if (key === 'lastProcessedAt') {
        stats[key] = value;
      } else if (key in stats) {
        (stats as Record<string, unknown>)[key] = parseInt(value, 10) || 0;
      }
    }
  }

  const pending = submissions.filter(s => s.attemptCount < MAX_RETRY_ATTEMPTS).length;
  const exhausted = submissions.filter(s => s.attemptCount >= MAX_RETRY_ATTEMPTS).length;

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
  const delay = Math.min(
    BASE_DELAY_MS * Math.pow(2, attemptCount),
    MAX_DELAY_MS
  );
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
