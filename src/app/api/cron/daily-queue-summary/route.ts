/**
 * Daily Queue Summary Cron Job
 * =============================
 *
 * Sends a morning in-app notification to admins and providers with their
 * pending workload counts so nothing falls through the cracks.
 *
 * Admins get:  pending-admin refills + pending-payment refills + today's renewals
 * Providers get: approved refills awaiting prescription
 *
 * Vercel Cron: 0 13 * * * (daily at 1 PM UTC / ~8 AM ET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';
import { handleApiError } from '@/domains/shared/errors';
import { notificationService } from '@/services/notification/notificationService';
import type { NotificationCategory, NotificationPriority } from '@prisma/client';

export async function GET(req: NextRequest) {
  return runDailySummary(req);
}

export async function POST(req: NextRequest) {
  return runDailySummary(req);
}

type PerClinicResult = {
  adminNotifications: number;
  providerNotifications: number;
};

async function runDailySummary(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON daily-queue-summary] Starting daily queue summary');

  try {
    const { results, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'daily-queue-summary',
      perClinic: async (clinicId) => processClinic(clinicId),
    });

    const aggregated = results.reduce(
      (acc, r) => {
        if (!r.data) return acc;
        acc.adminNotifications += r.data.adminNotifications;
        acc.providerNotifications += r.data.providerNotifications;
        return acc;
      },
      { adminNotifications: 0, providerNotifications: 0 }
    );

    const duration = Date.now() - startTime;

    const result = {
      success: true,
      duration,
      clinicsProcessed: results.length,
      ...aggregated,
      totalDurationMs,
    };

    logger.info('[CRON daily-queue-summary] Completed', result);

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[CRON daily-queue-summary] Fatal error', {
      error: error instanceof Error ? error.message : 'Unknown',
      duration,
    });
    return handleApiError(error, { route: 'GET /api/cron/daily-queue-summary' });
  }
}

async function processClinic(clinicId: number): Promise<PerClinicResult> {
  const result: PerClinicResult = { adminNotifications: 0, providerNotifications: 0 };

  const [pendingAdmin, pendingPayment, approvedForProvider, scheduledToday] = await Promise.all([
    prisma.refillQueue.count({
      where: { clinicId, status: 'PENDING_ADMIN' },
    }),
    prisma.refillQueue.count({
      where: { clinicId, status: 'PENDING_PAYMENT' },
    }),
    prisma.refillQueue.count({
      where: { clinicId, status: { in: ['APPROVED', 'PENDING_PROVIDER'] } },
    }),
    prisma.subscription.count({
      where: {
        clinicId,
        status: 'ACTIVE',
        nextBillingDate: {
          gte: startOfDay(new Date()),
          lt: endOfDay(new Date()),
        },
      },
    }),
  ]);

  const totalAdminWork = pendingAdmin + pendingPayment;

  if (totalAdminWork > 0 || scheduledToday > 0) {
    const parts: string[] = [];
    if (pendingAdmin > 0) parts.push(`${pendingAdmin} refill${pendingAdmin > 1 ? 's' : ''} pending approval`);
    if (pendingPayment > 0) parts.push(`${pendingPayment} awaiting payment verification`);
    if (scheduledToday > 0) parts.push(`${scheduledToday} subscription renewal${scheduledToday > 1 ? 's' : ''} billing today`);

    const priority: NotificationPriority = totalAdminWork >= 5 ? 'HIGH' : 'NORMAL';

    await notificationService.notifyAdmins({
      clinicId,
      category: 'REFILL' as NotificationCategory,
      priority,
      title: 'Daily Queue Summary',
      message: parts.join(' · '),
      actionUrl: '/admin/refill-queue',
      sourceType: 'daily_summary',
      sourceId: `daily_admin_${new Date().toISOString().split('T')[0]}`,
      metadata: { pendingAdmin, pendingPayment, scheduledToday },
    });

    result.adminNotifications = 1;
  }

  if (approvedForProvider > 0) {
    await notificationService.notifyProviders({
      clinicId,
      category: 'REFILL' as NotificationCategory,
      priority: approvedForProvider >= 5 ? 'HIGH' : 'NORMAL',
      title: 'Prescriptions Waiting',
      message: `${approvedForProvider} refill${approvedForProvider > 1 ? 's' : ''} approved and waiting for prescription.`,
      actionUrl: '/provider/prescription-queue',
      sourceType: 'daily_summary',
      sourceId: `daily_provider_${new Date().toISOString().split('T')[0]}`,
      metadata: { approvedForProvider },
    });

    result.providerNotifications = 1;
  }

  return result;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
