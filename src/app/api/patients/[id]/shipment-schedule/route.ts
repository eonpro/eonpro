/**
 * Patient Shipment Schedule API
 * Returns the multi-month prepaid shipment schedule (RefillQueue entries) for a patient.
 *
 * GET /api/patients/[id]/shipment-schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handleGet(req: NextRequest, user: AuthUser, context?: unknown) {
  try {
    const params = (context as { params: Promise<{ id: string }> })?.params;
    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Verify user has access to this patient's clinic
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch all multi-shipment RefillQueue entries for this patient
    const shipments = await prisma.refillQueue.findMany({
      where: {
        patientId,
        totalShipments: { gt: 1 },
      },
      orderBy: [
        { parentRefillId: 'asc' },
        { shipmentNumber: 'asc' },
      ],
      select: {
        id: true,
        shipmentNumber: true,
        totalShipments: true,
        nextRefillDate: true,
        status: true,
        medicationName: true,
        planName: true,
        parentRefillId: true,
        invoiceId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      patientId,
      shipments,
      totalSeries: new Set(shipments.map((s) => s.parentRefillId || s.id)).size,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SHIPMENT-SCHEDULE] Error fetching schedule', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch shipment schedule' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGet);
