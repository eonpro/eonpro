import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getStripeForClinic, getPublishableKeyForContext } from '@/lib/stripe/connect';

/**
 * GET /api/stripe/publishable-key?patientId=123
 * Returns the correct Stripe publishable key for a patient's clinic.
 * Lightweight — no Stripe objects are created.
 */
async function handler(req: NextRequest, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const patientId = parseInt(searchParams.get('patientId') || '');

  if (isNaN(patientId)) {
    return NextResponse.json({ error: 'patientId required' }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { clinicId: true },
  });

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: patient.clinicId },
    select: { subdomain: true },
  });

  const stripeContext = await getStripeForClinic(patient.clinicId);

  return NextResponse.json({
    publishableKey: getPublishableKeyForContext(stripeContext, clinic?.subdomain),
    connectedAccountId: stripeContext.stripeAccountId || null,
  });
}

export const GET = withAuth(handler);
