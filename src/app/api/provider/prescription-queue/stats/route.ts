/**
 * Provider prescription stats — aggregate counts of successful pharmacy submissions
 * (orders with lifefileOrderId) attributed to the logged-in prescriber.
 *
 * GET /api/provider/prescription-queue/stats
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { handleApiError } from '@/domains/shared/errors';
import { withProviderAuth, type AuthUser } from '@/lib/auth/middleware';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { addCalendarDaysET, startOfDayET, startOfMonthET } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

const ET_PERIOD_NOTE_EMPTY =
  'Periods use US Eastern Time (America/New_York): daily = since midnight ET today; weekly = last 7 ET calendar days including today; monthly = month-to-date ET. Each Rx is counted on the day it was sent to the pharmacy (approved-at time when present, otherwise order created time for direct sends).';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
} as const;

type StatsResponseBody = {
  daily: number;
  weekly: number;
  monthly: number;
  glp1: Record<string, unknown>;
  newVsRefill: Record<string, unknown>;
  periodNote: string;
  periodBoundsEt?: {
    dailyStart: string;
    weekStart: string;
    monthStart: string;
    asOf: string;
  };
};

function jsonStatsPayload(body: StatsResponseBody): Response {
  return NextResponse.json(
    { ...body, timezone: 'America/New_York' },
    { headers: NO_STORE_HEADERS }
  );
}

function classifyGlp1(primaryMedName: string | null): 'sema' | 'tirz' | null {
  if (!primaryMedName) return null;
  const u = primaryMedName.toUpperCase();
  if (u.includes('SEMAGLUTIDE')) return 'sema';
  if (u.includes('TIRZEPATIDE')) return 'tirz';
  return null;
}

function zeroStatsResponse(periodNote: string): Response {
  return jsonStatsPayload({
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
    newVsRefill: {
      newScripts: 0,
      refills: 0,
      newPercent: null,
      refillPercent: null,
      total: 0,
    },
    periodNote,
  });
}

/** Count only orders whose pharmacy-send instant falls on/after `bound` (Eastern calendar windows above). */
function sentToPharmacyOnOrAfter(bound: Date): Prisma.OrderWhereInput {
  return {
    OR: [
      { approvedAt: { gte: bound } },
      { AND: [{ approvedAt: null }, { createdAt: { gte: bound } }] },
    ],
  };
}

function aggregateGlp1Split(orders: { primaryMedName: string | null }[]): {
  sema: number;
  tirz: number;
  semaPercent: number | null;
  tirzPercent: number | null;
  totalClassified: number;
} {
  let sema = 0;
  let tirz = 0;
  for (const o of orders) {
    const c = classifyGlp1(o.primaryMedName);
    if (c === 'sema') sema += 1;
    else if (c === 'tirz') tirz += 1;
  }
  const totalClassified = sema + tirz;
  const semaPercent = totalClassified > 0 ? Math.round((sema / totalClassified) * 1000) / 10 : null;
  const tirzPercent = totalClassified > 0 ? Math.round((tirz / totalClassified) * 1000) / 10 : null;
  return { sema, tirz, semaPercent, tirzPercent, totalClassified };
}

/**
 * Split an order set into "new scripts" vs "refills".
 *
 * An order counts as a **refill** if EITHER:
 *
 *   (a) it has a back-link to a RefillQueue row (formal refill via the
 *       subscription → RefillQueue → provider-queue path), OR
 *   (b) the same patient already has a prior `lifefileOrderId != null`
 *       order for the same `primaryMedName` from before this period
 *       (catches subscription renewals that come in through the invoice
 *       path — those never touch RefillQueue, so signal (a) misses them
 *       and they were previously miscounted as "new").
 *
 * Caller is responsible for resolving signal (b) and passing both flags
 * — this aggregator just sums.
 */
function aggregateNewVsRefillSplit(orders: { isRefill: boolean }[]): {
  newScripts: number;
  refills: number;
  newPercent: number | null;
  refillPercent: number | null;
  total: number;
} {
  let refills = 0;
  for (const o of orders) {
    if (o.isRefill) refills += 1;
  }
  const total = orders.length;
  const newScripts = total - refills;
  const newPercent = total > 0 ? Math.round((newScripts / total) * 1000) / 10 : null;
  const refillPercent = total > 0 ? Math.round((refills / total) * 1000) / 10 : null;
  return { newScripts, refills, newPercent, refillPercent, total };
}

/** Normalize medication name for "same med" matching across orders. */
function medKey(patientId: number, primaryMedName: string | null): string | null {
  if (!primaryMedName) return null;
  return `${patientId}|${primaryMedName.trim().toUpperCase()}`;
}

/**
 * Resolve which of today's orders are refills. See `aggregateNewVsRefillSplit`
 * for the full definition. Runs one bounded `findMany` over prior orders for
 * the patients we saw today and returns the per-order classification.
 */
async function resolveRefillFlagsForToday(
  clinicId: number,
  etDayStart: Date,
  todays: Array<{
    patientId: number;
    primaryMedName: string | null;
    refillAsNewOrder: { id: number } | null;
  }>
): Promise<{ isRefill: boolean }[]> {
  const todayPatientIds = Array.from(new Set(todays.map((o) => o.patientId)));
  const priorOrders =
    todayPatientIds.length === 0
      ? []
      : await prisma.order.findMany({
          where: {
            clinicId,
            cancelledAt: null,
            lifefileOrderId: { not: null },
            status: { notIn: ['error', 'declined'] },
            patientId: { in: todayPatientIds },
            createdAt: { lt: etDayStart },
          },
          select: { patientId: true, primaryMedName: true },
        });

  const priorPatientMedPairs = new Set<string>();
  for (const p of priorOrders) {
    const key = medKey(p.patientId, p.primaryMedName);
    if (key) priorPatientMedPairs.add(key);
  }

  return todays.map((o) => {
    const formalRefill = o.refillAsNewOrder !== null;
    const key = medKey(o.patientId, o.primaryMedName);
    const priorRefill = key !== null && priorPatientMedPairs.has(key);
    return { isRefill: formalRefill || priorRefill };
  });
}

async function handleGet(_req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    if (!user.clinicId) {
      return zeroStatsResponse(`Set a clinic context to see stats. ${ET_PERIOD_NOTE_EMPTY}`);
    }

    if (!user.providerId) {
      return zeroStatsResponse(
        `Link a provider profile to your account to see personal Rx stats. ${ET_PERIOD_NOTE_EMPTY}`
      );
    }

    const now = new Date();
    const etDayStart = startOfDayET(now);
    const etWeekStart = addCalendarDaysET(now, -6);
    const etMonthStart = startOfMonthET(now);

    // Attribute Rx to the logged-in actor: direct submits (providerId + no approver) or
    // admin-queued orders where this user approved-and-sent (approvedByUserId).
    const actorWhere: Prisma.OrderWhereInput = {
      clinicId: user.clinicId,
      cancelledAt: null,
      lifefileOrderId: { not: null },
      status: { notIn: ['error', 'declined'] },
      OR: [
        { approvedByUserId: user.id },
        {
          providerId: user.providerId,
          approvedByUserId: null,
        },
      ],
    };

    const [daily, weekly, monthly, monthlyOrders, dailyOrdersForRefillSplit] = await Promise.all([
      prisma.order.count({
        where: { AND: [actorWhere, sentToPharmacyOnOrAfter(etDayStart)] },
      }),
      prisma.order.count({
        where: { AND: [actorWhere, sentToPharmacyOnOrAfter(etWeekStart)] },
      }),
      prisma.order.count({
        where: { AND: [actorWhere, sentToPharmacyOnOrAfter(etMonthStart)] },
      }),
      // Used for the GLP-1 split, which intentionally stays month-to-date so the
      // sample is large enough to be meaningful.
      prisma.order.findMany({
        where: { AND: [actorWhere, sentToPharmacyOnOrAfter(etMonthStart)] },
        select: { primaryMedName: true },
      }),
      // Today's orders (ET) for the new-vs-refill split. Refill detection happens
      // below in two passes:
      //   1. formal refill = back-link to a RefillQueue row via RefillNewOrder
      //   2. heuristic refill = same patient already has a prior sent-to-pharmacy
      //      order for the same primaryMedName from before today (catches
      //      subscription renewals routed through the invoice path, which never
      //      create a RefillQueue row and were previously miscounted as "new").
      prisma.order.findMany({
        where: { AND: [actorWhere, sentToPharmacyOnOrAfter(etDayStart)] },
        select: {
          patientId: true,
          primaryMedName: true,
          refillAsNewOrder: { select: { id: true } },
        },
      }),
    ]);

    const glp1 = aggregateGlp1Split(monthlyOrders);
    const newVsRefill = aggregateNewVsRefillSplit(
      await resolveRefillFlagsForToday(user.clinicId, etDayStart, dailyOrdersForRefillSplit)
    );

    return jsonStatsPayload({
      daily,
      weekly,
      monthly,
      glp1,
      newVsRefill,
      periodNote: `${ET_PERIOD_NOTE_EMPTY} Semaglutide vs tirzepatide is the share among GLP‑1 orders month-to-date (ET). New vs refill is the share of orders submitted today (ET); a refill is either an order created from a RefillQueue entry, or an order whose same patient + medication was already prescribed on an earlier day.`,
      periodBoundsEt: {
        dailyStart: etDayStart.toISOString(),
        weekStart: etWeekStart.toISOString(),
        monthStart: etMonthStart.toISOString(),
        asOf: now.toISOString(),
      },
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
