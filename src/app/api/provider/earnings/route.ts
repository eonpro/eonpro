/**
 * Provider Earnings API
 * 
 * GET - Get current provider's earnings summary and history
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerCompensationService, providerRoutingService } from '@/services/provider';

type DateRangePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd';

/**
 * GET /api/provider/earnings
 * Get current provider's earnings summary
 * 
 * Query params:
 * - period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'custom'
 * - startDate: ISO date string (required if period=custom)
 * - endDate: ISO date string (required if period=custom)
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    const providerId = user.providerId;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    if (!providerId) {
      return NextResponse.json(
        { error: 'User is not linked to a provider profile' },
        { status: 400 }
      );
    }

    // Check if compensation is enabled
    const config = await providerRoutingService.getRoutingConfig(clinicId);
    
    if (!config?.compensationEnabled) {
      return NextResponse.json({
        enabled: false,
        message: 'Provider compensation is not enabled for this clinic',
        earnings: null,
        plan: null,
      });
    }

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || 'month') as DateRangePeriod | 'custom';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    logger.info('[PROVIDER-EARNINGS] Getting earnings', {
      userId: user.id,
      providerId,
      clinicId,
      period,
    });

    // Calculate date range
    let dateRange;
    
    if (period === 'custom') {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { error: 'startDate and endDate are required for custom period' },
          { status: 400 }
        );
      }
      dateRange = {
        startDate: new Date(startDateParam),
        endDate: new Date(endDateParam),
      };
    } else {
      dateRange = providerCompensationService.getDateRange(period);
    }

    // Get compensation plan
    const plan = await providerCompensationService.getCompensationPlan(
      clinicId,
      providerId
    );

    // Get earnings for the period
    const earnings = await providerCompensationService.getProviderEarnings(
      providerId,
      dateRange,
      clinicId
    );

    // Get YTD earnings for dashboard display
    const ytdRange = providerCompensationService.getDateRange('ytd');
    const ytdEarnings = await providerCompensationService.getProviderEarnings(
      providerId,
      ytdRange,
      clinicId
    );

    return NextResponse.json({
      enabled: true,
      period,
      dateRange: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      plan: plan
        ? {
            flatRatePerScript: plan.flatRatePerScript,
            flatRateFormatted: `$${(plan.flatRatePerScript / 100).toFixed(2)}`,
            isActive: plan.isActive,
          }
        : null,
      earnings: {
        totalPrescriptions: earnings.totalPrescriptions,
        totalEarnings: earnings.totalEarningsCents,
        totalEarningsFormatted: `$${(earnings.totalEarningsCents / 100).toFixed(2)}`,
        pendingEarnings: earnings.pendingEarningsCents,
        pendingEarningsFormatted: `$${(earnings.pendingEarningsCents / 100).toFixed(2)}`,
        approvedEarnings: earnings.approvedEarningsCents,
        approvedEarningsFormatted: `$${(earnings.approvedEarningsCents / 100).toFixed(2)}`,
        paidEarnings: earnings.paidEarningsCents,
        paidEarningsFormatted: `$${(earnings.paidEarningsCents / 100).toFixed(2)}`,
        voidedCount: earnings.voidedCount,
        breakdown: earnings.breakdown.map((b) => ({
          period: b.period,
          prescriptions: b.prescriptions,
          earnings: b.earningsCents,
          earningsFormatted: `$${(b.earningsCents / 100).toFixed(2)}`,
        })),
      },
      ytd: {
        totalPrescriptions: ytdEarnings.totalPrescriptions,
        totalEarnings: ytdEarnings.totalEarningsCents,
        totalEarningsFormatted: `$${(ytdEarnings.totalEarningsCents / 100).toFixed(2)}`,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PROVIDER-EARNINGS] Error getting earnings', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get earnings', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withProviderAuth(handleGet);
