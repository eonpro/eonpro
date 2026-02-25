/**
 * Daily Scripts Stats Route
 * =========================
 *
 * Returns daily order/script counts with medication breakdown
 * for the dashboard. Supports configurable day range.
 *
 * SECURITY: Requires authentication (admin/provider/super_admin).
 *
 * @module api/orders/stats/daily
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { handleApiError } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface DailyBucket {
  date: string; // YYYY-MM-DD
  total: number;
  medications: Record<string, number>;
  statuses: Record<string, number>;
}

async function handler(request: NextRequest, user: AuthUser) {
  try {
    requirePermission(toPermissionContext(user), 'order:view');

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '14', 10), 90);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      createdAt: { gte: startDate },
    };

    if (user.role !== 'super_admin') {
      if (!user.clinicId) {
        return NextResponse.json({ days: [] }, { status: 200 });
      }
      where.clinicId = user.clinicId;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        status: true,
        primaryMedName: true,
        rxs: {
          select: {
            medName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bucketMap = new Map<string, DailyBucket>();

    // Pre-fill all days so we get zeros for days with no orders
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const key = date.toISOString().slice(0, 10);
      bucketMap.set(key, { date: key, total: 0, medications: {}, statuses: {} });
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = { date: key, total: 0, medications: {}, statuses: {} };
        bucketMap.set(key, bucket);
      }

      bucket.total += 1;

      const status = order.status || 'unknown';
      bucket.statuses[status] = (bucket.statuses[status] || 0) + 1;

      // Count each Rx medication
      if (order.rxs && order.rxs.length > 0) {
        for (const rx of order.rxs) {
          const med = rx.medName || 'Unknown';
          bucket.medications[med] = (bucket.medications[med] || 0) + 1;
        }
      } else if (order.primaryMedName) {
        const med = order.primaryMedName;
        bucket.medications[med] = (bucket.medications[med] || 0) + 1;
      }
    }

    const dailyData = Array.from(bucketMap.values()).sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    const grandTotal = orders.length;

    // Aggregate top medications across all days
    const allMeds: Record<string, number> = {};
    for (const bucket of dailyData) {
      for (const [med, count] of Object.entries(bucket.medications)) {
        allMeds[med] = (allMeds[med] || 0) + count;
      }
    }
    const topMedications = Object.entries(allMeds)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    logger.info('[OrderStats] daily stats fetched', {
      userId: user.id,
      days,
      grandTotal,
    });

    return NextResponse.json({
      days: dailyData,
      grandTotal,
      topMedications,
      range: { from: startDate.toISOString(), to: now.toISOString(), days },
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders/stats/daily' },
    });
  }
}

export const GET = withAuth(handler);
