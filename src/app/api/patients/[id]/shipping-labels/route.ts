import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { Prisma } from '@prisma/client';

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function handleGetLabels(
  req: NextRequest,
  user: AuthUser,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const patientId = parseInt(id, 10);
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let labels;
    try {
      labels = await prisma.shipmentLabel.findMany({
        where: { patientId, clinicId: patient.clinicId },
        select: {
          id: true,
          trackingNumber: true,
          serviceType: true,
          carrier: true,
          status: true,
          createdAt: true,
          weightLbs: true,
          labelFormat: true,
          labelS3Key: true,
          labelPdfBase64: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    } catch (dbErr) {
      if (
        (dbErr instanceof Prisma.PrismaClientKnownRequestError &&
          (dbErr.code === 'P2021' || dbErr.code === 'P2022')) ||
        (dbErr instanceof Prisma.PrismaClientValidationError &&
          /unknown field|does not exist/i.test(dbErr.message))
      ) {
        return NextResponse.json({ labels: [] });
      }
      throw dbErr;
    }

    const result = labels.map((l) => ({
      id: l.id,
      trackingNumber: l.trackingNumber,
      serviceType: l.serviceType,
      carrier: l.carrier,
      status: l.status,
      createdAt: l.createdAt,
      weightLbs: l.weightLbs,
      labelFormat: l.labelFormat,
      hasLabel: !!(l.labelPdfBase64 || l.labelS3Key),
    }));

    return NextResponse.json({ labels: result });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/patients/[id]/shipping-labels' });
  }
}

export const GET = withAuthParams(handleGetLabels, {
  roles: ['super_admin', 'admin', 'pharmacy_rep'],
});
