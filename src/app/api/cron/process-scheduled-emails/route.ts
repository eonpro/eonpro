/**
 * Process Scheduled Emails Cron Job
 * ==================================
 *
 * This endpoint processes scheduled emails that are due for sending.
 * It should be called every 5 minutes by an external cron service.
 *
 * Actions performed:
 * 1. Find all PENDING scheduled emails where scheduledFor <= now
 * 2. Mark them as PROCESSING to prevent duplicate sends
 * 3. Send each email via the email service
 * 4. Update status to SENT or FAILED
 * 5. Handle retries for failed emails
 *
 * Security:
 * - Protected by CRON_SECRET header
 *
 * Vercel Cron Configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-scheduled-emails",
 *     "schedule": "*\/5 * * * *"  // Every 5 minutes
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { sendTemplatedEmail, EmailTemplate } from '@/lib/email';
import type { ScheduledEmailStatus } from '@prisma/client';

// Environment variable for cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

// Maximum emails to process per run (to prevent timeout)
const BATCH_SIZE = 50;

// Maximum retry attempts
const MAX_RETRIES = 3;

/**
 * GET /api/cron/process-scheduled-emails
 * Process scheduled emails (for Vercel Cron which uses GET)
 */
export async function GET(req: NextRequest) {
  return processScheduledEmails(req);
}

/**
 * POST /api/cron/process-scheduled-emails
 * Process scheduled emails (for other cron services that prefer POST)
 */
export async function POST(req: NextRequest) {
  return processScheduledEmails(req);
}

async function processScheduledEmails(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (if configured)
    if (CRON_SECRET) {
      const authHeader = req.headers.get('authorization');
      const cronHeader = req.headers.get('x-cron-secret');
      const isVercelCron = req.headers.get('x-vercel-cron') === '1';

      const providedSecret = authHeader?.replace('Bearer ', '') || cronHeader;

      if (!isVercelCron && providedSecret !== CRON_SECRET) {
        logger.warn('[Scheduled Emails] Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    logger.info('[Scheduled Emails] Starting scheduled job');

    // Step 1: Find pending emails that are due
    const now = new Date();
    const pendingEmails = await prisma.scheduledEmail.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: now },
        retryCount: { lt: MAX_RETRIES },
      },
      orderBy: [
        { priority: 'desc' }, // HIGH priority first
        { scheduledFor: 'asc' }, // Then by scheduled time
      ],
      take: BATCH_SIZE,
      include: {
        recipientUser: {
          select: {
            id: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    });

    if (pendingEmails.length === 0) {
      logger.info('[Scheduled Emails] No pending emails to process');
      return NextResponse.json({
        success: true,
        message: 'No pending emails',
        processed: 0,
        elapsedMs: Date.now() - startTime,
      });
    }

    logger.info('[Scheduled Emails] Found pending emails', {
      count: pendingEmails.length,
    });

    // Step 2: Mark emails as PROCESSING (atomic update to prevent duplicates)
    const emailIds = pendingEmails.map((e) => e.id);
    await prisma.scheduledEmail.updateMany({
      where: { id: { in: emailIds }, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    // Step 3: Process each email
    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const scheduledEmail of pendingEmails) {
      try {
        // Check if user has email notifications disabled
        if (
          scheduledEmail.recipientUser &&
          !scheduledEmail.recipientUser.emailNotificationsEnabled
        ) {
          logger.info('[Scheduled Emails] Skipping - user disabled notifications', {
            scheduledEmailId: scheduledEmail.id,
            userId: scheduledEmail.recipientUserId,
          });

          await prisma.scheduledEmail.update({
            where: { id: scheduledEmail.id },
            data: {
              status: 'CANCELLED',
              processedAt: new Date(),
              errorMessage: 'User has disabled email notifications',
            },
          });

          results.skipped++;
          continue;
        }

        // Send the email
        const emailResult = await sendTemplatedEmail({
          to: scheduledEmail.recipientEmail,
          template: scheduledEmail.template as EmailTemplate,
          data: scheduledEmail.templateData as Record<string, unknown>,
          subject: scheduledEmail.subject || undefined,
          userId: scheduledEmail.recipientUserId || undefined,
          clinicId: scheduledEmail.clinicId || undefined,
          sourceType: 'automation',
          sourceId: scheduledEmail.automationTrigger || `scheduled-${scheduledEmail.id}`,
        });

        if (emailResult.success) {
          // Update as SENT
          await prisma.scheduledEmail.update({
            where: { id: scheduledEmail.id },
            data: {
              status: 'SENT',
              processedAt: new Date(),
            },
          });

          results.sent++;
          logger.debug('[Scheduled Emails] Email sent', {
            scheduledEmailId: scheduledEmail.id,
            messageId: emailResult.messageId,
          });
        } else {
          // Update as FAILED with retry
          const newRetryCount = scheduledEmail.retryCount + 1;
          const shouldRetry = newRetryCount < scheduledEmail.maxRetries;

          await prisma.scheduledEmail.update({
            where: { id: scheduledEmail.id },
            data: {
              status: shouldRetry ? 'PENDING' : 'FAILED',
              retryCount: newRetryCount,
              errorMessage: emailResult.error,
            },
          });

          results.failed++;
          results.errors.push(
            `ID ${scheduledEmail.id}: ${emailResult.error}${shouldRetry ? ' (will retry)' : ''}`
          );

          logger.warn('[Scheduled Emails] Email send failed', {
            scheduledEmailId: scheduledEmail.id,
            error: emailResult.error,
            retryCount: newRetryCount,
            willRetry: shouldRetry,
          });
        }
      } catch (error) {
        // Unexpected error - mark for retry
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: {
            status: scheduledEmail.retryCount + 1 < MAX_RETRIES ? 'PENDING' : 'FAILED',
            retryCount: { increment: 1 },
            errorMessage,
          },
        });

        results.failed++;
        results.errors.push(`ID ${scheduledEmail.id}: ${errorMessage}`);

        logger.error('[Scheduled Emails] Unexpected error processing email', {
          scheduledEmailId: scheduledEmail.id,
          error: errorMessage,
        });
      }
    }

    // Step 4: Clean up old cancelled/sent emails (older than 30 days)
    const cleanupCutoff = new Date();
    cleanupCutoff.setDate(cleanupCutoff.getDate() - 30);

    const cleanedUp = await prisma.scheduledEmail.deleteMany({
      where: {
        status: { in: ['SENT', 'CANCELLED'] },
        processedAt: { lt: cleanupCutoff },
      },
    });

    const elapsedMs = Date.now() - startTime;

    logger.info('[Scheduled Emails] Job completed', {
      ...results,
      cleanedUp: cleanedUp.count,
      elapsedMs,
    });

    return NextResponse.json({
      success: true,
      processed: results.sent + results.failed + results.skipped,
      sent: results.sent,
      failed: results.failed,
      skipped: results.skipped,
      errors: results.errors.length > 0 ? results.errors : undefined,
      cleanedUp: cleanedUp.count,
      elapsedMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const elapsedMs = Date.now() - startTime;

    logger.error('[Scheduled Emails] Cron job failed', {
      error: errorMessage,
      elapsedMs,
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        elapsedMs,
      },
      { status: 500 }
    );
  }
}

/**
 * Schedule an email for later delivery
 * This is a utility function to be used by other parts of the application
 */
export async function scheduleEmail(params: {
  recipientEmail: string;
  recipientUserId?: number;
  clinicId?: number;
  template: EmailTemplate;
  templateData: Record<string, unknown>;
  subject?: string;
  scheduledFor: Date;
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  automationTrigger?: string;
  sourceId?: string;
}): Promise<{ id: number; scheduledFor: Date }> {
  const scheduledEmail = await prisma.scheduledEmail.create({
    data: {
      recipientEmail: params.recipientEmail,
      recipientUserId: params.recipientUserId,
      clinicId: params.clinicId,
      template: params.template,
      templateData: params.templateData,
      subject: params.subject,
      scheduledFor: params.scheduledFor,
      priority: params.priority || 'NORMAL',
      automationTrigger: params.automationTrigger,
      sourceId: params.sourceId,
      status: 'PENDING',
    },
  });

  logger.info('[Scheduled Emails] Email scheduled', {
    id: scheduledEmail.id,
    recipientEmail: params.recipientEmail,
    template: params.template,
    scheduledFor: params.scheduledFor,
  });

  return {
    id: scheduledEmail.id,
    scheduledFor: scheduledEmail.scheduledFor,
  };
}

/**
 * Cancel a scheduled email
 */
export async function cancelScheduledEmail(id: number): Promise<boolean> {
  const result = await prisma.scheduledEmail.updateMany({
    where: {
      id,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
      processedAt: new Date(),
    },
  });

  return result.count > 0;
}
