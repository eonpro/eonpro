import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import {
  resolveCredentialsWithAttribution,
  trackShipment,
  trackShipmentBatch,
  type TrackingResult,
  type ShippingStatusValue,
} from '@/lib/fedex';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const trackSingleSchema = z.object({
  trackingNumber: z.string().min(1),
});

const trackBatchSchema = z.object({
  trackingNumbers: z.array(z.string().min(1)).min(1).max(30),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: ShippingStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

async function resolveClinicCredentials(clinicId: number, allowEnvFallback: boolean) {
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

  return resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
}

async function applyTrackingUpdate(
  trackingNumber: string,
  result: TrackingResult
): Promise<{ updated: boolean; shippingUpdateIds: number[] }> {
  const updates = await basePrisma.patientShippingUpdate.findMany({
    where: {
      trackingNumber,
      carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
      status: { notIn: TERMINAL_STATUSES },
    },
    select: { id: true, orderId: true, status: true, clinicId: true },
  });

  if (updates.length === 0) {
    return { updated: false, shippingUpdateIds: [] };
  }

  const updatedIds: number[] = [];

  for (const update of updates) {
    const currentStatus = update.status as ShippingStatusValue;
    if (TERMINAL_STATUSES.includes(currentStatus)) continue;

    await basePrisma.patientShippingUpdate.update({
      where: { id: update.id },
      data: {
        status: result.status,
        statusNote: result.statusDetail || result.statusDescription,
        estimatedDelivery: result.estimatedDelivery,
        actualDelivery: result.actualDelivery,
      },
    });
    updatedIds.push(update.id);

    if (update.orderId) {
      await basePrisma.order.update({
        where: { id: update.orderId },
        data: {
          shippingStatus: result.status,
          lastWebhookAt: new Date(),
        },
      });
    }
  }

  logger.info('[FedEx Track] Applied tracking update', {
    trackingNumber,
    newStatus: result.status,
    updatedCount: updatedIds.length,
  });

  return { updated: true, shippingUpdateIds: updatedIds };
}

// ---------------------------------------------------------------------------
// POST — Track and update DB for one or more tracking numbers
// ---------------------------------------------------------------------------

async function handleTrack(req: NextRequest, user: AuthUser) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
    const isBatch = Array.isArray((body as any)?.trackingNumbers);

    if (isBatch) {
      const parsed = trackBatchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { trackingNumbers } = parsed.data;

      // Resolve credentials: find the clinic from the first matching shipping update
      const sampleUpdate = await basePrisma.patientShippingUpdate.findFirst({
        where: {
          trackingNumber: { in: trackingNumbers },
          carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
        },
        select: { clinicId: true },
      });

      const clinicId = sampleUpdate?.clinicId ?? user.clinicId;
      if (!clinicId) {
        return NextResponse.json(
          { error: 'Unable to resolve clinic for credentials' },
          { status: 422 }
        );
      }

      if (user.role !== 'super_admin' && clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      let resolution;
      try {
        resolution = await resolveClinicCredentials(clinicId, allowEnvFallback);
      } catch {
        return NextResponse.json({ error: 'FedEx credentials not configured' }, { status: 422 });
      }

      const trackingResults = await trackShipmentBatch(resolution.credentials, trackingNumbers);

      const responseItems = [];
      for (const [tn, result] of trackingResults) {
        if (result) {
          const dbUpdate = await applyTrackingUpdate(tn, result);
          responseItems.push({
            trackingNumber: tn,
            status: result.status,
            statusDescription: result.statusDescription,
            statusDetail: result.statusDetail,
            estimatedDelivery: result.estimatedDelivery,
            actualDelivery: result.actualDelivery,
            signedBy: result.signedBy,
            location: result.location,
            scanEvents: result.scanEvents.slice(0, 10),
            dbUpdated: dbUpdate.updated,
          });
        } else {
          responseItems.push({
            trackingNumber: tn,
            status: null,
            error: 'Tracking info not available',
          });
        }
      }

      return NextResponse.json({ success: true, results: responseItems });
    }

    // Single tracking number
    const parsed = trackSingleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const { trackingNumber } = parsed.data;

    const shippingUpdate = await basePrisma.patientShippingUpdate.findFirst({
      where: { trackingNumber, carrier: { in: ['FedEx', 'FEDEX', 'fedex'] } },
      select: { clinicId: true },
    });

    const clinicId = shippingUpdate?.clinicId ?? user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Unable to resolve clinic for credentials' },
        { status: 422 }
      );
    }

    if (user.role !== 'super_admin' && clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let resolution;
    try {
      resolution = await resolveClinicCredentials(clinicId, allowEnvFallback);
    } catch {
      return NextResponse.json({ error: 'FedEx credentials not configured' }, { status: 422 });
    }

    const result = await trackShipment(resolution.credentials, trackingNumber, { skipCache: true });

    if (!result) {
      return NextResponse.json({
        success: true,
        trackingNumber,
        status: null,
        message: 'Tracking information not yet available from FedEx',
      });
    }

    const dbUpdate = await applyTrackingUpdate(trackingNumber, result);

    return NextResponse.json({
      success: true,
      trackingNumber,
      status: result.status,
      statusDescription: result.statusDescription,
      statusDetail: result.statusDetail,
      estimatedDelivery: result.estimatedDelivery,
      actualDelivery: result.actualDelivery,
      signedBy: result.signedBy,
      location: result.location,
      scanEvents: result.scanEvents.slice(0, 20),
      dbUpdated: dbUpdate.updated,
      updatedRecords: dbUpdate.shippingUpdateIds.length,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/shipping/fedex/track' });
  }
}

export const POST = withAuth(handleTrack, {
  roles: ['super_admin', 'admin', 'pharmacy_rep'],
});

// ---------------------------------------------------------------------------
// GET — Read-only tracking lookup (does not update DB)
// ---------------------------------------------------------------------------

async function handleTrackLookup(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const trackingNumber = searchParams.get('trackingNumber');

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Missing trackingNumber parameter' }, { status: 400 });
    }

    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';

    const shippingUpdate = await basePrisma.patientShippingUpdate.findFirst({
      where: { trackingNumber, carrier: { in: ['FedEx', 'FEDEX', 'fedex'] } },
      select: { clinicId: true },
    });

    const clinicId = shippingUpdate?.clinicId ?? user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Unable to resolve clinic for credentials' },
        { status: 422 }
      );
    }

    if (user.role !== 'super_admin' && clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let resolution;
    try {
      resolution = await resolveClinicCredentials(clinicId, allowEnvFallback);
    } catch {
      return NextResponse.json({ error: 'FedEx credentials not configured' }, { status: 422 });
    }

    const result = await trackShipment(resolution.credentials, trackingNumber);

    if (!result) {
      return NextResponse.json({
        success: true,
        trackingNumber,
        status: null,
        message: 'Tracking information not yet available from FedEx',
      });
    }

    return NextResponse.json({
      success: true,
      trackingNumber,
      status: result.status,
      statusDescription: result.statusDescription,
      statusDetail: result.statusDetail,
      estimatedDelivery: result.estimatedDelivery,
      actualDelivery: result.actualDelivery,
      signedBy: result.signedBy,
      location: result.location,
      scanEvents: result.scanEvents.slice(0, 20),
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/shipping/fedex/track' });
  }
}

export const GET = withAuth(handleTrackLookup, {
  roles: ['super_admin', 'admin', 'pharmacy_rep'],
});
