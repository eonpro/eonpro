import { basePrisma } from '@/lib/db';
import {
  resolveCredentialsWithAttribution,
  trackShipmentBatch,
  isFedExTrackingNumber,
  type TrackingResult,
  type ShippingStatusValue,
  type FedExCredentials,
} from '@/lib/fedex';
import { logger } from '@/lib/logger';

const TERMINAL_STATUSES: ShippingStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];
const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

type ActiveShipment = {
  id: number;
  trackingNumber: string;
  clinicId: number;
  orderId: number | null;
  patientId: number | null;
  status: string;
};

type BareOrder = {
  id: number;
  trackingNumber: string;
  clinicId: number;
  patientId: number;
  primaryMedName: string | null;
  primaryMedStrength: string | null;
};

export type PollerResult = {
  totalActive: number;
  totalPolled: number;
  totalUpdated: number;
  totalDelivered: number;
  totalBackfilled: number;
  totalErrors: number;
  totalNoData: number;
  clinicsProcessed: number;
  durationMs: number;
};

export async function pollActiveFedExShipments(): Promise<PollerResult> {
  const start = Date.now();
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  // Source 1: PatientShippingUpdate records with FedEx carrier
  const activeShipments: ActiveShipment[] = await basePrisma.patientShippingUpdate.findMany({
    where: {
      carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
      status: { notIn: TERMINAL_STATUSES },
      updatedAt: { lt: staleThreshold },
    },
    select: {
      id: true,
      trackingNumber: true,
      clinicId: true,
      orderId: true,
      patientId: true,
      status: true,
    },
    take: 300,
    orderBy: { updatedAt: 'asc' },
  });

  const coveredTrackingNumbers = new Set(activeShipments.map((s) => s.trackingNumber));

  // Source 2: Orders with FedEx tracking numbers that have no PatientShippingUpdate
  const ordersWithFedExTracking = await basePrisma.order.findMany({
    where: {
      trackingNumber: { not: null },
      shippingStatus: { notIn: TERMINAL_ORDER_STATUSES },
      updatedAt: { lt: staleThreshold },
    },
    select: {
      id: true,
      trackingNumber: true,
      clinicId: true,
      patientId: true,
      primaryMedName: true,
      primaryMedStrength: true,
    },
    take: 200,
    orderBy: { updatedAt: 'asc' },
  });

  const bareOrders: BareOrder[] = ordersWithFedExTracking.filter(
    (o) =>
      o.trackingNumber &&
      o.patientId &&
      o.clinicId &&
      !coveredTrackingNumbers.has(o.trackingNumber) &&
      isFedExTrackingNumber(o.trackingNumber)
  ) as BareOrder[];

  if (activeShipments.length === 0 && bareOrders.length === 0) {
    logger.info('[FedEx Poller] No active shipments to poll');
    return {
      totalActive: 0,
      totalPolled: 0,
      totalUpdated: 0,
      totalDelivered: 0,
      totalBackfilled: 0,
      totalErrors: 0,
      totalNoData: 0,
      clinicsProcessed: 0,
      durationMs: Date.now() - start,
    };
  }

  // Group everything by clinic for credential resolution
  const byClinic = new Map<number, { shipments: ActiveShipment[]; bareOrders: BareOrder[] }>();

  for (const s of activeShipments) {
    const entry = byClinic.get(s.clinicId) || { shipments: [], bareOrders: [] };
    entry.shipments.push(s);
    byClinic.set(s.clinicId, entry);
  }
  for (const o of bareOrders) {
    const entry = byClinic.get(o.clinicId) || { shipments: [], bareOrders: [] };
    entry.bareOrders.push(o);
    byClinic.set(o.clinicId, entry);
  }

  let totalPolled = 0;
  let totalUpdated = 0;
  let totalDelivered = 0;
  let totalBackfilled = 0;
  let totalErrors = 0;
  let totalNoData = 0;

  const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';

  for (const [clinicId, { shipments, bareOrders: clinicBareOrders }] of byClinic) {
    let credentials: FedExCredentials;
    try {
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
      const resolution = resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
      credentials = resolution.credentials;
    } catch (err) {
      logger.warn('[FedEx Poller] Failed to resolve credentials for clinic', {
        clinicId,
        error: err instanceof Error ? err.message : String(err),
      });
      totalErrors += shipments.length + clinicBareOrders.length;
      continue;
    }

    const allTrackingNumbers = [
      ...new Set([
        ...shipments.map((s) => s.trackingNumber),
        ...clinicBareOrders.map((o) => o.trackingNumber),
      ]),
    ];
    totalPolled += allTrackingNumbers.length;

    let results: Map<string, TrackingResult | null>;
    try {
      results = await trackShipmentBatch(credentials, allTrackingNumbers, { skipCache: true });
    } catch (err) {
      logger.error('[FedEx Poller] Batch track failed for clinic', {
        clinicId,
        count: allTrackingNumbers.length,
        error: err instanceof Error ? err.message : String(err),
      });
      totalErrors += allTrackingNumbers.length;
      continue;
    }

    // Count tracking numbers with no FedEx data (NOTFOUND or API error)
    let clinicNoData = 0;
    for (const [, r] of results) {
      if (!r) clinicNoData++;
    }
    totalNoData += clinicNoData;
    if (clinicNoData > 0) {
      logger.warn('[FedEx Poller] No tracking data returned for some shipments', {
        clinicId,
        total: allTrackingNumbers.length,
        noData: clinicNoData,
        sampleTrackingNumbers: allTrackingNumbers.filter((tn) => !results.get(tn)).slice(0, 3),
      });
    }

    // Update existing PatientShippingUpdate records
    for (const shipment of shipments) {
      const result = results.get(shipment.trackingNumber);
      if (!result) continue;

      const currentStatus = shipment.status as ShippingStatusValue;
      if (TERMINAL_STATUSES.includes(currentStatus)) continue;
      if (result.status === currentStatus && !result.estimatedDelivery && !result.actualDelivery) continue;

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
        logger.error('[FedEx Poller] Failed to update shipping record', {
          shippingUpdateId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        totalErrors++;
      }
    }

    // Backfill PatientShippingUpdate for bare Orders
    for (const order of clinicBareOrders) {
      const result = results.get(order.trackingNumber);
      if (!result) continue;

      try {
        await basePrisma.patientShippingUpdate.create({
          data: {
            clinicId,
            patientId: order.patientId,
            orderId: order.id,
            trackingNumber: order.trackingNumber,
            carrier: 'FedEx',
            trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber}`,
            status: result.status,
            statusNote: result.statusDetail || result.statusDescription,
            estimatedDelivery: result.estimatedDelivery,
            actualDelivery: result.actualDelivery,
            shippedAt: new Date(),
            medicationName: order.primaryMedName,
            medicationStrength: order.primaryMedStrength,
            source: 'fedex_tracking_sync',
            matchedAt: new Date(),
            matchStrategy: 'order_tracking_number',
            processedAt: new Date(),
          },
        });

        await basePrisma.order.update({
          where: { id: order.id },
          data: { shippingStatus: result.status, lastWebhookAt: new Date() },
        });

        totalBackfilled++;
        totalUpdated++;
        if (result.status === 'DELIVERED') totalDelivered++;
      } catch (err) {
        logger.error('[FedEx Poller] Failed to backfill shipping record for bare order', {
          orderId: order.id,
          trackingNumber: order.trackingNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        totalErrors++;
      }
    }
  }

  const pollerResult: PollerResult = {
    totalActive: activeShipments.length + bareOrders.length,
    totalPolled,
    totalUpdated,
    totalDelivered,
    totalBackfilled,
    totalErrors,
    totalNoData,
    clinicsProcessed: byClinic.size,
    durationMs: Date.now() - start,
  };

  logger.info('[FedEx Poller] Polling complete', pollerResult);
  return pollerResult;
}
