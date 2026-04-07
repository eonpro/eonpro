import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function handler(
  req: NextRequest,
  user: AuthUser,
  context?: RouteParams,
) {
  if (!context?.params) {
    return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
  }
  const { id: rawId } = await context.params;
  try {
    const patientId = parseInt(rawId, 10);
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    const take = Math.min(
      parseInt(req.nextUrl.searchParams.get('take') || '50', 10),
      100
    );

    const orders = await prisma.order.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        primaryMedName: true,
        primaryMedStrength: true,
        trackingNumber: true,
        trackingUrl: true,
        status: true,
        lifefileOrderId: true,
        shippingMethod: true,
        shippingStatus: true,
        lastWebhookAt: true,
        cancelledAt: true,
        fulfillmentChannel: true,
        externalPharmacyName: true,
        rxs: {
          select: {
            id: true,
            orderId: true,
            medicationKey: true,
            medName: true,
            strength: true,
            form: true,
            quantity: true,
            refills: true,
            sig: true,
            daysSupply: true,
          },
        },
        provider: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        events: { orderBy: { createdAt: 'desc' } as const, take: 20 },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/patients/${rawId}/orders` });
  }
}

export const GET = withClinicalAuth(handler as any);
