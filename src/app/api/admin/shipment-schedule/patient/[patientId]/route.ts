/**
 * Patient Shipment Schedule API
 * =============================
 *
 * GET /api/admin/shipment-schedule/patient/[patientId] - Get patient's shipment schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getPatientShipmentSchedule } from '@/lib/shipment-schedule';
import {
  handleApiError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';

// Context type
type RouteContext = { params: Promise<{ patientId: string }> };

/**
 * GET /api/admin/shipment-schedule/patient/[patientId]
 * Get all shipment schedules for a patient
 */
async function handleGet(req: NextRequest, user: AuthUser, context: RouteContext) {
  try {
    const { patientId } = await context.params;
    const patientIdNum = parseInt(patientId, 10);
    const { searchParams } = new URL(req.url);
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    if (isNaN(patientIdNum)) {
      throw new BadRequestError('Invalid patient ID');
    }

    // Get patient to verify clinic access
    const patient = await prisma.patient.findUnique({
      where: { id: patientIdNum },
      select: {
        id: true,
        clinicId: true,
        firstName: true,
        lastName: true,
        patientId: true,
      },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    // Verify clinic access
    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      throw new ForbiddenError('Access denied');
    }

    // Get all refill queue entries for this patient
    const allRefills = await prisma.refillQueue.findMany({
      where: {
        patientId: patientIdNum,
        ...(includeCompleted
          ? {}
          : {
              status: {
                notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'],
              },
            }),
      },
      include: {
        subscription: {
          select: {
            id: true,
            planName: true,
            status: true,
          },
        },
        lastOrder: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippingStatus: true,
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippingStatus: true,
          },
        },
      },
      orderBy: [{ nextRefillDate: 'asc' }, { shipmentNumber: 'asc' }],
      take: 500,
    });

    // Get multi-shipment schedules specifically
    const multiShipmentSchedules = await getPatientShipmentSchedule(patientIdNum, includeCompleted);

    // Group refills by series (parentRefillId)
    const seriesMap = new Map<number, typeof allRefills>();

    for (const refill of allRefills) {
      const seriesKey = refill.parentRefillId || refill.id;

      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, []);
      }
      seriesMap.get(seriesKey)!.push(refill);
    }

    // Convert to array of series
    const series = Array.from(seriesMap.entries()).map(([parentId, refills]) => {
      const firstRefill = refills[0];
      return {
        seriesId: parentId,
        totalShipments: firstRefill.totalShipments || 1,
        budDays: firstRefill.budDays,
        planName: firstRefill.planName,
        medicationName: firstRefill.medicationName,
        subscriptionId: firstRefill.subscriptionId,
        shipments: refills.map((r) => ({
          id: r.id,
          shipmentNumber: r.shipmentNumber,
          status: r.status,
          nextRefillDate: r.nextRefillDate,
          lastRefillDate: r.lastRefillDate,
          reminderSentAt: r.reminderSentAt,
          patientNotifiedAt: r.patientNotifiedAt,
          order: r.order,
        })),
      };
    });

    // Calculate summary stats
    type RefillEntry = (typeof allRefills)[number];
    type SeriesEntry = (typeof series)[number];
    type ShipmentEntry = SeriesEntry['shipments'][number];
    const stats = {
      totalScheduledShipments: allRefills.filter((r: RefillEntry) => r.status === 'SCHEDULED')
        .length,
      totalPendingShipments: allRefills.filter((r: RefillEntry) =>
        ['PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'].includes(r.status)
      ).length,
      totalCompletedShipments: allRefills.filter((r: RefillEntry) => r.status === 'COMPLETED')
        .length,
      activeSeries: series.filter((s: SeriesEntry) =>
        s.shipments.some(
          (sh: ShipmentEntry) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(sh.status)
        )
      ).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        patient: {
          id: patient.id,
          patientId: patient.patientId,
          firstName: patient.firstName,
          lastName: patient.lastName,
        },
        series,
        allRefills,
        stats,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/shipment-schedule/patient/[patientId]' });
  }
}

export const GET = withAuth(
  (req: NextRequest, user: AuthUser, context?: any) =>
    handleGet(req, user, context as RouteContext),
  { roles: ['admin', 'super_admin', 'provider'] }
);
