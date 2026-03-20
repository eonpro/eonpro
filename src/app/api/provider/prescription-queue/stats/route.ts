/**
 * Provider prescription stats — aggregate counts of successful pharmacy submissions
 * (orders with lifefileOrderId) attributed to the logged-in prescriber.
 *
 * GET /api/provider/prescription-queue/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function classifyGlp1(primaryMedName: string | null): 'sema' | 'tirz' | null {
  if (!primaryMedName) return null;
  const u = primaryMedName.toUpperCase();
  if (u.includes('SEMAGLUTIDE')) return 'sema';
  if (u.includes('TIRZEPATIDE')) return 'tirz';
  return null;
}

async function handleGet(_req: NextRequest, user: AuthUser) {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        {
          daily: 0,
          weekly: 0,
          monthly: 0,
          glp1: {
            sema: 0,
            tirz: 0,
            semaPercent: null as number | null,
            tirzPercent: null as number | null,
            totalClassified: 0,
          },
          periodNote:
            'Set a clinic context to see stats. Periods use UTC (daily = since UTC midnight; weekly = last 7 UTC calendar days including today; monthly = month-to-date UTC).',
        },
        { status: 200 }
      );
    }

    if (!user.providerId) {
      return NextResponse.json({
        daily: 0,
        weekly: 0,
        monthly: 0,
        glp1: {
          sema: 0,
          tirz: 0,
          semaPercent: null,
          tirzPercent: null,
          totalClassified: 0,
        },
        periodNote:
          'Link a provider profile to your account to see personal Rx stats. Periods use UTC.',
      });
    }

    const now = new Date();
    const utcDayStart = startOfUtcDay(now);
    const utcWeekStart = new Date(utcDayStart);
    utcWeekStart.setUTCDate(utcWeekStart.getUTCDate() - 6);
    const utcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const baseWhere = {
      clinicId: user.clinicId,
      providerId: user.providerId,
      cancelledAt: null,
      lifefileOrderId: { not: null },
      status: { not: 'error' },
    };

    const [daily, weekly, monthly, glp1Orders] = await Promise.all([
      prisma.order.count({
        where: { ...baseWhere, createdAt: { gte: utcDayStart } },
      }),
      prisma.order.count({
        where: { ...baseWhere, createdAt: { gte: utcWeekStart } },
      }),
      prisma.order.count({
        where: { ...baseWhere, createdAt: { gte: utcMonthStart } },
      }),
      prisma.order.findMany({
        where: { ...baseWhere, createdAt: { gte: utcMonthStart } },
        select: { primaryMedName: true },
      }),
    ]);

    let sema = 0;
    let tirz = 0;
    for (const o of glp1Orders) {
      const c = classifyGlp1(o.primaryMedName);
      if (c === 'sema') sema += 1;
      else if (c === 'tirz') tirz += 1;
    }
    const totalClassified = sema + tirz;
    const semaPercent =
      totalClassified > 0 ? Math.round((sema / totalClassified) * 1000) / 10 : null;
    const tirzPercent =
      totalClassified > 0 ? Math.round((tirz / totalClassified) * 1000) / 10 : null;

    return NextResponse.json({
      daily,
      weekly,
      monthly,
      glp1: {
        sema,
        tirz,
        semaPercent,
        tirzPercent,
        totalClassified,
      },
      periodNote:
        'Periods are UTC: Daily = since midnight UTC today; Weekly = last 7 UTC calendar days (including today); Monthly = month-to-date UTC. Semaglutide vs tirzepatide is the split among GLP‑1 orders month-to-date.',
    });
  } catch (error: unknown) {
    logger.error('[PRESCRIPTION-QUEUE-STATS] Failed', {
      userId: user.id,
      clinicId: user.clinicId,
      providerId: user.providerId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return handleApiError(error, { route: 'GET /api/provider/prescription-queue/stats' });
  }
}

export const GET = withProviderAuth(handleGet);
