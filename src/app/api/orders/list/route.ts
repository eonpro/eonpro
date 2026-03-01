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
import { decryptPHI } from '@/lib/security/phi-encryption';

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

    // Sales reps see only assigned patients; they must not access the full orders list
    if (user.role === 'sales_rep') {
      return NextResponse.json(
        { error: 'Access denied. Orders are not available for sales rep accounts.' },
        { status: 403 }
      );
    }

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
    const awaitingFulfillment = searchParams.get('awaitingFulfillment');
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const rawPageSize = parseInt(searchParams.get('pageSize') || '20', 10) || 20;
    const pageSize = Math.min(100, Math.max(1, rawPageSize));

    // Use order service for proper access control
    const result = await orderService.listOrders(userContext, {
      limit: hasTrackingNumber === 'true' ? 1000 : pageSize,
      offset: hasTrackingNumber === 'true' ? 0 : (page - 1) * pageSize,
      hasTrackingNumber:
        hasTrackingNumber === 'true' ? true : hasTrackingNumber === 'false' ? false : undefined,
      awaitingFulfillment: awaitingFulfillment === 'true' ? true : undefined,
      search,
    });

    // Fetch events and SMS status for each order (for backward compatibility)
    const ordersWithEvents = await Promise.all(
      result.orders.map(async (order) => {
        const events = await orderRepository.getEventsByOrderId(order.id, 5);

        let smsStatus: string | null = null;
        if (order.trackingNumber && order.patientId) {
          const sms = await prisma.smsLog.findFirst({
            where: {
              patientId: order.patientId,
              templateType: 'SHIPPING_TRACKING',
              body: { contains: order.trackingNumber },
            },
            orderBy: { createdAt: 'desc' },
            select: { status: true },
          });
          smsStatus = sms?.status || null;
        }

        return {
          ...order,
          events,
          smsStatus,
        };
      })
    );

    // Awaiting fulfillment path: return orders with aging stats
    if (awaitingFulfillment === 'true') {
      const now = Date.now();
      const agingDays = result.orders.map((o) =>
        Math.floor((now - new Date(o.createdAt).getTime()) / 86400000)
      );

      const stats = {
        totalAwaiting: result.total,
        avgWaitDays: agingDays.length
          ? Math.round(agingDays.reduce((a, b) => a + b, 0) / agingDays.length)
          : 0,
        maxWaitDays: agingDays.length ? Math.max(...agingDays) : 0,
      };

      return Response.json({
        orders: result.orders,
        total: result.total,
        page,
        pageSize,
        hasMore: result.hasMore,
        stats,
      });
    }

    // If requesting orders with tracking numbers, also fetch from PatientShippingUpdate
    // This catches shipments that weren't linked to an Order record
    if (hasTrackingNumber === 'true') {
      // Build clinic filter
      const clinicFilter =
        userContext.role === 'super_admin' ? {} : { clinicId: userContext.clinicId };

      // Get all existing order IDs with tracking from our results
      const existingOrderIds = new Set(
        ordersWithEvents.filter((o) => o.trackingNumber).map((o) => o.id)
      );

      // Fetch shipments from PatientShippingUpdate that aren't already in orders
      const patientShipments = await prisma.patientShippingUpdate.findMany({
        where: {
          ...(userContext.role === 'super_admin' ? {} : { clinicId: userContext.clinicId }),
          // Exclude shipments already linked to orders we have
          OR: [{ orderId: null }, { orderId: { notIn: Array.from(existingOrderIds) } }],
        } as any,
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
        take: 1000,
      });

      // Convert PatientShippingUpdate records to order-like format
      const shippingOnlyRecords = await Promise.all(
        patientShipments
          .filter((s: any) => !existingOrderIds.has(s.orderId || -1))
          .map(async (shipment: any) => {
            let smsStatus: string | null = null;
            if (shipment.trackingNumber && shipment.patientId) {
              const sms = await prisma.smsLog.findFirst({
                where: {
                  patientId: shipment.patientId,
                  templateType: 'SHIPPING_TRACKING',
                  body: { contains: shipment.trackingNumber },
                },
                orderBy: { createdAt: 'desc' },
                select: { status: true },
              });
              smsStatus = sms?.status || null;
            }

            return {
              id: shipment.orderId || -shipment.id,
              _isShipmentOnly: true,
              _shipmentId: shipment.id,
              createdAt: shipment.createdAt,
              updatedAt: shipment.updatedAt,
              clinicId: shipment.clinicId,
              patient: {
                id: shipment.patient?.id,
                firstName: decryptPHI(shipment.patient?.firstName) || 'Unknown',
                lastName: decryptPHI(shipment.patient?.lastName) || '',
              },
              patientId: shipment.patientId,
              primaryMedName: shipment.medicationName || shipment.order?.primaryMedName || null,
              primaryMedStrength:
                shipment.medicationStrength || shipment.order?.primaryMedStrength || null,
              status: shipment.status,
              shippingStatus: shipment.status,
              trackingNumber: shipment.trackingNumber,
              trackingUrl: shipment.trackingUrl,
              lifefileOrderId: shipment.lifefileOrderId,
              events: [],
              smsStatus,
            };
          })
      );

      // Merge and sort by most recent activity (tracking date or creation date)
      const allOrders = [...ordersWithEvents, ...shippingOnlyRecords].sort((a, b) => {
        const dateA = (a as any).lastWebhookAt || a.updatedAt || a.createdAt;
        const dateB = (b as any).lastWebhookAt || b.updatedAt || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const total = allOrders.length;
      const start = (page - 1) * pageSize;
      const paginatedOrders = allOrders.slice(start, start + pageSize);

      return Response.json({
        orders: paginatedOrders,
        total,
        page,
        pageSize,
        hasMore: start + paginatedOrders.length < total,
      });
    }

    return Response.json({
      orders: ordersWithEvents,
      total: result.total,
      page,
      pageSize,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/orders/list' },
    });
  }
}
