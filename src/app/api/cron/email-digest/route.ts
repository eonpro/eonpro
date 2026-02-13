/**
 * Email Digest Cron Job
 * ======================
 *
 * Sends weekly email digests to users who have opted in.
 * Uses runCronPerTenant + runWithClinicContext for full tenant isolation.
 *
 * Schedule: Every Monday at 9 AM UTC (0 9 * * 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma, runWithClinicContext } from '@/lib/db';
import { sendTemplatedEmail, EmailTemplate, EmailPriority } from '@/lib/email';
import type { NotificationCategory } from '@prisma/client';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;

const CATEGORY_NAMES: Record<NotificationCategory, string> = {
  PRESCRIPTION: 'Prescriptions',
  PATIENT: 'Patients',
  ORDER: 'Orders',
  SYSTEM: 'System',
  APPOINTMENT: 'Appointments',
  MESSAGE: 'Messages',
  PAYMENT: 'Payments',
  REFILL: 'Refills',
  SHIPMENT: 'Shipments',
};

type PerClinicResult = { sent: number; skipped: number; failed: number; errors: string[] };

export async function GET(req: NextRequest) {
  return processEmailDigests(req);
}

export async function POST(req: NextRequest) {
  return processEmailDigests(req);
}

async function processEmailDigests(req: NextRequest) {
  const startTime = Date.now();

  if (CRON_SECRET) {
    const authHeader = req.headers.get('authorization');
    const cronHeader = req.headers.get('x-cron-secret');
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    const providedSecret = authHeader?.replace('Bearer ', '') || cronHeader;
    if (!isVercelCron && providedSecret !== CRON_SECRET) {
      logger.warn('[Email Digest] Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  logger.info('[Email Digest] Starting weekly digest job (per-tenant)');

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  try {
    const { results, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'email-digest',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, () =>
          processDigestsForClinic(clinicId, oneWeekAgo)
        );
      },
    });

    const aggregated = results.reduce(
      (acc, r) => {
        const d = r.data;
        if (!d) return acc;
        acc.sent += d.sent;
        acc.skipped += d.skipped;
        acc.failed += d.failed;
        acc.errors.push(...d.errors);
        return acc;
      },
      { sent: 0, skipped: 0, failed: 0, errors: [] as string[] }
    );

    const elapsedMs = Date.now() - startTime;

    logger.info('[Email Digest] Job completed', { ...aggregated, totalDurationMs, elapsedMs });

    return NextResponse.json({
      success: true,
      processed: aggregated.sent + aggregated.skipped + aggregated.failed,
      sent: aggregated.sent,
      skipped: aggregated.skipped,
      failed: aggregated.failed,
      errors: aggregated.errors.length > 0 ? aggregated.errors : undefined,
      elapsedMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Email Digest] Cron job failed', { error: errorMessage, elapsedMs: Date.now() - startTime });
    return NextResponse.json(
      { success: false, error: errorMessage, elapsedMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}

async function processDigestsForClinic(
  clinicId: number,
  oneWeekAgo: Date
): Promise<PerClinicResult> {
  const result: PerClinicResult = { sent: 0, skipped: 0, failed: 0, errors: [] };

  const users = await prisma.user.findMany({
    where: {
      clinicId,
      emailDigestEnabled: true,
      emailNotificationsEnabled: true,
      status: 'ACTIVE',
      OR: [{ lastEmailDigestSentAt: null }, { lastEmailDigestSentAt: { lt: oneWeekAgo } }],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      clinicId: true,
      emailDigestFrequency: true,
    },
    take: BATCH_SIZE,
  });

  for (const user of users) {
    try {
      const notifications = await prisma.notification.findMany({
        where: {
          userId: user.id,
          isRead: false,
          isArchived: false,
          createdAt: { gte: oneWeekAgo },
        },
        select: {
          id: true,
          category: true,
          priority: true,
          title: true,
          message: true,
          actionUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      if (notifications.length === 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastEmailDigestSentAt: new Date() },
        });
        result.skipped++;
        continue;
      }

      type NotificationType = (typeof notifications)[number];
      const byCategory: Record<NotificationCategory, NotificationType[]> = {} as Record<
        NotificationCategory,
        NotificationType[]
      >;
      for (const notification of notifications) {
        const cat = notification.category as NotificationCategory;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(notification);
      }

      const categorySummaries = Object.entries(byCategory).map(([category, notifs]) => ({
        name: CATEGORY_NAMES[category as NotificationCategory] || category,
        count: notifs.length,
        items: notifs.slice(0, 5).map((n) => ({
          title: n.title,
          message: n.message.length > 100 ? n.message.substring(0, 100) + '...' : n.message,
          actionUrl: n.actionUrl,
          priority: n.priority,
          createdAt: n.createdAt.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
        })),
      }));

      const highPriorityCount = notifications.filter(
        (n) => n.priority === 'HIGH' || n.priority === 'URGENT'
      ).length;

      const emailResult = await sendTemplatedEmail({
        to: user.email,
        template: EmailTemplate.CUSTOM,
        data: {
          firstName: user.firstName,
          totalUnread: notifications.length,
          highPriorityCount,
          categorySummaries,
          weekStart: oneWeekAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
          weekEnd: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/notifications`,
          subject: `Weekly Digest: ${notifications.length} unread notification${notifications.length === 1 ? '' : 's'}`,
          content: buildDigestContent(
            user.firstName,
            notifications.length,
            highPriorityCount,
            categorySummaries
          ),
        },
        subject: `Weekly Digest: ${notifications.length} unread notification${notifications.length === 1 ? '' : 's'}`,
        priority: highPriorityCount > 0 ? EmailPriority.HIGH : EmailPriority.NORMAL,
        userId: user.id,
        clinicId: user.clinicId || undefined,
        sourceType: 'digest',
        sourceId: `weekly-${new Date().toISOString().split('T')[0]}`,
      });

      if (emailResult.success) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastEmailDigestSentAt: new Date() },
        });
        result.sent++;
      } else {
        result.failed++;
        result.errors.push(`User ${user.id}: ${emailResult.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.failed++;
      result.errors.push(`User ${user.id}: ${errorMessage}`);
      logger.error('[Email Digest] Error processing user', { userId: user.id, error: errorMessage });
    }
  }

  return result;
}

function buildDigestContent(
  firstName: string,
  totalUnread: number,
  highPriorityCount: number,
  categorySummaries: Array<{
    name: string;
    count: number;
    items: Array<{ title: string; message: string; priority: string; createdAt: string }>;
  }>
): string {
  const priorityBadge =
    highPriorityCount > 0
      ? `<span style="background: #FEE2E2; color: #DC2626; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">${highPriorityCount} High Priority</span>`
      : '';

  const categoryHtml = categorySummaries
    .map(
      (cat) => `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">
          ${cat.name} <span style="color: #6B7280;">(${cat.count})</span>
        </h3>
        ${cat.items
          .map(
            (item) => `
          <div style="padding: 12px; background: #F9FAFB; border-radius: 8px; margin-bottom: 8px;">
            <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">
              ${item.priority === 'HIGH' || item.priority === 'URGENT' ? '🔴 ' : ''}${item.title}
            </div>
            <div style="color: #6B7280; font-size: 14px;">${item.message}</div>
            <div style="color: #9CA3AF; font-size: 12px; margin-top: 4px;">${item.createdAt}</div>
          </div>
        `
          )
          .join('')}
        ${cat.count > 5 ? `<div style="color: #6B7280; font-size: 14px;">...and ${cat.count - 5} more</div>` : ''}
      </div>
    `
    )
    .join('');

  return `
    <p>Hi ${firstName},</p>
    <p>Here's your weekly notification summary:</p>
    <div style="background: #EFF6FF; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <span style="font-size: 24px; font-weight: bold; color: #1E40AF;">${totalUnread}</span>
      <span style="color: #1E40AF;"> unread notification${totalUnread === 1 ? '' : 's'}</span>
      ${priorityBadge}
    </div>
    ${categoryHtml}
    <p style="margin-top: 24px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/notifications" 
         style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
        View All Notifications
      </a>
    </p>
    <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
      You're receiving this because you enabled weekly digests. 
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications" style="color: #059669;">Manage preferences</a>
    </p>
  `;
}
