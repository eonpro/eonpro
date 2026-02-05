/**
 * Platform Fee Cron Job
 * =====================
 * 
 * This endpoint processes weekly admin fees for clinics with configured platform billing.
 * It should be called weekly by Vercel Cron (every Monday at midnight UTC).
 * 
 * Actions performed:
 * 1. Calculate weekly sales for each clinic with percentage-based admin fees
 * 2. Record weekly admin fee events for all clinics with admin fees configured
 * 3. Optionally check for overdue invoices and update statuses
 * 
 * Security:
 * - Protected by CRON_SECRET header
 * 
 * Vercel Cron Configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/platform-fees",
 *     "schedule": "0 0 * * 1"  // Every Monday at midnight UTC
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { platformFeeService, clinicInvoiceService } from '@/services/billing';

// Environment variable for cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/platform-fees
 * Process weekly admin fees (for Vercel Cron which uses GET)
 */
export async function GET(req: NextRequest) {
  return processWeeklyAdminFees(req);
}

/**
 * POST /api/cron/platform-fees
 * Process weekly admin fees (for other cron services that prefer POST)
 */
export async function POST(req: NextRequest) {
  return processWeeklyAdminFees(req);
}

async function processWeeklyAdminFees(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (if configured)
    if (CRON_SECRET) {
      const authHeader = req.headers.get('authorization');
      const cronHeader = req.headers.get('x-cron-secret');
      
      const providedSecret = authHeader?.replace('Bearer ', '') || cronHeader;
      
      if (providedSecret !== CRON_SECRET) {
        logger.warn('[Platform Fees] Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    logger.info('[Platform Fees] Starting weekly admin fee job');

    // Calculate the previous week's date range (Monday to Sunday)
    const now = new Date();
    const weekEnd = new Date(now);
    // Go back to last Sunday (end of previous week)
    weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay());
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    logger.info('[Platform Fees] Processing week', {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });

    // Step 1: Get all active clinic fee configurations with admin fees
    const clinicsWithAdminFees = await prisma.clinicPlatformFeeConfig.findMany({
      where: {
        isActive: true,
        adminFeeType: {
          not: 'NONE',
        },
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    logger.info('[Platform Fees] Found clinics with admin fees', {
      count: clinicsWithAdminFees.length,
    });

    // Step 2: Process admin fees for each clinic
    const results: {
      clinicId: number;
      clinicName: string;
      feeType: string;
      weeklySales?: number;
      feeAmount: number;
      feeEventId?: number;
      success: boolean;
      error?: string;
    }[] = [];

    for (const config of clinicsWithAdminFees) {
      try {
        // Check if admin fee already recorded for this week
        const existingFee = await prisma.platformFeeEvent.findFirst({
          where: {
            clinicId: config.clinicId,
            feeType: 'ADMIN',
            periodStart: weekStart,
            periodEnd: weekEnd,
            status: {
              not: 'VOIDED',
            },
          },
        });

        if (existingFee) {
          logger.info('[Platform Fees] Admin fee already recorded for clinic', {
            clinicId: config.clinicId,
            feeEventId: existingFee.id,
          });
          results.push({
            clinicId: config.clinicId,
            clinicName: config.clinic.name,
            feeType: config.adminFeeType,
            feeAmount: existingFee.amountCents,
            feeEventId: existingFee.id,
            success: true,
            error: 'Already processed (skipped)',
          });
          continue;
        }

        // Record the admin fee
        const feeEvent = await platformFeeService.recordAdminFee(
          config.clinicId,
          weekStart,
          weekEnd
        );

        if (feeEvent) {
          // Extract weekly sales from calculation details if percentage-based
          const calcDetails = feeEvent.calculationDetails as Record<string, unknown> | null;
          const weeklySales = calcDetails?.periodSales as number | undefined;

          results.push({
            clinicId: config.clinicId,
            clinicName: config.clinic.name,
            feeType: config.adminFeeType,
            weeklySales,
            feeAmount: feeEvent.amountCents,
            feeEventId: feeEvent.id,
            success: true,
          });

          logger.info('[Platform Fees] Recorded admin fee', {
            clinicId: config.clinicId,
            feeEventId: feeEvent.id,
            amount: feeEvent.amountCents,
          });
        } else {
          results.push({
            clinicId: config.clinicId,
            clinicName: config.clinic.name,
            feeType: config.adminFeeType,
            feeAmount: 0,
            success: false,
            error: 'No fee event created',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          clinicId: config.clinicId,
          clinicName: config.clinic.name,
          feeType: config.adminFeeType,
          feeAmount: 0,
          success: false,
          error: message,
        });

        logger.error('[Platform Fees] Error recording admin fee', {
          clinicId: config.clinicId,
          error: message,
        });
      }
    }

    // Step 3: Check for overdue invoices
    const overdueResult = await clinicInvoiceService.checkOverdueInvoices();

    logger.info('[Platform Fees] Checked overdue invoices', {
      updated: overdueResult.updatedCount,
    });

    // Step 4: Get summary stats
    const feeSummary = await prisma.platformFeeEvent.groupBy({
      by: ['status'],
      _count: true,
      _sum: {
        amountCents: true,
      },
    });

    const statusSummary = feeSummary.reduce(
      (acc, item) => {
        acc[item.status] = {
          count: item._count,
          amount: item._sum.amountCents || 0,
        };
        return acc;
      },
      {} as Record<string, { count: number; amount: number }>
    );

    const duration = Date.now() - startTime;

    logger.info('[Platform Fees] Job completed', {
      duration,
      clinicsProcessed: results.length,
      successful: results.filter((r) => r.success && !r.error?.includes('skipped')).length,
      skipped: results.filter((r) => r.error?.includes('skipped')).length,
      failed: results.filter((r) => !r.success).length,
      overdueUpdated: overdueResult.updatedCount,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      period: {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      },
      results: {
        clinicsProcessed: results.length,
        successful: results.filter((r) => r.success && !r.error?.includes('skipped')).length,
        skipped: results.filter((r) => r.error?.includes('skipped')).length,
        failed: results.filter((r) => !r.success).length,
        totalFeesRecorded: results
          .filter((r) => r.success && !r.error?.includes('skipped'))
          .reduce((sum, r) => sum + r.feeAmount, 0),
      },
      overdueInvoices: overdueResult.updatedCount,
      feeStatusSummary: statusSummary,
      details: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[Platform Fees] Job failed', {
      error: message,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration,
        error: message,
      },
      { status: 500 }
    );
  }
}

/**
 * Health check / info for the cron job
 */
export async function OPTIONS() {
  return NextResponse.json({
    name: 'platform-fees',
    description: 'Processes weekly admin fees for clinics and checks overdue invoices',
    schedule: 'Every Monday at midnight UTC (0 0 * * 1)',
    endpoint: '/api/cron/platform-fees',
    methods: ['GET', 'POST'],
    authentication: CRON_SECRET ? 'Required (CRON_SECRET)' : 'None',
    actions: [
      'Calculate weekly sales for percentage-based admin fees',
      'Record admin fee events for all configured clinics',
      'Update overdue invoice statuses',
    ],
  });
}
