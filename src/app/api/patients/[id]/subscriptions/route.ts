import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

type Params = {
  params: Promise<{ id: string }>;
};

const getSubscriptionsHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();
      if (user.role === 'patient' && user.patientId !== patientId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const subscriptions = await prisma.subscription.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Transform the data to match the component's expected format
      const formattedSubscriptions = subscriptions.map((sub: any) => ({
        id: sub.id,
        planName: sub.planName || 'Unknown Plan',
        planDescription: sub.planDescription || '',
        status: sub.status,
        amount: sub.amount,
        interval: sub.interval || 'month',
        intervalCount: sub.intervalCount || 1,
        startDate: sub.startDate.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        nextBillingDate: sub.nextBillingDate?.toISOString() || null,
        canceledAt: sub.canceledAt?.toISOString() || null,
        pausedAt: sub.pausedAt?.toISOString() || null,
        resumeAt: sub.resumeAt?.toISOString() || null,
        stripeSubscriptionId: sub.stripeSubscriptionId || null,
      }));

      return NextResponse.json(formattedSubscriptions);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching subscriptions:', {
        patientId: (await params).id,
        error: errorMessage,
      });
      return NextResponse.json(
        { error: `Failed to fetch subscriptions: ${errorMessage}` },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'patient'] }
);

export const GET = getSubscriptionsHandler;
