import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth } from '@/lib/auth/middleware';

export const GET = withProviderAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const pharmacy = searchParams.get('pharmacy');
    const status = searchParams.get('status');

    const where: any = {};

    if (startDateParam && endDateParam) {
      where.createdAt = {
        gte: new Date(startDateParam),
        lte: new Date(endDateParam)
      };
    }

    if (pharmacy && pharmacy !== 'all') {
      where.pharmacyName = pharmacy;
    }

    if (status && status !== 'all') {
      where.currentStatus = status;
    }

    const prescriptions = await (prisma as any).prescriptionTracking.findMany({
      where,
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        order: {
          select: {
            id: true,
            lifefileOrderId: true
          }
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const formattedPrescriptions = prescriptions.map((rx: any) => ({
      id: rx.id,
      rxNumber: rx.rxNumber,
      medicationName: rx.medicationName,
      patientName: `${rx.patient.firstName} ${rx.patient.lastName}`,
      patientEmail: rx.patient.email,
      patientPhone: rx.patient.phoneNumber,
      currentStatus: rx.currentStatus,
      trackingNumber: rx.trackingNumber,
      carrier: rx.carrier,
      estimatedDeliveryDate: rx.estimatedDeliveryDate,
      actualDeliveryDate: rx.actualDeliveryDate,
      timeToProcess: rx.timeToProcess,
      timeToShip: rx.timeToShip,
      timeToDeliver: rx.timeToDeliver,
      totalFulfillmentTime: rx.totalFulfillmentTime,
      createdAt: rx.createdAt,
      updatedAt: rx.updatedAt,
      statusHistory: rx.statusHistory
    }));

    return NextResponse.json({
      prescriptions: formattedPrescriptions,
      total: formattedPrescriptions.length
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions' },
      { status: 500 }
    );
  }
});
