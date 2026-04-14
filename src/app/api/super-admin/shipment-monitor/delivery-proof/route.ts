import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { resolveCredentialsWithAttribution, getProofOfDelivery } from '@/lib/fedex';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

async function handleGet(req: NextRequest, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const trackingNumber = searchParams.get('trackingNumber');

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Missing trackingNumber' }, { status: 400 });
    }

    // Check if we already have the proof cached in rawPayload
    const existing = await basePrisma.patientShippingUpdate.findFirst({
      where: { trackingNumber },
      select: { id: true, clinicId: true, rawPayload: true },
    });

    const cached = (existing?.rawPayload as any)?.proofOfDeliveryBase64;
    if (cached) {
      const cachedFormat = (existing?.rawPayload as any)?.proofOfDeliveryFormat || 'PNG';
      return NextResponse.json({
        success: true,
        trackingNumber,
        documentBase64: cached,
        documentFormat: cachedFormat,
        cached: true,
      });
    }

    // Resolve credentials
    const clinicId = existing?.clinicId;
    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';

    let resolution;
    try {
      if (clinicId) {
        const clinic = await basePrisma.clinic.findUnique({
          where: { id: clinicId },
          select: {
            id: true,
            fedexClientId: true,
            fedexClientSecret: true,
            fedexAccountNumber: true,
            fedexEnabled: true,
          },
        });
        resolution = resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
      } else {
        resolution = resolveCredentialsWithAttribution(undefined, { allowEnvFallback });
      }
    } catch {
      return NextResponse.json({ error: 'FedEx credentials not available' }, { status: 422 });
    }

    // Fetch from FedEx
    const result = await getProofOfDelivery(resolution.credentials, trackingNumber);

    if (!result) {
      return NextResponse.json({
        success: false,
        trackingNumber,
        message: 'Proof of delivery not available from FedEx for this shipment',
      });
    }

    // Cache the result in rawPayload
    if (existing) {
      try {
        const currentPayload = (existing.rawPayload as Record<string, unknown>) || {};
        await basePrisma.patientShippingUpdate.update({
          where: { id: existing.id },
          data: {
            rawPayload: {
              ...currentPayload,
              proofOfDeliveryBase64: result.documentBase64,
              proofOfDeliveryFormat: result.documentFormat,
              proofOfDeliveryFetchedAt: new Date().toISOString(),
            },
          },
        });
      } catch (cacheErr) {
        logger.warn('[Delivery Proof] Failed to cache POD (non-blocking)', {
          trackingNumber,
          error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        });
      }
    }

    return NextResponse.json({
      success: true,
      trackingNumber,
      documentBase64: result.documentBase64,
      documentFormat: result.documentFormat,
      documentType: result.documentType,
      cached: false,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/super-admin/shipment-monitor/delivery-proof' });
  }
}

export const GET = withSuperAdminAuth(handleGet);
