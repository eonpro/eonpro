/**
 * Super Admin Affiliate Analytics API
 * 
 * Cross-clinic analytics for affiliate performance:
 * - Total codes, conversions, revenue across all clinics
 * - Per-clinic breakdown
 * - Top performing codes globally
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface ClinicBreakdown {
  clinicId: number;
  clinicName: string;
  totalCodes: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  activeAffiliates: number;
}

interface TopCode {
  code: string;
  affiliateName: string;
  clinicName: string;
  conversions: number;
  revenue: number;
}

interface CrossClinicAnalyticsResponse {
  totals: {
    totalClinics: number;
    totalAffiliates: number;
    activeAffiliates: number;
    totalCodes: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
  };
  clinicBreakdown: ClinicBreakdown[];
  topCodes: TopCode[];
  trends: Array<{
    date: string;
    conversions: number;
    revenue: number;
  }>;
}

async function handler(req: NextRequest): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;
  const period = searchParams.get('period') || '30d';
  const clinicId = searchParams.get('clinicId');

  logger.info('[SuperAdmin Analytics] Starting request', { period, clinicId });

  try {
    // Calculate date range
    let dateFrom: Date = new Date();
    switch (period) {
      case '7d':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '30d':
        dateFrom.setDate(dateFrom.getDate() - 30);
        break;
      case '90d':
        dateFrom.setDate(dateFrom.getDate() - 90);
        break;
      case 'ytd':
        dateFrom = new Date(dateFrom.getFullYear(), 0, 1);
        break;
      case 'all':
        dateFrom = new Date(2020, 0, 1);
        break;
      default:
        dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get all clinics with affiliate data
    const clinics = await prisma.clinic.findMany({
      where: clinicId ? { id: parseInt(clinicId, 10) } : {},
      select: {
        id: true,
        name: true,
      },
    });

    // Define clinic type
    type ClinicRecord = { id: number; name: string };

    logger.info('[SuperAdmin Analytics] Found clinics', { count: clinics.length });

    // Aggregate data per clinic
    const clinicBreakdown: ClinicBreakdown[] = await Promise.all(
      clinics.map(async (clinic: ClinicRecord) => {
        try {
          const [affiliates, codes, clicks, conversions, revenue] = await Promise.all([
            // Active affiliates
            prisma.affiliate.count({
              where: { clinicId: clinic.id, status: 'ACTIVE' },
            }),
            // Total codes
            prisma.affiliateRefCode.count({
              where: { clinicId: clinic.id, isActive: true },
            }),
            // Total clicks (uses) in period
            prisma.affiliateTouch.count({
              where: {
                clinicId: clinic.id,
                createdAt: { gte: dateFrom },
              },
            }),
            // Total conversions in period (only records with convertedAt set)
            prisma.affiliateTouch.count({
              where: {
                clinicId: clinic.id,
                convertedAt: { not: null, gte: dateFrom },
              },
            }),
            // Total revenue in period
            prisma.affiliateCommissionEvent.aggregate({
              where: {
                clinicId: clinic.id,
                createdAt: { gte: dateFrom },
                status: { in: ['PENDING', 'APPROVED', 'PAID'] },
              },
              _sum: { orderAmountCents: true },
            }),
          ]);

          return {
            clinicId: clinic.id,
            clinicName: clinic.name,
            totalCodes: codes,
            totalClicks: clicks,
            totalConversions: conversions,
            totalRevenue: revenue._sum.orderAmountCents || 0,
            activeAffiliates: affiliates,
          };
        } catch (clinicErr) {
          logger.error('[SuperAdmin Analytics] Failed for clinic', {
            clinicId: clinic.id,
            error: clinicErr instanceof Error ? clinicErr.message : 'Unknown',
          });
          return {
            clinicId: clinic.id,
            clinicName: clinic.name,
            totalCodes: 0,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            activeAffiliates: 0,
          };
        }
      })
    );

    // Calculate totals
    const totals = {
      totalClinics: clinics.length,
      totalAffiliates: await prisma.affiliate.count(),
      activeAffiliates: await prisma.affiliate.count({ where: { status: 'ACTIVE' } }),
      totalCodes: clinicBreakdown.reduce((sum: number, c: ClinicBreakdown) => sum + c.totalCodes, 0),
      totalClicks: clinicBreakdown.reduce((sum: number, c: ClinicBreakdown) => sum + c.totalClicks, 0),
      totalConversions: clinicBreakdown.reduce((sum: number, c: ClinicBreakdown) => sum + c.totalConversions, 0),
      totalRevenue: clinicBreakdown.reduce((sum: number, c: ClinicBreakdown) => sum + c.totalRevenue, 0),
      avgConversionRate: 0,
    };
    
    totals.avgConversionRate = totals.totalClicks > 0
      ? (totals.totalConversions / totals.totalClicks) * 100
      : 0;

    // Get top performing codes globally
    logger.info('[SuperAdmin Analytics] Fetching ref codes');
    const refCodes = await prisma.affiliateRefCode.findMany({
      where: clinicId ? { clinicId: parseInt(clinicId, 10) } : {},
      include: {
        affiliate: { select: { displayName: true } },
        clinic: { select: { name: true } },
      },
    });

    // Define ref code type
    type RefCodeWithRelations = {
      refCode: string;
      affiliate: { displayName: string };
      clinic: { name: string };
    };

    logger.info('[SuperAdmin Analytics] Found ref codes', { count: refCodes.length });

    const topCodesWithMetrics: TopCode[] = await Promise.all(
      refCodes.slice(0, 50).map(async (code: RefCodeWithRelations) => {
        try {
          const [conversions, revenue] = await Promise.all([
            prisma.affiliateTouch.count({
              where: {
                refCode: code.refCode,
                convertedAt: { not: null, gte: dateFrom },
              },
            }),
            prisma.affiliateCommissionEvent.aggregate({
              where: {
                affiliate: {
                  refCodes: { some: { refCode: code.refCode } },
                },
                createdAt: { gte: dateFrom },
                status: { in: ['PENDING', 'APPROVED', 'PAID'] },
              },
              _sum: { orderAmountCents: true },
            }),
          ]);

          return {
            code: code.refCode,
            affiliateName: code.affiliate.displayName,
            clinicName: code.clinic.name,
            conversions,
            revenue: revenue._sum.orderAmountCents || 0,
          };
        } catch (codeErr) {
          logger.error('[SuperAdmin Analytics] Failed for code', {
            refCode: code.refCode,
            error: codeErr instanceof Error ? codeErr.message : 'Unknown',
          });
          return {
            code: code.refCode,
            affiliateName: code.affiliate.displayName,
            clinicName: code.clinic.name,
            conversions: 0,
            revenue: 0,
          };
        }
      })
    );

    // Sort by conversions and take top 10
    const topCodes = topCodesWithMetrics
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 10);

    // Get daily trends for the period
    logger.info('[SuperAdmin Analytics] Calculating trends');
    const days = Math.min(Math.ceil((Date.now() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)), 30);
    const trends: Array<{ date: string; conversions: number; revenue: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      try {
        const [dayConversions, dayRevenue] = await Promise.all([
          prisma.affiliateTouch.count({
            where: {
              ...(clinicId ? { clinicId: parseInt(clinicId, 10) } : {}),
              convertedAt: { not: null, gte: dayStart, lte: dayEnd },
            },
          }),
          prisma.affiliateCommissionEvent.aggregate({
            where: {
              ...(clinicId ? { clinicId: parseInt(clinicId, 10) } : {}),
              createdAt: { gte: dayStart, lte: dayEnd },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            _sum: { orderAmountCents: true },
          }),
        ]);

        trends.push({
          date: dayStart.toISOString(),
          conversions: dayConversions,
          revenue: dayRevenue._sum.orderAmountCents || 0,
        });
      } catch (dayErr) {
        trends.push({
          date: dayStart.toISOString(),
          conversions: 0,
          revenue: 0,
        });
      }
    }

    const response: CrossClinicAnalyticsResponse = {
      totals,
      clinicBreakdown: clinicBreakdown.sort((a: ClinicBreakdown, b: ClinicBreakdown) => b.totalConversions - a.totalConversions),
      topCodes,
      trends,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[SuperAdmin Analytics] Failed to fetch analytics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}

export const GET = withSuperAdminAuth(handler);
