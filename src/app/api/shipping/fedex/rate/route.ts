import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { resolveCredentials, getRateQuote } from '@/lib/fedex';
import { z } from 'zod';

const addressSchema = z.object({
  address1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1).max(2),
  zip: z.string().min(1),
  countryCode: z.string().optional(),
  residential: z.boolean().optional(),
});

const rateRequestSchema = z.object({
  patientId: z.number().int().positive(),
  origin: addressSchema,
  destination: addressSchema,
  serviceType: z.string().min(1),
  packagingType: z.string().default('YOUR_PACKAGING'),
  weightLbs: z.number().positive().default(1),
  oneRate: z.boolean().default(false),
});

async function handleGetRate(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = rateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { patientId, origin, destination, serviceType, packagingType, weightLbs, oneRate } = parsed.data;

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

    const clinic = await prisma.clinic.findUnique({
      where: { id: patient.clinicId },
      select: {
        fedexClientId: true,
        fedexClientSecret: true,
        fedexAccountNumber: true,
        fedexEnabled: true,
      },
    });

    let credentials;
    try {
      credentials = resolveCredentials(clinic ?? undefined);
    } catch {
      return NextResponse.json(
        { error: 'FedEx credentials not configured. Contact your administrator.' },
        { status: 422 },
      );
    }

    const rate = await getRateQuote(credentials, {
      serviceType,
      packagingType,
      shipper: { personName: '', phoneNumber: '', ...origin },
      recipient: { personName: '', phoneNumber: '', ...destination },
      packages: [{ weightLbs }],
      oneRate,
    });

    return NextResponse.json(rate);
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/shipping/fedex/rate' });
  }
}

export const POST = withAuth(handleGetRate, {
  roles: ['super_admin', 'admin'],
});
