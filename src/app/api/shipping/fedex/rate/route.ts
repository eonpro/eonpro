import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { resolveCredentialsWithAttribution, getRateQuote } from '@/lib/fedex';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

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

function classifyFedExRateError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const normalized = raw.toLowerCase();

  if (normalized.includes('temporarily unavailable') || normalized.includes('circuit')) {
    return {
      status: 503,
      message: 'FedEx rating service is temporarily unavailable. Please try again shortly.',
    };
  }

  // fedexRequest error shape: "FedEx API error: <status> - <body>"
  const statusMatch = raw.match(/FedEx API error:\s*(\d{3})/i);
  const upstreamStatus = statusMatch ? Number(statusMatch[1]) : null;
  if (upstreamStatus === 400 || upstreamStatus === 404 || upstreamStatus === 422) {
    return {
      status: 422,
      message:
        'FedEx could not quote this shipment with the provided address/package details. Please review and try again.',
    };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 503,
      message: 'FedEx credentials are unavailable. Contact your administrator.',
    };
  }

  if (normalized.includes('no rate quote returned')) {
    return {
      status: 422,
      message:
        'No FedEx rate quote is available for this shipment. Try a different service level or package configuration.',
    };
  }

  return {
    status: 502,
    message: 'Failed to retrieve FedEx rate quote. Please try again.',
  };
}

async function handleGetRate(req: NextRequest, user: AuthUser) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = rateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const { patientId, origin, destination, serviceType, packagingType, weightLbs, oneRate } =
      parsed.data;

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

    let clinic;
    try {
      clinic = await prisma.clinic.findUnique({
        where: { id: patient.clinicId },
        select: {
          id: true,
          name: true,
          fedexClientId: true,
          fedexClientSecret: true,
          fedexAccountNumber: true,
          fedexEnabled: true,
        },
      });
    } catch (dbErr) {
      if (
        dbErr instanceof Prisma.PrismaClientKnownRequestError &&
        (dbErr.code === 'P2021' || dbErr.code === 'P2022')
      ) {
        return NextResponse.json(
          {
            error:
              'FedEx shipping is not yet configured for this clinic. Please contact your administrator to complete the setup.',
          },
          { status: 422 }
        );
      }
      if (dbErr instanceof Prisma.PrismaClientValidationError) {
        const msg = dbErr.message.toLowerCase();
        if (msg.includes('unknown field') || msg.includes('does not exist')) {
          return NextResponse.json(
            {
              error:
                'FedEx shipping is not yet configured for this clinic. Please contact your administrator to complete the setup.',
            },
            { status: 422 }
          );
        }
      }
      throw dbErr;
    }

    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
    let resolution;
    try {
      resolution = resolveCredentialsWithAttribution(clinic ?? undefined, {
        allowEnvFallback,
      });
    } catch {
      return NextResponse.json(
        { error: 'FedEx credentials not configured. Contact your administrator.' },
        { status: 422 }
      );
    }

    let rate;
    try {
      rate = await getRateQuote(resolution.credentials, {
        serviceType,
        packagingType,
        shipper: { personName: '', phoneNumber: '', ...origin },
        recipient: { personName: '', phoneNumber: '', ...destination },
        packages: [{ weightLbs }],
        oneRate,
      });
    } catch (fedexErr: unknown) {
      const classified = classifyFedExRateError(fedexErr);
      logger.warn('[FedExRate] Quote request failed', {
        patientId,
        clinicId: patient.clinicId,
        clinicName: clinic?.name || null,
        status: classified.status,
        credentialSource: resolution.source,
        fedexEnvironment: resolution.environment,
        accountFingerprint: resolution.accountFingerprint,
        usedEnvFallback: resolution.usedEnvFallback,
        error: fedexErr instanceof Error ? fedexErr.message : String(fedexErr),
      });
      return NextResponse.json({ error: classified.message }, { status: classified.status });
    }

    return NextResponse.json({
      ...rate,
      routing: {
        clinicId: patient.clinicId,
        credentialSource: resolution.source,
        fedexEnvironment: resolution.environment,
        accountFingerprint: resolution.accountFingerprint,
        usedEnvFallback: resolution.usedEnvFallback,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/shipping/fedex/rate' });
  }
}

export const POST = withAuth(handleGetRate, {
  roles: ['super_admin', 'admin', 'pharmacy_rep'],
});
