/**
 * One-time bulk update: mark orders with manual tracking as COMPLETED
 *
 * Finds orders in the awaiting fulfillment state whose patients have
 * PatientShippingUpdate records (manual or otherwise) and marks them COMPLETED.
 *
 * POST /api/admin/bulk-complete-tracked
 * Requires super_admin role.
 *
 * Query params:
 *   ?dryRun=true  — preview only, no changes (default)
 *   ?dryRun=false — execute the update
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

const TERMINAL_STATUSES = [
  'COMPLETED', 'completed', 'CANCELLED', 'cancelled', 'DELIVERED', 'ERROR', 'error',
];

async function handler(req: NextRequest, user: AuthUser) {
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') !== 'false';

  try {
    // Find orders that are awaiting fulfillment but whose patients have shipping updates
    const awaitingOrders = await prisma.order.findMany({
      where: {
        lifefileOrderId: { not: null },
        trackingNumber: null,
        status: { notIn: TERMINAL_STATUSES },
      },
      select: { id: true, status: true, patientId: true, primaryMedName: true },
    });

    // For each, check if the patient has any PatientShippingUpdate
    const toComplete: number[] = [];
    const details: Array<{ orderId: number; status: string | null; patientId: number; shippingUpdates: number }> = [];

    for (const order of awaitingOrders) {
      const shippingCount = await prisma.patientShippingUpdate.count({
        where: { patientId: order.patientId },
      });

      if (shippingCount > 0) {
        toComplete.push(order.id);
        details.push({
          orderId: order.id,
          status: order.status,
          patientId: order.patientId,
          shippingUpdates: shippingCount,
        });
      }
    }

    if (!dryRun && toComplete.length > 0) {
      const result = await prisma.order.updateMany({
        where: { id: { in: toComplete } },
        data: { status: 'COMPLETED' },
      });

      logger.info('[BULK COMPLETE] Updated orders with patient shipping updates', {
        count: result.count,
        orderIds: toComplete,
        approvedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `Updated ${result.count} orders to COMPLETED`,
        updated: result.count,
        details,
      });
    }

    return NextResponse.json({
      dryRun: true,
      message: `Found ${toComplete.length} orders to mark COMPLETED (use ?dryRun=false to execute)`,
      totalAwaiting: awaitingOrders.length,
      toComplete: toComplete.length,
      details,
    });
  } catch (error: any) {
    logger.error('[BULK COMPLETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(handler);
