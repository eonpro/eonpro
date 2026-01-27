/**
 * Patient Tracking API
 * 
 * GET /api/patients/[id]/tracking - Get all tracking entries
 * POST /api/patients/[id]/tracking - Add manual tracking entry (for refills, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
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
  status: z.enum(['PENDING', 'LABEL_CREATED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'EXCEPTION', 'CANCELLED']).optional().default('SHIPPED'),
  medicationName: z.string().optional(),
  medicationStrength: z.string().optional(),
  medicationQuantity: z.string().optional(),
  shippedAt: z.string().optional(), // ISO date string
  estimatedDelivery: z.string().optional(), // ISO date string
  notes: z.string().optional(),
  orderId: z.number().optional(), // Optional link to existing order
  isRefill: z.boolean().optional().default(false),
  refillNumber: z.number().optional(),
});

// Helper to generate tracking URL based on carrier
function generateTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const carrierUrls: Record<string, string> = {
    'ups': `https://www.ups.com/track?tracknum=${trackingNumber}`,
    'fedex': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    'usps': `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    'dhl': `https://www.dhl.com/us-en/home/tracking/tracking-global-forwarding.html?submit=1&tracking-id=${trackingNumber}`,
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
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) => {
  try {
    const resolvedParams = await context.params;
    const patientId = parseInt(resolvedParams.id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const result = await runWithClinicContext(clinicId, async () => {
      // Verify patient exists
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      });

      if (!patient) return null;

      // Get shipping updates
      const shippingUpdates = await prisma.patientShippingUpdate.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
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

      // Get last prescription date
      const lastOrder = await prisma.order.findFirst({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, primaryMedName: true },
      });

      return { patient, shippingUpdates, orders, lastOrder };
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    const { patient, shippingUpdates, orders, lastOrder } = result;

    // Merge and format tracking data
    const trackingEntries = [
      // From PatientShippingUpdate table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...shippingUpdates.map((update: any) => ({
        id: `shipping-${update.id}`,
        type: 'shipping_update',
        trackingNumber: update.trackingNumber,
        carrier: update.carrier,
        trackingUrl: update.trackingUrl || generateTrackingUrl(update.carrier, update.trackingNumber),
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
          return !shippingUpdates.some((su: any) => 
            su.trackingNumber === order.trackingNumber && 
            su.orderId === order.id
          );
        })
        .map((order: any) => ({
          id: `order-${order.id}`,
          type: 'order',
          trackingNumber: order.trackingNumber,
          carrier: detectCarrier(order.trackingNumber || ''),
          trackingUrl: order.trackingUrl || generateTrackingUrl(
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

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
      },
      lastPrescriptionDate: lastOrder?.createdAt || null,
      lastMedication: lastOrder?.primaryMedName || null,
      totalTrackingEntries: trackingEntries.length,
      trackingEntries,
    });
  } catch (error) {
    logger.error('Error fetching patient tracking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracking data' },
      { status: 500 }
    );
  }
});

// POST - Add manual tracking entry
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) => {
  try {
    const resolvedParams = await context.params;
    const patientId = parseInt(resolvedParams.id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }

    // Only providers and admins can add tracking
    if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
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
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const result = await runWithClinicContext(clinicId, async () => {
      // Verify patient exists and get their clinic
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true, firstName: true, lastName: true },
      });

      if (!patient) return null;

      // Generate tracking URL if not provided
      const trackingUrl = data.trackingUrl || generateTrackingUrl(data.carrier, data.trackingNumber);

      // Create shipping update record
      const shippingUpdate = await prisma.patientShippingUpdate.create({
        data: {
          clinicId: patient.clinicId,
          patientId: patient.id,
          orderId: data.orderId || null,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          trackingUrl,
          status: data.status as ShippingStatus,
          statusNote: data.notes,
          shippedAt: data.shippedAt ? new Date(data.shippedAt) : new Date(),
          estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : null,
          medicationName: data.medicationName,
          medicationStrength: data.medicationStrength,
          medicationQuantity: data.medicationQuantity,
          source: 'manual',
          rawPayload: {
            addedBy: user.id,
            addedByEmail: user.email,
            isRefill: data.isRefill,
            refillNumber: data.refillNumber,
            notes: data.notes,
          } as any,
          processedAt: new Date(),
        },
      });

      return { patient, shippingUpdate, trackingUrl };
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    const { patient, shippingUpdate, trackingUrl } = result;

    logger.info(`[TRACKING] Manual entry added for patient ${patientId} by user ${user.id}`, {
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      isRefill: data.isRefill,
    });

    return NextResponse.json({
      success: true,
      message: 'Tracking entry added successfully',
      tracking: {
        id: shippingUpdate.id,
        trackingNumber: shippingUpdate.trackingNumber,
        carrier: shippingUpdate.carrier,
        trackingUrl,
        status: shippingUpdate.status,
        medicationName: shippingUpdate.medicationName,
        isRefill: data.isRefill,
        refillNumber: data.refillNumber,
      },
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
      },
    });
  } catch (error) {
    logger.error('Error adding tracking entry:', error);
    return NextResponse.json(
      { error: 'Failed to add tracking entry' },
      { status: 500 }
    );
  }
});

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
    'shipped': 'SHIPPED',
    'in_transit': 'IN_TRANSIT',
    'out_for_delivery': 'OUT_FOR_DELIVERY',
    'delivered': 'DELIVERED',
    'returned': 'RETURNED',
    'cancelled': 'CANCELLED',
  };
  
  return statusMap[status.toLowerCase()] || 'SHIPPED';
}
