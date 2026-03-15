import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import {
  resolveCredentialsWithAttribution,
  trackShipmentBatch,
  type TrackingResult,
  type ShippingStatusValue,
  type FedExCredentials,
} from '@/lib/fedex';

export const maxDuration = 30;

const TERMINAL_STATUSES: ShippingStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

async function handleRefreshAll(_req: NextRequest, _user: AuthUser) {
  try {
    const allActive = await basePrisma.patientShippingUpdate.findMany({
      where: {
        carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
        status: { notIn: TERMINAL_STATUSES },
      },
      select: {
        id: true,
        trackingNumber: true,
        clinicId: true,
        orderId: true,
        status: true,
      },
      take: 500,
      orderBy: { updatedAt: 'asc' },
    });

    if (allActive.length === 0) {
      return NextResponse.json({ success: true, message: 'No active FedEx shipments to refresh', updated: 0 });
    }

    const byClinic = new Map<number, typeof allActive>();
    for (const s of allActive) {
      const list = byClinic.get(s.clinicId) || [];
      list.push(s);
      byClinic.set(s.clinicId, list);
    }

    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
    let totalUpdated = 0;
    let totalDelivered = 0;
    let totalErrors = 0;
    let totalPolled = 0;

    for (const [clinicId, shipments] of byClinic) {
      let credentials: FedExCredentials;
      try {
        const clinic = await basePrisma.clinic.findUnique({
          where: { id: clinicId },
          select: { id: true, fedexClientId: true, fedexClientSecret: true, fedexAccountNumber: true, fedexEnabled: true },
        });
        const resolution = resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
        credentials = resolution.credentials;
      } catch {
        totalErrors += shipments.length;
        continue;
      }

      const uniqueTrackingNumbers = [...new Set(shipments.map((s) => s.trackingNumber))];
      totalPolled += uniqueTrackingNumbers.length;

      let results: Map<string, TrackingResult | null>;
      try {
        results = await trackShipmentBatch(credentials, uniqueTrackingNumbers, { skipCache: true });
      } catch (err) {
        logger.error('[Shipment Monitor Refresh] Batch failed', {
          clinicId,
          count: uniqueTrackingNumbers.length,
          error: err instanceof Error ? err.message : String(err),
        });
        totalErrors += uniqueTrackingNumbers.length;
        continue;
      }

      for (const shipment of shipments) {
        const result = results.get(shipment.trackingNumber);
        if (!result) continue;

        const currentStatus = shipment.status as ShippingStatusValue;
        if (TERMINAL_STATUSES.includes(currentStatus)) continue;

        try {
          await basePrisma.patientShippingUpdate.update({
            where: { id: shipment.id },
            data: {
              status: result.status,
              statusNote: result.statusDetail || result.statusDescription,
              estimatedDelivery: result.estimatedDelivery,
              actualDelivery: result.actualDelivery,
            },
          });

          if (shipment.orderId) {
            await basePrisma.order.update({
              where: { id: shipment.orderId },
              data: { shippingStatus: result.status, lastWebhookAt: new Date() },
            });
          }

          totalUpdated++;
          if (result.status === 'DELIVERED') totalDelivered++;
        } catch (err) {
          totalErrors++;
        }
      }
    }

    logger.info('[Shipment Monitor Refresh] Complete', {
      totalActive: allActive.length,
      totalPolled,
      totalUpdated,
      totalDelivered,
      totalErrors,
      clinicsProcessed: byClinic.size,
    });

    return NextResponse.json({
      success: true,
      totalActive: allActive.length,
      totalPolled,
      totalUpdated,
      totalDelivered,
      totalErrors,
      clinicsProcessed: byClinic.size,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/super-admin/shipment-monitor/refresh-all' });
  }
}

export const POST = withSuperAdminAuth(handleRefreshAll);
