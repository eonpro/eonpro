/**
 * Platform Fee Cron Job
 * =====================
 *
 * Processes weekly admin fees for clinics with configured platform billing.
 * Uses runCronPerTenant + runWithClinicContext for full tenant isolation.
 *
 * Vercel Cron: 0 0 * * 1 (Every Monday at midnight UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma, runWithClinicContext } from '@/lib/db';
import { platformFeeService, clinicInvoiceService } from '@/services/billing';
import { verifyCronAuth, runCronPerTenant } from '@/lib/cron/tenant-isolation';

type PerClinicResult = {
  clinicId: number;
  clinicName: string;
  feeType: string;
  weeklySales?: number;
  feeAmount: number;
  feeEventId?: number;
  success: boolean;
  error?: string;
  overdueUpdated: number;
};

export async function GET(req: NextRequest) {
  return processWeeklyAdminFees(req);
}

export async function POST(req: NextRequest) {
  return processWeeklyAdminFees(req);
}

async function processWeeklyAdminFees(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    logger.warn('[Platform Fees] Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay());
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  logger.info('[Platform Fees] Processing week', {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  });

  try {
    const { results, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'platform-fees',
      perClinic: async (clinicId) => {
        return runWithClinicContext(clinicId, async () => {
          const config = await prisma.clinicPlatformFeeConfig.findFirst({
            where: {
              clinicId,
              isActive: true,
              adminFeeType: { not: 'NONE' },
            },
            include: {
              clinic: { select: { id: true, name: true } },
            },
          });

          const emptyResult: PerClinicResult = {
            clinicId,
            clinicName: 'Unknown',
            feeType: 'NONE',
            feeAmount: 0,
            success: true,
            overdueUpdated: 0,
          };

          if (!config) return emptyResult;

          const existingFee = await prisma.platformFeeEvent.findFirst({
            where: {
              clinicId,
              feeType: 'ADMIN',
              periodStart: weekStart,
              periodEnd: weekEnd,
              status: { not: 'VOIDED' },
            },
          });

          if (existingFee) {
            return {
              clinicId,
              clinicName: config.clinic.name,
              feeType: config.adminFeeType,
              feeAmount: existingFee.amountCents,
              feeEventId: existingFee.id,
              success: true,
              error: 'Already processed (skipped)',
              overdueUpdated: 0,
            };
          }

          let overdueUpdated = 0;
          try {
            overdueUpdated = await clinicInvoiceService.checkOverdueInvoicesForClinic(clinicId);
          } catch {
            // non-fatal
          }

          try {
            const feeEvent = await platformFeeService.recordAdminFee(clinicId, weekStart, weekEnd);
            if (feeEvent) {
              const calcDetails = feeEvent.calculationDetails as Record<string, unknown> | null;
              const weeklySales = calcDetails?.periodSales as number | undefined;
              return {
                clinicId,
                clinicName: config.clinic.name,
                feeType: config.adminFeeType,
                weeklySales,
                feeAmount: feeEvent.amountCents,
                feeEventId: feeEvent.id,
                success: true,
                overdueUpdated,
              };
            }
            return {
              clinicId,
              clinicName: config.clinic.name,
              feeType: config.adminFeeType,
              feeAmount: 0,
              success: false,
              error: 'No fee event created',
              overdueUpdated,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('[Platform Fees] Error recording admin fee', { clinicId, error: message });
            return {
              clinicId,
              clinicName: config.clinic.name,
              feeType: config.adminFeeType,
              feeAmount: 0,
              success: false,
              error: message,
              overdueUpdated,
            };
          }
        });
      },
    });

    const details = results.map((r) => r.data).filter(Boolean) as PerClinicResult[];
    const successful = details.filter((r) => r.success && !r.error?.includes('skipped')).length;
    const skipped = details.filter((r) => r.error?.includes('skipped')).length;
    const failed = details.filter((r) => !r.success).length;
    const totalFeesRecorded = details
      .filter((r) => r.success && !r.error?.includes('skipped'))
      .reduce((sum, r) => sum + r.feeAmount, 0);
    const overdueUpdated = details.reduce((sum, r) => sum + (r.overdueUpdated ?? 0), 0);

    const duration = Date.now() - startTime;

    logger.info('[Platform Fees] Job completed', {
      duration,
      totalDurationMs,
      clinicsProcessed: details.length,
      successful,
      skipped,
      failed,
      overdueUpdated,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      totalDurationMs,
      period: { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() },
      results: {
        clinicsProcessed: details.length,
        successful,
        skipped,
        failed,
        totalFeesRecorded,
        overdueInvoices: overdueUpdated,
      },
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Platform Fees] Job failed', { error: message, duration: Date.now() - startTime });
    return NextResponse.json(
      { success: false, timestamp: new Date().toISOString(), duration: Date.now() - startTime, error: message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({
    name: 'platform-fees',
    description: 'Processes weekly admin fees for clinics and checks overdue invoices (per-tenant)',
    schedule: 'Every Monday at midnight UTC (0 0 * * 1)',
    endpoint: '/api/cron/platform-fees',
    methods: ['GET', 'POST'],
    authentication: process.env.CRON_SECRET ? 'Required (CRON_SECRET)' : 'None',
    tenantIsolation: 'Per-clinic via runCronPerTenant + runWithClinicContext',
  });
}
