/**
 * Patient Portal Tracking API
 *
 * GET /api/patient-portal/tracking - Get tracking data for logged-in patient
 * Returns active shipments and shipment history.
 * Uses withAuth (Bearer or cookie) so portal clients using Authorization header are supported.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

export const maxDuration = 30;

// Helper to generate tracking URL based on carrier
function generateTrackingUrl(carrier: string, trackingNumber: string): string | null {
  if (!carrier || !trackingNumber || !trackingNumber.trim()) return null;

  const carrierUrls: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    dhl: `https://www.dhl.com/us-en/home/tracking/tracking-global-forwarding.html?submit=1&tracking-id=${trackingNumber}`,
  };

  const normalizedCarrier = carrier.toLowerCase().replace(/[^a-z]/g, '');

  for (const [key, url] of Object.entries(carrierUrls)) {
    if (normalizedCarrier.includes(key)) {
      return url;
    }
  }

  return null;
}

// Map status to user-friendly format
function mapStatusToDisplay(status: string): {
  status: 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  label: string;
  step: number;
} {
  const statusMap: Record<
    string,
    {
      status:
        | 'processing'
        | 'shipped'
        | 'in_transit'
        | 'out_for_delivery'
        | 'delivered'
        | 'exception';
      label: string;
      step: number;
    }
  > = {
    PENDING: { status: 'processing', label: 'Processing', step: 1 },
    LABEL_CREATED: { status: 'processing', label: 'Label Created', step: 1 },
    SHIPPED: { status: 'shipped', label: 'Shipped', step: 2 },
    IN_TRANSIT: { status: 'in_transit', label: 'In Transit', step: 3 },
    OUT_FOR_DELIVERY: { status: 'out_for_delivery', label: 'Out for Delivery', step: 4 },
    DELIVERED: { status: 'delivered', label: 'Delivered', step: 5 },
    RETURNED: { status: 'exception', label: 'Returned', step: 0 },
    EXCEPTION: { status: 'exception', label: 'Exception', step: 0 },
    CANCELLED: { status: 'exception', label: 'Cancelled', step: 0 },
  };

  return statusMap[status] || { status: 'processing', label: status || 'Processing', step: 1 };
}

interface RxRecord {
  medName: string;
  strength: string;
  quantity: string;
  form: string;
}

function buildMedicationItems(
  rxs: RxRecord[] | undefined | null,
  fallbackName: string | null | undefined,
  fallbackStrength: string | null | undefined,
  fallbackQuantity: string | null | undefined
): Array<{ name: string; strength: string | null; quantity: number }> {
  if (rxs && rxs.length > 0) {
    return rxs.map((rx) => ({
      name: rx.medName || 'Medication',
      strength: rx.strength || null,
      quantity: parseInt(rx.quantity || '1') || 1,
    }));
  }
  return [{
    name: fallbackName || 'Medication',
    strength: fallbackStrength || null,
    quantity: parseInt(fallbackQuantity || '1') || 1,
  }];
}

function safeDate(value: string | number | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function getHandler(req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      logger.warn('[Portal Tracking] No patientId in JWT', { userId: user.id, role: user.role });
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    let patientId = user.patientId;
    const clinicId = user.clinicId ?? undefined;

    // Verify the patientId from the JWT still matches and resolve clinicId if missing
    const patientRecord = await runWithClinicContext(clinicId, async () => {
      return prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
    }).catch(() => null);

    // If the scoped query fails (wrong clinic), try basePrisma lookup
    if (!patientRecord) {
      const { basePrisma } = await import('@/lib/db');
      const fallback = await basePrisma.patient.findFirst({
        where: { userId: user.id },
        select: { id: true, clinicId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (fallback) {
        logger.info('[Portal Tracking] Resolved patientId via userId fallback', {
          jwtPatientId: patientId,
          resolvedPatientId: fallback.id,
          clinicId: fallback.clinicId,
        });
        patientId = fallback.id;
      }
    }

    const effectiveClinicId = patientRecord?.clinicId ?? clinicId;

    logger.info('[Portal Tracking] Query context', {
      userId: user.id,
      patientId,
      jwtPatientId: user.patientId,
      jwtClinicId: user.clinicId,
      effectiveClinicId,
    });

    const result = await runWithClinicContext(effectiveClinicId, async () => {
      const [shippingUpdates, ordersWithTracking, allRecentOrders, paidInvoicesAwaitingRx] =
        await Promise.all([
          prisma.patientShippingUpdate.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: {
              order: {
                select: {
                  id: true,
                  lifefileOrderId: true,
                  createdAt: true,
                  primaryMedName: true,
                  primaryMedStrength: true,
                  rxs: {
                    select: {
                      medName: true,
                      strength: true,
                      quantity: true,
                      form: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.order.findMany({
            where: {
              patientId,
              trackingNumber: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              createdAt: true,
              lifefileOrderId: true,
              trackingNumber: true,
              trackingUrl: true,
              shippingStatus: true,
              primaryMedName: true,
              primaryMedStrength: true,
              status: true,
              rxs: {
                select: {
                  medName: true,
                  strength: true,
                  quantity: true,
                  form: true,
                },
              },
            },
          }),
          prisma.order.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              createdAt: true,
              lifefileOrderId: true,
              trackingNumber: true,
              primaryMedName: true,
              primaryMedStrength: true,
              rxs: {
                select: {
                  medName: true,
                  strength: true,
                  quantity: true,
                  form: true,
                },
              },
            },
          }),
          prisma.invoice.findMany({
            where: {
              patientId,
              status: 'PAID',
              prescriptionProcessed: false,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, createdAt: true, description: true },
          }),
        ]);

      return {
        shippingUpdates,
        ordersWithTracking,
        allRecentOrders,
        paidInvoicesAwaitingRx,
      };
    });

    logger.info('[Portal Tracking] Query results', {
      patientId,
      shippingUpdates: result.shippingUpdates.length,
      ordersWithTracking: result.ordersWithTracking.length,
      allRecentOrders: result.allRecentOrders.length,
      paidInvoicesAwaitingRx: result.paidInvoicesAwaitingRx.length,
    });

    const shipmentMap = new Map<string, Record<string, unknown>>();

    for (const update of result.shippingUpdates) {
      if (!update.trackingNumber || !update.trackingNumber.trim()) continue;

      const key = update.trackingNumber;
      const statusInfo = mapStatusToDisplay(update.status);

      const existingEntry = shipmentMap.get(key);
      const existingLastUpdate = existingEntry?.lastUpdate as string | undefined;
      const shouldReplace = !existingEntry ||
        (update.updatedAt && existingLastUpdate &&
          new Date(update.updatedAt).getTime() > new Date(existingLastUpdate).getTime());

      if (shouldReplace) {
        shipmentMap.set(key, {
          id: `shipping-${update.id}`,
          orderNumber:
            update.lifefileOrderId ||
            update.order?.lifefileOrderId ||
            `ORD-${update.orderId || update.id}`,
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          step: statusInfo.step,
          carrier: update.carrier || 'Carrier',
          trackingNumber: update.trackingNumber,
          trackingUrl:
            update.trackingUrl || generateTrackingUrl(update.carrier || '', update.trackingNumber),
          items: buildMedicationItems(
            update.order?.rxs,
            update.medicationName || update.order?.primaryMedName,
            update.medicationStrength || update.order?.primaryMedStrength,
            update.medicationQuantity
          ),
          orderedAt: safeDate(update.order?.createdAt) || safeDate(update.createdAt),
          shippedAt: safeDate(update.shippedAt),
          estimatedDelivery: safeDate(update.estimatedDelivery),
          deliveredAt: safeDate(update.actualDelivery),
          lastUpdate: safeDate(update.updatedAt),
          lastLocation: update.statusNote || null,
          isRefill: (update.rawPayload as Record<string, unknown>)?.isRefill || false,
          refillNumber: (update.rawPayload as Record<string, unknown>)?.refillNumber || null,
        });
      }
    }

    for (const order of result.ordersWithTracking) {
      if (!order.trackingNumber || !order.trackingNumber.trim()) continue;

      const key = order.trackingNumber;
      if (!shipmentMap.has(key)) {
        const status = order.shippingStatus || order.status || 'SHIPPED';
        const statusInfo = mapStatusToDisplay(status.toUpperCase());
        const carrier = detectCarrier(order.trackingNumber);

        shipmentMap.set(key, {
          id: `order-${order.id}`,
          orderNumber: order.lifefileOrderId || `ORD-${order.id}`,
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          step: statusInfo.step,
          carrier,
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl || generateTrackingUrl(carrier, order.trackingNumber),
          items: buildMedicationItems(
            order.rxs,
            order.primaryMedName,
            order.primaryMedStrength,
            null
          ),
          orderedAt: safeDate(order.createdAt),
          shippedAt: safeDate(order.createdAt),
          estimatedDelivery: null,
          deliveredAt: null,
          lastUpdate: safeDate(order.createdAt),
          lastLocation: null,
          isRefill: false,
          refillNumber: null,
        });
      }
    }

    // Convert to array and sort
    const allShipments = Array.from(shipmentMap.values()).sort(
      (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()
    );

    // Separate active (non-delivered) and history (delivered)
    const activeShipments = allShipments.filter(
      (s) => s.status !== 'delivered' && s.status !== 'exception'
    );
    const deliveredShipments = allShipments.filter(
      (s) => s.status === 'delivered' || s.status === 'exception'
    );

    // Build prescription journey (steps 1–4) for transparency before tracking exists
    type JourneyStage = 1 | 2 | 3 | 4;
    type PrescriptionJourney = {
      stage: JourneyStage;
      label: string;
      message: string;
      medicationName: string | null;
      orderId?: number;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
      carrier?: string | null;
      orderedAt?: string | null;
    };

    const hasTracking =
      result.shippingUpdates.some((u) => u.trackingNumber?.trim()) ||
      result.ordersWithTracking.some((o) => o.trackingNumber?.trim());
    const orderSentNoTracking = result.allRecentOrders.find(
      (o) => o.lifefileOrderId && !(o.trackingNumber?.trim())
    );
    const paidNoRx = result.paidInvoicesAwaitingRx.length > 0;

    let prescriptionJourney: PrescriptionJourney | null = null;

    if (hasTracking && activeShipments.length > 0) {
      const s = activeShipments[0] as Record<string, unknown>;
      const medName =
        (Array.isArray(s.items) && (s.items[0] as { name?: string })?.name) || 'your medication';
      prescriptionJourney = {
        stage: 4,
        label: 'On the way',
        message: `Your prescription is on the way! Track your shipment below.`,
        medicationName: String(medName),
        trackingNumber: s.trackingNumber as string | null,
        trackingUrl: (s.trackingUrl as string | null) ?? null,
        carrier: (s.carrier as string) ?? null,
        orderedAt: (s.orderedAt as string) ?? null,
      };
    } else if (orderSentNoTracking) {
      const medName =
        orderSentNoTracking.primaryMedName ||
        orderSentNoTracking.rxs?.[0]?.medName ||
        'your medication';
      prescriptionJourney = {
        stage: 3,
        label: 'Pharmacy processing',
        message: `Congratulations! Your prescription for "${medName}" has been approved and sent to the pharmacy. The pharmacy is currently processing your prescription. Tracking will appear here once your order ships.`,
        medicationName: medName,
        orderId: orderSentNoTracking.id,
        orderedAt: safeDate(orderSentNoTracking.createdAt),
      };
    } else if (paidNoRx) {
      prescriptionJourney = {
        stage: 1,
        label: 'Provider reviewing',
        message:
          'A licensed provider is reviewing your intake information. You will see updates here once your prescription is approved and sent to the pharmacy.',
        medicationName: null,
        orderedAt: safeDate(result.paidInvoicesAwaitingRx[0]?.createdAt),
      };
    }

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Patient',
        resourceId: String(patientId),
        patientId,
        action: 'portal_tracking',
        outcome: 'SUCCESS',
        metadata: { totalActive: activeShipments.length, totalDelivered: deliveredShipments.length },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for portal tracking', {
        patientId,
        userId: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      activeShipments,
      deliveredShipments,
      prescriptionJourney,
      totalActive: activeShipments.length,
      totalDelivered: deliveredShipments.length,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/tracking',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const GET = withAuth(getHandler, { roles: ['patient'] });

// Helper to detect carrier from tracking number
function detectCarrier(trackingNumber: string): string {
  const tn = trackingNumber.toUpperCase();

  // UPS: 1Z followed by 16 alphanumeric characters
  if (/^1Z[A-Z0-9]{16}$/i.test(tn)) return 'UPS';

  // FedEx: 12, 15, 20, or 22 digits
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(tn)) return 'FedEx';

  // USPS: 20-22 digits or specific formats
  if (/^\d{20,22}$/.test(tn) || /^(94|93|92|91|9[0-5])\d{18,20}$/.test(tn)) return 'USPS';

  // DHL: 10 digits
  if (/^\d{10}$/.test(tn)) return 'DHL';

  return 'Carrier';
}
