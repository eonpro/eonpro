/**
 * Orders List Route (Legacy)
 * ==========================
 *
 * Legacy endpoint for listing orders with events.
 * Now uses order service for proper clinic isolation.
 * Also includes shipments from PatientShippingUpdate table.
 *
 * @module api/orders/list
 * @deprecated Use GET /api/orders instead
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { orderService, orderRepository, type UserContext } from '@/domains/order';
import { handleApiError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/list
 * List recent orders with events
 *
 * Note: This endpoint now requires authentication for security.
 * Super admin sees all orders, others see clinic orders only.
 *
 * When hasTrackingNumber=true, also includes shipments from PatientShippingUpdate
 * that may not have an associated Order record.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication (security fix - was previously unauthenticated!)
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;

    // Convert auth user to service UserContext
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role as UserContext['role'],
      clinicId: user.clinicId,
      patientId: user.patientId,
      providerId: user.providerId,
    };

    // Parse query params
    const { searchParams } = new URL(request.url);
    const hasTrackingNumber = searchParams.get('hasTrackingNumber');

    // Use order service for proper access control
    const result = await orderService.listOrders(userContext, {
      limit: 100,
      hasTrackingNumber: hasTrackingNumber === 'true' ? true : hasTrackingNumber === 'false' ? false : undefined,
    });

    // Fetch events for each order (for backward compatibility)
    const ordersWithEvents = await Promise.all(
      result.orders.map(async (order) => {
        const events = await orderRepository.getEventsByOrderId(order.id, 5);
        return {
          ...order,
          events,
        };
      })
    );

    // If requesting orders with tracking numbers, also fetch from PatientShippingUpdate
    // This catches shipments that weren't linked to an Order record
    if (hasTrackingNumber === 'true') {
      // Build clinic filter
      const clinicFilter = userContext.role === 'super_admin'
        ? {}
        : { clinicId: userContext.clinicId };

      // Get all existing order IDs with tracking from our results
      const existingOrderIds = new Set(
        ordersWithEvents
          .filter(o => o.trackingNumber)
          .map(o => o.id)
      );

      // Fetch shipments from PatientShippingUpdate that aren't already in orders
      const patientShipments = await prisma.patientShippingUpdate.findMany({
        where: {
          ...clinicFilter,
          // Exclude shipments already linked to orders we have
          OR: [
            { orderId: null },
            { orderId: { notIn: Array.from(existingOrderIds) } },
          ],
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          order: {
            select: {
              id: true,
              primaryMedName: true,
              primaryMedStrength: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Convert PatientShippingUpdate records to order-like format
      const shippingOnlyRecords = patientShipments
        .filter((s: typeof patientShipments[number]) => !existingOrderIds.has(s.orderId || -1))
        .map((shipment: typeof patientShipments[number]) => ({
          // Use negative ID to distinguish from real orders (prefixed with 'ship-')
          id: shipment.orderId || -shipment.id,
          _isShipmentOnly: true, // Flag to identify these records
          _shipmentId: shipment.id,
          createdAt: shipment.createdAt,
          updatedAt: shipment.updatedAt,
          clinicId: shipment.clinicId,
          patient: shipment.patient,
          patientId: shipment.patientId,
          primaryMedName: shipment.medicationName || shipment.order?.primaryMedName || null,
          primaryMedStrength: shipment.medicationStrength || shipment.order?.primaryMedStrength || null,
          status: shipment.status,
          shippingStatus: shipment.status,
          trackingNumber: shipment.trackingNumber,
          trackingUrl: shipment.trackingUrl,
          lifefileOrderId: shipment.lifefileOrderId,
          events: [],
        }));

      // Merge and sort by date
      const allOrders = [...ordersWithEvents, ...shippingOnlyRecords]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return Response.json({ orders: allOrders });
    }

    return Response.json({ orders: ordersWithEvents });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders/list' },
    });
  }
}
