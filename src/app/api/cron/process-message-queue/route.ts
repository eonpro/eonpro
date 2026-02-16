/**
 * PROCESS MESSAGE QUEUE CRON
 * ===========================
 *
 * Processes failed messages that were queued by circuit breaker fallbacks.
 * Runs every 5 minutes via Vercel Cron.
 *
 * Handles: email, sms, webhook, notification queues.
 *
 * @see vercel.json for cron schedule
 * @see src/lib/resilience/message-queue.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { processFailedMessages, getQueueStats } from '@/lib/resilience/message-queue';
import { circuitBreakers, CircuitState } from '@/lib/resilience/circuitBreaker';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const results: Record<string, { processed: number; failed: number; remaining: number; skipped?: boolean }> = {};

  try {
    // Only process queues for services whose circuit breakers are CLOSED
    // (i.e., the service is available again)

    // Process email queue
    if (circuitBreakers.email.getState() === CircuitState.CLOSED) {
      results.email = await processFailedMessages('email', async (payload, operation) => {
        try {
          const { getSESClient } = await import('@/lib/integrations/aws/sesService');
          const { SendEmailCommand } = await import('@aws-sdk/client-ses');

          const client = getSESClient();
          const to = payload.to as string;
          const subject = payload.subject as string;
          const body = payload.body as string;

          if (!to || !subject) {
            logger.warn('[MessageQueue] Email missing required fields', { payload: Object.keys(payload) });
            return false;
          }

          await client.send(
            new SendEmailCommand({
              Source: process.env.SES_FROM_EMAIL || 'noreply@eonpro.io',
              Destination: { ToAddresses: [to] },
              Message: {
                Subject: { Data: subject },
                Body: { Html: { Data: body || '' } },
              },
            })
          );
          return true;
        } catch (error) {
          logger.error('[MessageQueue] Email retry failed', error instanceof Error ? error : undefined);
          return false;
        }
      });
    } else {
      results.email = { processed: 0, failed: 0, remaining: 0, skipped: true };
    }

    // Process SMS queue
    if (circuitBreakers.sms.getState() === CircuitState.CLOSED) {
      results.sms = await processFailedMessages('sms', async (payload, operation) => {
        try {
          const { getTwilioClientDirect } = await import('@/lib/integrations/twilio/config');
          const client = getTwilioClientDirect();
          const to = payload.to as string;
          const body = payload.body as string;

          if (!to || !body) {
            logger.warn('[MessageQueue] SMS missing required fields', { payload: Object.keys(payload) });
            return false;
          }

          await client.messages.create({
            to,
            from: process.env.TWILIO_PHONE_NUMBER || '',
            body,
          });
          return true;
        } catch (error) {
          logger.error('[MessageQueue] SMS retry failed', error instanceof Error ? error : undefined);
          return false;
        }
      });
    } else {
      results.sms = { processed: 0, failed: 0, remaining: 0, skipped: true };
    }

    // Get queue stats for monitoring
    const stats = await getQueueStats();

    const totalProcessed = Object.values(results).reduce((sum, r) => sum + r.processed, 0);
    const totalRemaining = Object.values(results).reduce((sum, r) => sum + r.remaining, 0);

    if (totalProcessed > 0 || totalRemaining > 0) {
      logger.info('[MessageQueue] Cron completed', {
        results,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json(
      {
        results,
        stats,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[MessageQueue] Cron failed', error instanceof Error ? error : undefined);

    return NextResponse.json(
      { error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
