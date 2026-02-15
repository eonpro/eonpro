/**
 * Process Scheduled Emails Cron Job
 * ==================================
 *
 * Processes scheduled emails that are due for sending.
 * Uses runCronPerTenant + runWithClinicContext for full tenant isolation.
 * Emails with clinicId null are processed in a final pass with undefined context.
 *
 * Vercel Cron: every 5 minutes (0/5 * * * *)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { sendTemplatedEmail, EmailTemplate } from '@/lib/email';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

type PerClinicResult = { sent: number; failed: number; skipped: number; errors: string[]; cleanedUp: number };

export async function GET(req: NextRequest) {
  return processScheduledEmails(req);
}

export async function POST(req: NextRequest) {
  return processScheduledEmails(req);
}

async function processScheduledEmails(req: NextRequest) {
  const startTime = Date.now();

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

  logger.info('[Scheduled Emails] Starting scheduled job (per-tenant)');

  try {
    const { results: clinicResults, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'process-scheduled-emails',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, () => processScheduledEmailsForClinic(clinicId));
      },
    });

    // Process emails with no clinic (clinicId null)
    // Use basePrisma directly since these are system-level emails without tenant context
    const nullResult = await processNullClinicEmails();

    const aggregated = clinicResults.reduce(
      (acc, r) => {
        const d = r.data;
        if (!d) return acc;
        acc.sent += d.sent;
        acc.failed += d.failed;
        acc.skipped += d.skipped;
        acc.errors.push(...d.errors);
        acc.cleanedUp += d.cleanedUp;
        return acc;
      },
      { sent: 0, failed: 0, skipped: 0, errors: [] as string[], cleanedUp: 0 }
    );

    aggregated.sent += nullResult.sent;
    aggregated.failed += nullResult.failed;
    aggregated.skipped += nullResult.skipped;
    aggregated.errors.push(...nullResult.errors);
    aggregated.cleanedUp += nullResult.cleanedUp;

    const elapsedMs = Date.now() - startTime;

    logger.info('[Scheduled Emails] Job completed', {
      ...aggregated,
      totalDurationMs,
      elapsedMs,
    });

    return NextResponse.json({
      success: true,
      processed: aggregated.sent + aggregated.failed + aggregated.skipped,
      sent: aggregated.sent,
      failed: aggregated.failed,
      skipped: aggregated.skipped,
      errors: aggregated.errors.length > 0 ? aggregated.errors : undefined,
      cleanedUp: aggregated.cleanedUp,
      elapsedMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Scheduled Emails] Cron job failed', { error: errorMessage, elapsedMs: Date.now() - startTime });
    return NextResponse.json({ success: false, error: errorMessage, elapsedMs: Date.now() - startTime }, { status: 500 });
  }
}

async function processScheduledEmailsForClinic(clinicId: number | null): Promise<PerClinicResult> {
  const now = new Date();
  const result: PerClinicResult = { sent: 0, failed: 0, skipped: 0, errors: [], cleanedUp: 0 };

  const pendingEmails = await prisma.scheduledEmail.findMany({
    where: {
      clinicId: clinicId === null ? null : clinicId,
      status: 'PENDING',
      scheduledFor: { lte: now },
      retryCount: { lt: MAX_RETRIES },
    },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
    take: BATCH_SIZE,
    include: {
      recipientUser: {
        select: { id: true, emailNotificationsEnabled: true },
      },
    },
  });

  if (pendingEmails.length === 0) {
    const cleanupCutoff = new Date();
    cleanupCutoff.setDate(cleanupCutoff.getDate() - 30);
    const cleaned = await prisma.scheduledEmail.deleteMany({
      where: {
        clinicId: clinicId === null ? null : clinicId,
        status: { in: ['SENT', 'CANCELLED'] },
        processedAt: { lt: cleanupCutoff },
      },
    });
    result.cleanedUp = cleaned.count;
    return result;
  }

  const emailIds = pendingEmails.map((e) => e.id);
  await prisma.scheduledEmail.updateMany({
    where: { id: { in: emailIds }, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });

  for (const scheduledEmail of pendingEmails) {
    try {
      if (scheduledEmail.recipientUser && !scheduledEmail.recipientUser.emailNotificationsEnabled) {
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { status: 'CANCELLED', processedAt: new Date(), errorMessage: 'User has disabled email notifications' },
        });
        result.skipped++;
        continue;
      }

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
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { status: 'SENT', processedAt: new Date() },
        });
        result.sent++;
      } else {
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
        result.failed++;
        result.errors.push(`ID ${scheduledEmail.id}: ${emailResult.error}${shouldRetry ? ' (will retry)' : ''}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await prisma.scheduledEmail.update({
        where: { id: scheduledEmail.id },
        data: {
          status: scheduledEmail.retryCount + 1 < MAX_RETRIES ? 'PENDING' : 'FAILED',
          retryCount: { increment: 1 },
          errorMessage: errorMessage,
        },
      });
      result.failed++;
      result.errors.push(`ID ${scheduledEmail.id}: ${errorMessage}`);
    }
  }

  const cleanupCutoff = new Date();
  cleanupCutoff.setDate(cleanupCutoff.getDate() - 30);
  const cleaned = await prisma.scheduledEmail.deleteMany({
    where: {
      clinicId: clinicId === null ? null : clinicId,
      status: { in: ['SENT', 'CANCELLED'] },
      processedAt: { lt: cleanupCutoff },
    },
  });
  result.cleanedUp = cleaned.count;

  return result;
}

/**
 * Process scheduled emails with clinicId = null (system-level emails).
 * Uses basePrisma directly because these have no tenant context,
 * and the scheduledEmail model is clinic-isolated in the prisma wrapper.
 */
async function processNullClinicEmails(): Promise<PerClinicResult> {
  const now = new Date();
  const result: PerClinicResult = { sent: 0, failed: 0, skipped: 0, errors: [], cleanedUp: 0 };

  const pendingEmails = await basePrisma.scheduledEmail.findMany({
    where: {
      clinicId: null,
      status: 'PENDING',
      scheduledFor: { lte: now },
      retryCount: { lt: MAX_RETRIES },
    },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
    take: BATCH_SIZE,
    include: {
      recipientUser: {
        select: { id: true, emailNotificationsEnabled: true },
      },
    },
  });

  if (pendingEmails.length === 0) {
    const cleanupCutoff = new Date();
    cleanupCutoff.setDate(cleanupCutoff.getDate() - 30);
    const cleaned = await basePrisma.scheduledEmail.deleteMany({
      where: {
        clinicId: null,
        status: { in: ['SENT', 'CANCELLED'] },
        processedAt: { lt: cleanupCutoff },
      },
    });
    result.cleanedUp = cleaned.count;
    return result;
  }

  const emailIds = pendingEmails.map((e) => e.id);
  await basePrisma.scheduledEmail.updateMany({
    where: { id: { in: emailIds }, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });

  for (const scheduledEmail of pendingEmails) {
    try {
      if (scheduledEmail.recipientUser && !scheduledEmail.recipientUser.emailNotificationsEnabled) {
        await basePrisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { status: 'CANCELLED', processedAt: new Date(), errorMessage: 'User has disabled email notifications' },
        });
        result.skipped++;
        continue;
      }

      const emailResult = await sendTemplatedEmail({
        to: scheduledEmail.recipientEmail,
        template: scheduledEmail.template as EmailTemplate,
        data: scheduledEmail.templateData as Record<string, unknown>,
        subject: scheduledEmail.subject || undefined,
        userId: scheduledEmail.recipientUserId || undefined,
        clinicId: undefined,
        sourceType: 'automation',
        sourceId: scheduledEmail.automationTrigger || `scheduled-${scheduledEmail.id}`,
      });

      if (emailResult.success) {
        await basePrisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { status: 'SENT', processedAt: new Date() },
        });
        result.sent++;
      } else {
        const newRetryCount = scheduledEmail.retryCount + 1;
        const shouldRetry = newRetryCount < scheduledEmail.maxRetries;
        await basePrisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            retryCount: newRetryCount,
            errorMessage: emailResult.error,
          },
        });
        result.failed++;
        result.errors.push(`ID ${scheduledEmail.id}: ${emailResult.error}${shouldRetry ? ' (will retry)' : ''}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await basePrisma.scheduledEmail.update({
        where: { id: scheduledEmail.id },
        data: {
          status: scheduledEmail.retryCount + 1 < MAX_RETRIES ? 'PENDING' : 'FAILED',
          retryCount: { increment: 1 },
          errorMessage: errorMessage,
        },
      });
      result.failed++;
      result.errors.push(`ID ${scheduledEmail.id}: ${errorMessage}`);
    }
  }

  const cleanupCutoff = new Date();
  cleanupCutoff.setDate(cleanupCutoff.getDate() - 30);
  const cleaned = await basePrisma.scheduledEmail.deleteMany({
    where: {
      clinicId: null,
      status: { in: ['SENT', 'CANCELLED'] },
      processedAt: { lt: cleanupCutoff },
    },
  });
  result.cleanedUp = cleaned.count;

  return result;
}

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
      templateData: params.templateData as any,
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
    template: params.template,
    scheduledFor: params.scheduledFor,
  });
  return { id: scheduledEmail.id, scheduledFor: scheduledEmail.scheduledFor };
}

export async function cancelScheduledEmail(id: number): Promise<boolean> {
  const result = await prisma.scheduledEmail.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED', processedAt: new Date() },
  });
  return result.count > 0;
}
