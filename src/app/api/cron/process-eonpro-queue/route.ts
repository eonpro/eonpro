/**
 * Cron job to process the Dead Letter Queue
 * 
 * Runs every 5 minutes via Vercel Cron or external trigger.
 * Processes failed submissions and retries them.
 * 
 * Configure in vercel.json with schedule: "every 5 minutes"
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/integrations/logging';
import {
  isDLQConfigured,
  getReadySubmissions,
  updateSubmissionAttempt,
  getQueueStats,
  type QueuedSubmission,
} from '@/lib/queue/deadLetterQueue';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `cron-${Date.now()}`;

  // Verify authorization
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.nextUrl.searchParams.get('secret');
  
  // Allow Vercel Cron (no auth needed) or manual trigger with secret
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const hasValidSecret = CRON_SECRET && (
    authHeader === `Bearer ${CRON_SECRET}` ||
    cronSecret === CRON_SECRET
  );

  if (!isVercelCron && !hasValidSecret && CRON_SECRET) {
    logger.warn(`[CRON ${requestId}] Unauthorized access attempt`);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info(`[CRON ${requestId}] Starting DLQ processing`);

  // Check if DLQ is configured
  if (!isDLQConfigured()) {
    logger.warn(`[CRON ${requestId}] DLQ not configured, skipping`);
    return Response.json({
      success: true,
      message: 'DLQ not configured',
      processed: 0,
    });
  }

  try {
    // Get submissions ready for retry
    const ready = await getReadySubmissions();
    
    if (ready.length === 0) {
      const stats = await getQueueStats();
      logger.info(`[CRON ${requestId}] No submissions ready for retry`, { stats });
      return Response.json({
        success: true,
        message: 'No submissions ready',
        processed: 0,
        stats,
      });
    }

    logger.info(`[CRON ${requestId}] Found ${ready.length} submissions ready for retry`);

    // Process each submission
    const results: Array<{
      id: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const submission of ready) {
      try {
        const result = await processSubmission(submission);
        results.push({ id: submission.id, success: result.success, error: result.error });
        
        await updateSubmissionAttempt(
          submission.id,
          result.success,
          result.error
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id: submission.id, success: false, error });
        
        await updateSubmissionAttempt(submission.id, false, error);
      }
    }

    const stats = await getQueueStats();
    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`[CRON ${requestId}] Completed in ${duration}ms`, {
      processed: results.length,
      success: successCount,
      failed: failCount,
      stats,
    });

    return Response.json({
      success: true,
      requestId,
      processed: results.length,
      successCount,
      failCount,
      results,
      stats,
      duration: `${duration}ms`,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[CRON ${requestId}] Failed:`, err);
    
    return Response.json({
      success: false,
      error,
      requestId,
    }, { status: 500 });
  }
}

/**
 * Process a single submission by resubmitting to the webhook
 */
async function processSubmission(submission: QueuedSubmission): Promise<{
  success: boolean;
  error?: string;
}> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  
  if (!baseUrl) {
    return { success: false, error: 'No base URL configured' };
  }

  // Determine which webhook to use based on source
  const webhookPath = getWebhookPath(submission.source);
  const url = `https://${baseUrl.replace(/^https?:\/\//, '')}${webhookPath}`;

  logger.info(`[DLQ] Retrying submission ${submission.id} to ${webhookPath}`, {
    attemptCount: submission.attemptCount + 1,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DLQ-Retry': 'true',
        'X-DLQ-Attempt': String(submission.attemptCount + 1),
        'X-DLQ-Submission-ID': submission.id,
      },
      body: JSON.stringify(submission.payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const result = await response.json();
    
    if (result.success) {
      return { success: true };
    }
    
    return {
      success: false,
      error: result.error || result.message || 'Unknown webhook error',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Get the webhook path based on source
 */
function getWebhookPath(source: QueuedSubmission['source']): string {
  switch (source) {
    case 'weightlossintake':
      return '/api/webhooks/weightlossintake';
    case 'heyflow':
      return '/api/webhooks/heyflow';
    case 'medlink':
      return '/api/medlink/intake';
    default:
      return '/api/webhooks/intake';
  }
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req);
}
