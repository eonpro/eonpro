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

// Helper to generate tracking URL based on carrier
function generateTrackingUrl(carrier: string, trackingNumber: string): string | null {
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

  return statusMap[status] || { status: 'processing', label: status, step: 1 };
}

async function getHandler(req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    const patientId = user.patientId;
    const clinicId = user.clinicId ?? undefined;

    const result = await runWithClinicContext(clinicId, async () => {
      const shippingUpdates = await prisma.patientShippingUpdate.findMany({
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
            },
          },
        },
      });

      const ordersWithTracking = await prisma.order.findMany({
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
        },
      });

      return { shippingUpdates, ordersWithTracking };
    });

    // Combine and deduplicate shipments
    const shipmentMap = new Map<string, any>();

    // Add from shipping updates
    for (const update of result.shippingUpdates) {
      const key = update.trackingNumber;
      const statusInfo = mapStatusToDisplay(update.status);

      if (
        !shipmentMap.has(key) ||
        new Date(update.updatedAt) > new Date(shipmentMap.get(key).lastUpdate)
      ) {
        shipmentMap.set(key, {
          id: `shipping-${update.id}`,
          orderNumber:
            update.lifefileOrderId ||
            update.order?.lifefileOrderId ||
            `ORD-${update.orderId || update.id}`,
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          step: statusInfo.step,
          carrier: update.carrier,
          trackingNumber: update.trackingNumber,
          trackingUrl:
            update.trackingUrl || generateTrackingUrl(update.carrier, update.trackingNumber),
          items: [
            {
              name: update.medicationName || update.order?.primaryMedName || 'Medication',
              strength: update.medicationStrength || update.order?.primaryMedStrength,
              quantity: parseInt(update.medicationQuantity || '1') || 1,
            },
          ],
          orderedAt: update.order?.createdAt || update.createdAt,
          shippedAt: update.shippedAt,
          estimatedDelivery: update.estimatedDelivery,
          deliveredAt: update.actualDelivery,
          lastUpdate: update.updatedAt,
          lastLocation: update.statusNote,
          isRefill: (update.rawPayload as any)?.isRefill || false,
          refillNumber: (update.rawPayload as any)?.refillNumber,
        });
      }
    }

    // Add from orders (if not already present)
    for (const order of result.ordersWithTracking) {
      const key = order.trackingNumber!;
      if (!shipmentMap.has(key)) {
        const status = order.shippingStatus || order.status || 'SHIPPED';
        const statusInfo = mapStatusToDisplay(status.toUpperCase());
        const carrier = detectCarrier(order.trackingNumber!);

        shipmentMap.set(key, {
          id: `order-${order.id}`,
          orderNumber: order.lifefileOrderId || `ORD-${order.id}`,
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          step: statusInfo.step,
          carrier,
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl || generateTrackingUrl(carrier, order.trackingNumber!),
          items: [
            {
              name: order.primaryMedName || 'Medication',
              strength: order.primaryMedStrength,
              quantity: 1, // Default quantity, actual comes from Rx records
            },
          ],
          orderedAt: order.createdAt,
          shippedAt: order.createdAt,
          estimatedDelivery: null,
          deliveredAt: null,
          lastUpdate: order.createdAt,
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
