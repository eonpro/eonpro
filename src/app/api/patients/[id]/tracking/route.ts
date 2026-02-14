/**
 * Patient Tracking API
 *
 * GET /api/patients/[id]/tracking - Get all tracking entries
 * POST /api/patients/[id]/tracking - Add manual tracking entry (for refills, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { ShippingStatus } from '@prisma/client';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Schema for adding manual tracking entry
const addTrackingSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  carrier: z.string().min(1, 'Carrier is required'),
  trackingUrl: z.string().url().optional(),
  status: z
    .enum([
      'PENDING',
      'LABEL_CREATED',
      'SHIPPED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'RETURNED',
      'EXCEPTION',
      'CANCELLED',
    ])
    .optional()
    .default('SHIPPED'),
  medicationName: z.string().optional(),
  medicationStrength: z.string().optional(),
  medicationQuantity: z.string().optional(),
  shippedAt: z.string().optional(), // ISO date string
  estimatedDelivery: z.string().optional(), // ISO date string
  notes: z.string().optional(),
  orderId: z.number().optional(), // Optional link to existing order (legacy, single)
  orderIds: z.array(z.number()).optional(), // Link to multiple orders at once
  isRefill: z.boolean().optional().default(false),
  refillNumber: z.number().optional(),
});

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

// GET - Fetch all tracking entries for a patient
export const GET = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const resolvedParams = await context.params;
      const patientId = parseInt(resolvedParams.id, 10);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const patientGet = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      });
      if (ensureTenantResource(patientGet, clinicId ?? undefined)) return tenantNotFoundResponse();

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

        // Get orders with tracking (for legacy data)
        const orders = await prisma.order.findMany({
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

        // Get last prescription date with all medications
        const lastOrder = await prisma.order.findFirst({
          where: { patientId },
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            primaryMedName: true,
            rxs: {
              select: {
                medName: true,
                strength: true,
                form: true,
                quantity: true,
              },
            },
          },
        });

        // Orders already matched to tracking (have PatientShippingUpdate with orderId)
        const matchedOrderIds = new Set(
          (await prisma.patientShippingUpdate.findMany({
            where: { patientId, orderId: { not: null } },
            select: { orderId: true },
          }))
            .map((s) => s.orderId)
            .filter((id): id is number => id != null)
        );

        // Orders with tracking on the Order record itself are also "matched"
        const ordersWithTracking = await prisma.order.findMany({
          where: { patientId, trackingNumber: { not: null } },
          select: { id: true },
        });
        ordersWithTracking.forEach((o) => matchedOrderIds.add(o.id));

        // Unmatched prescriptions: orders with rxs that have no tracking link
        const unmatchedOrders = await prisma.order.findMany({
          where: {
            patientId,
            id: { notIn: Array.from(matchedOrderIds) },
            rxs: { some: {} },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            primaryMedName: true,
            primaryMedStrength: true,
            rxs: {
              select: {
                id: true,
                medName: true,
                strength: true,
                form: true,
                quantity: true,
              },
            },
          },
        });

        const unmatchedPrescriptions = unmatchedOrders.flatMap((order) => {
          if (order.rxs && order.rxs.length > 0) {
            return order.rxs.map((rx) => ({
              orderId: order.id,
              rxId: rx.id,
              medName: rx.medName,
              strength: rx.strength,
              form: rx.form,
              quantity: rx.quantity,
              displayName: `${rx.medName}${rx.strength ? ` ${rx.strength}` : ''}${rx.form ? ` (${rx.form})` : ''}${rx.quantity ? ` × ${rx.quantity}` : ''}`,
            }));
          }
          return [
            {
              orderId: order.id,
              rxId: order.id,
              medName: order.primaryMedName || 'Unknown',
              strength: order.primaryMedStrength || '',
              form: '',
              quantity: '',
              displayName:
                `${order.primaryMedName || 'Unknown'}${order.primaryMedStrength ? ` ${order.primaryMedStrength}` : ''}`,
            },
          ];
        });

        return {
          patient: patientGet!,
          shippingUpdates,
          orders,
          lastOrder,
          unmatchedPrescriptions,
        };
      });

      if (!result) return tenantNotFoundResponse();

      const { patient, shippingUpdates, orders, lastOrder, unmatchedPrescriptions } = result;

      // Merge and format tracking data
      const trackingEntries = [
        // From PatientShippingUpdate table
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...shippingUpdates.map((update: any) => ({
          id: `shipping-${update.id}`,
          type: 'shipping_update',
          trackingNumber: update.trackingNumber,
          carrier: update.carrier,
          trackingUrl:
            update.trackingUrl || generateTrackingUrl(update.carrier, update.trackingNumber),
          status: update.status,
          statusNote: update.statusNote,
          medicationName: update.medicationName || update.order?.primaryMedName,
          medicationStrength: update.medicationStrength || update.order?.primaryMedStrength,
          medicationQuantity: update.medicationQuantity,
          shippedAt: update.shippedAt,
          estimatedDelivery: update.estimatedDelivery,
          actualDelivery: update.actualDelivery,
          orderId: update.orderId,
          lifefileOrderId: update.lifefileOrderId || update.order?.lifefileOrderId,
          source: update.source,
          createdAt: update.createdAt,
          isRefill: (update.rawPayload as any)?.isRefill || false,
          refillNumber: (update.rawPayload as any)?.refillNumber,
        })),
        // From Order table (legacy tracking)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...orders
          .filter((order: any) => {
            // Don't duplicate if already in shipping updates
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return !shippingUpdates.some(
              (su: any) => su.trackingNumber === order.trackingNumber && su.orderId === order.id
            );
          })
          .map((order: any) => ({
            id: `order-${order.id}`,
            type: 'order',
            trackingNumber: order.trackingNumber,
            carrier: detectCarrier(order.trackingNumber || ''),
            trackingUrl:
              order.trackingUrl ||
              generateTrackingUrl(
                detectCarrier(order.trackingNumber || ''),
                order.trackingNumber || ''
              ),
            status: mapOrderStatusToShipping(order.shippingStatus || order.status),
            statusNote: null,
            medicationName: order.primaryMedName,
            medicationStrength: order.primaryMedStrength,
            medicationQuantity: null,
            shippedAt: order.createdAt,
            estimatedDelivery: null,
            actualDelivery: null,
            orderId: order.id,
            lifefileOrderId: order.lifefileOrderId,
            source: 'lifefile',
            createdAt: order.createdAt,
            isRefill: false,
            refillNumber: null,
          })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Format medications from rxs array
      const lastMedications =
        lastOrder?.rxs?.map(
          (rx: { medName: string; strength: string; form: string; quantity: string }) => ({
            name: rx.medName,
            strength: rx.strength,
            form: rx.form,
            quantity: rx.quantity,
            displayName: `${rx.medName}${rx.strength ? ` ${rx.strength}` : ''}${rx.form ? ` (${rx.form})` : ''}`,
          })
        ) || [];

      return NextResponse.json({
        success: true,
        patient: {
          id: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
        },
        lastPrescriptionDate: lastOrder?.createdAt || null,
        // Keep lastMedication for backward compatibility
        lastMedication: lastOrder?.primaryMedName || null,
        // New: Array of all medications
        lastMedications,
        totalTrackingEntries: trackingEntries.length,
        trackingEntries,
        unmatchedPrescriptions,
      });
    } catch (error) {
      logger.error('Error fetching patient tracking:', error);
      return NextResponse.json({ error: 'Failed to fetch tracking data' }, { status: 500 });
    }
  }
);

// POST - Add manual tracking entry
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const resolvedParams = await context.params;
      const patientId = parseInt(resolvedParams.id, 10);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      // Only providers and admins can add tracking
      if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const body = await req.json();
      const parseResult = addTrackingSchema.safeParse(body);

      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parseResult.error.issues },
          { status: 400 }
        );
      }

      const data = parseResult.data;
      // Auto-detect carrier from tracking number when carrier is generic
      const effectiveCarrier =
        data.carrier === 'Other' || data.carrier === 'Unknown'
          ? detectCarrier(data.trackingNumber)
          : data.carrier;

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const patientForPost = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true, firstName: true, lastName: true },
      });
      if (ensureTenantResource(patientForPost, clinicId ?? undefined)) return tenantNotFoundResponse();
      if (!patientForPost) return tenantNotFoundResponse();

      // Prisma requires clinic context for PatientShippingUpdate (clinic-isolated model).
      // For super_admin, clinicId is undefined—use patient's clinic so the create succeeds.
      const effectiveClinicId = patientForPost.clinicId ?? clinicId ?? undefined;
      if (!effectiveClinicId) {
        return NextResponse.json(
          { error: 'Patient must be assigned to a clinic to add tracking' },
          { status: 400 }
        );
      }

      // Resolve order IDs: prefer orderIds array, fall back to single orderId for backward compat
      const resolvedOrderIds: number[] =
        data.orderIds && data.orderIds.length > 0
          ? data.orderIds
          : data.orderId
            ? [data.orderId]
            : [];

      const result = await runWithClinicContext(effectiveClinicId, async () => {
        const patient = patientForPost;

        // Generate tracking URL if not provided
        const trackingUrl =
          data.trackingUrl || generateTrackingUrl(effectiveCarrier, data.trackingNumber);

        // If multiple orders are selected, look up per-order medication info
        let orderMedications: Map<number, { medName: string; strength: string; quantity: string }> =
          new Map();
        if (resolvedOrderIds.length > 1) {
          const ordersWithRxs = await prisma.order.findMany({
            where: { id: { in: resolvedOrderIds }, patientId: patient.id },
            select: {
              id: true,
              primaryMedName: true,
              primaryMedStrength: true,
              rxs: {
                select: { medName: true, strength: true, quantity: true },
                take: 1,
              },
            },
          });
          for (const order of ordersWithRxs) {
            const rx = order.rxs[0];
            orderMedications.set(order.id, {
              medName: rx?.medName || order.primaryMedName || data.medicationName || '',
              strength: rx?.strength || order.primaryMedStrength || data.medicationStrength || '',
              quantity: rx?.quantity || data.medicationQuantity || '1',
            });
          }
        }

        // Create shipping update records — one per order (or one if no order)
        const shippingUpdates = await prisma.$transaction(
          async (tx) => {
            const idsToCreate = resolvedOrderIds.length > 0 ? resolvedOrderIds : [null];
            const created = [];

            for (const orderId of idsToCreate) {
              // Per-order medication info when linking to multiple orders
              const medInfo =
                orderId && orderMedications.has(orderId)
                  ? orderMedications.get(orderId)!
                  : {
                      medName: data.medicationName || '',
                      strength: data.medicationStrength || '',
                      quantity: data.medicationQuantity || '1',
                    };

              const record = await tx.patientShippingUpdate.create({
                data: {
                  clinicId: effectiveClinicId,
                  patientId: patient.id,
                  orderId: orderId,
                  trackingNumber: data.trackingNumber,
                  carrier: effectiveCarrier,
                  trackingUrl,
                  status: data.status as ShippingStatus,
                  statusNote: data.notes,
                  shippedAt: data.shippedAt ? new Date(data.shippedAt) : new Date(),
                  estimatedDelivery: data.estimatedDelivery
                    ? new Date(data.estimatedDelivery)
                    : null,
                  medicationName: medInfo.medName || undefined,
                  medicationStrength: medInfo.strength || undefined,
                  medicationQuantity: medInfo.quantity || undefined,
                  source: 'manual',
                  rawPayload: {
                    addedBy: user.id,
                    addedByEmail: user.email,
                    isRefill: data.isRefill,
                    refillNumber: data.refillNumber,
                    notes: data.notes,
                    linkedOrderIds: resolvedOrderIds,
                  } as any,
                  processedAt: new Date(),
                },
              });
              created.push(record);
            }

            return created;
          },
          { timeout: 15000 }
        );

        return { patient, shippingUpdates, trackingUrl };
      });

      if (!result) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      const { patient, shippingUpdates, trackingUrl } = result;

      logger.info(`[TRACKING] Manual entry added for patient ${patientId} by user ${user.id}`, {
        trackingNumber: data.trackingNumber,
        carrier: effectiveCarrier,
        isRefill: data.isRefill,
        linkedOrders: resolvedOrderIds.length,
      });

      return NextResponse.json({
        success: true,
        message:
          shippingUpdates.length > 1
            ? `Tracking entry linked to ${shippingUpdates.length} prescriptions`
            : 'Tracking entry added successfully',
        tracking: shippingUpdates.map((su) => ({
          id: su.id,
          trackingNumber: su.trackingNumber,
          carrier: su.carrier,
          trackingUrl,
          status: su.status,
          medicationName: su.medicationName,
          orderId: su.orderId,
          isRefill: data.isRefill,
          refillNumber: data.refillNumber,
        })),
        patient: {
          id: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
        },
      });
    } catch (error) {
      logger.error('Error adding tracking entry:', error);
      return NextResponse.json({ error: 'Failed to add tracking entry' }, { status: 500 });
    }
  }
);

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

  return 'Unknown';
}

// Helper to map order status to shipping status
function mapOrderStatusToShipping(status: string | null): string {
  if (!status) return 'SHIPPED';

  const statusMap: Record<string, string> = {
    shipped: 'SHIPPED',
    in_transit: 'IN_TRANSIT',
    out_for_delivery: 'OUT_FOR_DELIVERY',
    delivered: 'DELIVERED',
    returned: 'RETURNED',
    cancelled: 'CANCELLED',
  };

  return statusMap[status.toLowerCase()] || 'SHIPPED';
}
