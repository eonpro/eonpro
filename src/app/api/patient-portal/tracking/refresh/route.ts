/**
 * Patient Portal — Refresh FedEx Tracking
 *
 * POST /api/patient-portal/tracking/refresh
 *
 * Patient-safe endpoint that refreshes FedEx tracking status for the
 * logged-in patient's active shipments. Returns a summary of what changed.
 * Uses the 30-min TTL cache in the Track API to prevent over-polling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import {
  resolveCredentialsWithAttribution,
  trackShipmentBatch,
  isFedExTrackingNumber,
  type ShippingStatusValue,
} from '@/lib/fedex';

const TERMINAL_STATUSES: ShippingStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];
const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

async function handleRefresh(_req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    const patientId = user.patientId;

    const patient = await basePrisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient?.clinicId) {
      return NextResponse.json({ error: 'Unable to resolve clinic' }, { status: 403 });
    }

    const clinicId = patient.clinicId;

    // Source 1: PatientShippingUpdate records with FedEx carrier
    const activeUpdates = await basePrisma.patientShippingUpdate.findMany({
      where: {
        patientId,
        clinicId,
        carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
        status: { notIn: TERMINAL_STATUSES },
      },
      select: { id: true, trackingNumber: true, orderId: true, status: true },
    });

    const coveredTrackingNumbers = new Set(activeUpdates.map((u) => u.trackingNumber));

    // Source 2: Orders with FedEx tracking numbers not covered by a PatientShippingUpdate
    const ordersWithTracking = await basePrisma.order.findMany({
      where: {
        patientId,
        clinicId,
        trackingNumber: { not: null },
        shippingStatus: { notIn: TERMINAL_ORDER_STATUSES },
      },
      select: { id: true, trackingNumber: true, primaryMedName: true, primaryMedStrength: true },
    });

    const bareOrders = ordersWithTracking.filter(
      (o) => o.trackingNumber && !coveredTrackingNumbers.has(o.trackingNumber) && isFedExTrackingNumber(o.trackingNumber)
    );

    const allTrackingNumbers = [...new Set([
      ...coveredTrackingNumbers,
      ...bareOrders.map((o) => o.trackingNumber!),
    ])];

    if (allTrackingNumbers.length === 0) {
      return NextResponse.json({ success: true, refreshed: 0, message: 'No active FedEx shipments to refresh' });
    }

    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
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

    let resolution;
    try {
      resolution = resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
    } catch {
      return NextResponse.json({ error: 'FedEx tracking is not available at this time' }, { status: 503 });
    }

    const results = await trackShipmentBatch(resolution.credentials, allTrackingNumbers);

    let updated = 0;

    // Update existing PatientShippingUpdate records
    for (const shipment of activeUpdates) {
      const result = results.get(shipment.trackingNumber);
      if (!result) continue;

      const currentStatus = shipment.status as ShippingStatusValue;
      if (TERMINAL_STATUSES.includes(currentStatus)) continue;

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

      updated++;
    }

    // Backfill PatientShippingUpdate for bare Orders (findFirst to prevent duplicates)
    for (const order of bareOrders) {
      const result = results.get(order.trackingNumber!);
      if (!result) continue;

      try {
        const existing = await basePrisma.patientShippingUpdate.findFirst({
          where: {
            clinicId,
            patientId,
            trackingNumber: order.trackingNumber!,
          },
          select: { id: true },
        });

        if (existing) {
          await basePrisma.patientShippingUpdate.update({
            where: { id: existing.id },
            data: {
              status: result.status,
              statusNote: result.statusDetail || result.statusDescription,
              estimatedDelivery: result.estimatedDelivery,
              actualDelivery: result.actualDelivery,
            },
          });
        } else {
          await basePrisma.patientShippingUpdate.create({
            data: {
              clinicId,
              patientId,
              orderId: order.id,
              trackingNumber: order.trackingNumber!,
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
        }

        await basePrisma.order.update({
          where: { id: order.id },
          data: { shippingStatus: result.status, lastWebhookAt: new Date() },
        });

        updated++;
      } catch (createErr) {
        logger.warn('[Portal Tracking Refresh] Failed to backfill for bare order', {
          orderId: order.id,
          error: createErr instanceof Error ? createErr.message : String(createErr),
        });
      }
    }

    logger.info('[Portal Tracking Refresh] Complete', {
      patientId,
      clinicId,
      fromShippingUpdates: activeUpdates.length,
      fromBareOrders: bareOrders.length,
      totalTracked: allTrackingNumbers.length,
      updated,
    });

    return NextResponse.json({
      success: true,
      refreshed: updated,
      total: allTrackingNumbers.length,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/patient-portal/tracking/refresh' });
  }
}

export const POST = withAuth(handleRefresh, { roles: ['patient'] });
