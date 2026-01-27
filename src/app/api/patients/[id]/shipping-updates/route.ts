/**
 * API endpoint for patient shipping updates
 * GET /api/patients/[id]/shipping-updates
 * 
 * Returns shipping history at the patient profile level
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withAuthParams(async (
  req: NextRequest,
  context: RouteContext,
  user: any
) => {
  try {
    const resolvedParams = await context.params;
    const patientId = parseInt(resolvedParams.id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }

    // Determine clinic context
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Fetch shipping updates with clinic context
    const shippingUpdates = await runWithClinicContext(clinicId, async () => {
      // First verify patient exists and belongs to clinic
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });

      if (!patient) {
        return null;
      }

      // Fetch shipping updates for this patient
      return prisma.patientShippingUpdate.findMany({
        where: {
          patientId,
          ...(clinicId && { clinicId }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              lifefileOrderId: true,
              primaryMedName: true,
              primaryMedStrength: true,
              status: true,
            },
          },
        },
      });
    });

    if (shippingUpdates === null) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      patientId,
      count: shippingUpdates.length,
      shippingUpdates: shippingUpdates.map(update => ({
        id: update.id,
        trackingNumber: update.trackingNumber,
        carrier: update.carrier,
        trackingUrl: update.trackingUrl,
        status: update.status,
        statusNote: update.statusNote,
        shippedAt: update.shippedAt,
        estimatedDelivery: update.estimatedDelivery,
        actualDelivery: update.actualDelivery,
        medication: {
          name: update.medicationName,
          strength: update.medicationStrength,
          quantity: update.medicationQuantity,
          form: update.medicationForm,
        },
        lifefileOrderId: update.lifefileOrderId,
        brand: update.brand,
        source: update.source,
        createdAt: update.createdAt,
        updatedAt: update.updatedAt,
        order: update.order ? {
          id: update.order.id,
          lifefileOrderId: update.order.lifefileOrderId,
          medicationName: update.order.primaryMedName,
          medicationStrength: update.order.primaryMedStrength,
          status: update.order.status,
        } : null,
      })),
    });
  } catch (error) {
    logger.error('Error fetching patient shipping updates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shipping updates' },
      { status: 500 }
    );
  }
});
