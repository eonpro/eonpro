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

    const trackedMergeWindow = hasTrackingNumber === 'true' ? Math.max(page * pageSize, pageSize) : pageSize;

    // Use order service for proper access control
    const result = await orderService.listOrders(userContext, {
      limit: trackedMergeWindow,
      offset: hasTrackingNumber === 'true' ? 0 : (page - 1) * pageSize,
      hasTrackingNumber:
        hasTrackingNumber === 'true' ? true : hasTrackingNumber === 'false' ? false : undefined,
      awaitingFulfillment: awaitingFulfillment === 'true' ? true : undefined,
      search,
    });

    const orderIds = result.orders.map((o) => o.id);
    const trackingOrders = result.orders.filter((o) => o.trackingNumber && o.patientId);

    // Awaiting fulfillment path: minimal queries needed
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

    // Build the shipment where clause once (used for both findMany and count)
    const shipmentWhere = hasTrackingNumber === 'true'
      ? {
          where: {
            ...(userContext.role === 'super_admin' ? {} : { clinicId: userContext.clinicId }),
            OR: [{ orderId: null }, { order: { trackingNumber: null } }, { order: { is: null } }],
          } as any,
        }
      : null;

    // Parallelize ALL independent queries in a single Promise.all to minimize
    // connection hold time and reduce P2024 (pool exhaustion) risk on serverless.
    const [allEvents, orderSmsLogs, patientShipments, shipmentOnlyTotal] = await Promise.all([
      // 1. Events for all orders
      orderIds.length > 0
        ? prisma.orderEvent.findMany({
            where: { orderId: { in: orderIds } },
            orderBy: { createdAt: 'desc' },
            take: 500,
          })
        : Promise.resolve([]),

      // 2. SMS status for tracked orders
      trackingOrders.length > 0
        ? prisma.smsLog.findMany({
            where: {
              patientId: { in: trackingOrders.map((o) => o.patientId) },
              templateType: 'SHIPPING_TRACKING',
            },
            orderBy: { createdAt: 'desc' },
            select: { patientId: true, status: true, body: true },
            take: 500,
          })
        : Promise.resolve([]),

      // 3. Shipment-only records (when hasTrackingNumber=true)
      shipmentWhere
        ? prisma.patientShippingUpdate.findMany({
            ...shipmentWhere,
            include: {
              patient: { select: { id: true, firstName: true, lastName: true } },
              order: { select: { id: true, primaryMedName: true, primaryMedStrength: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: trackedMergeWindow,
          })
        : Promise.resolve([]),

      // 4. Total shipment-only count (when hasTrackingNumber=true)
      shipmentWhere
        ? prisma.patientShippingUpdate.count(shipmentWhere as any)
        : Promise.resolve(0),
    ]);

    // Build events map
    const eventsByOrderId = new Map<number, typeof allEvents>();
    for (const event of allEvents) {
      const list = eventsByOrderId.get(event.orderId) || [];
      if (list.length < 5) list.push(event);
      eventsByOrderId.set(event.orderId, list);
    }

    // Build SMS status map for orders
    const smsStatusMap = new Map<number, string | null>();
    for (const order of trackingOrders) {
      const match = orderSmsLogs.find(
        (sms) =>
          sms.patientId === order.patientId &&
          order.trackingNumber &&
          sms.body?.includes(order.trackingNumber)
      );
      smsStatusMap.set(order.id, match?.status || null);
    }

    const ordersWithEvents = result.orders.map((order) => ({
      ...order,
      events: eventsByOrderId.get(order.id) || [],
      smsStatus: smsStatusMap.get(order.id) || null,
    }));

    if (hasTrackingNumber === 'true') {
      // Fetch SMS status for shipments (depends on patientShipments result)
      const shipmentPatientIds = [
        ...new Set(
          patientShipments
            .filter((s: any) => s.patientId && s.trackingNumber)
            .map((s: any) => s.patientId as number)
        ),
      ];

      const shipmentSmsLogs =
        shipmentPatientIds.length > 0
          ? await prisma.smsLog.findMany({
              where: {
                patientId: { in: shipmentPatientIds },
                templateType: 'SHIPPING_TRACKING',
              },
              orderBy: { createdAt: 'desc' },
              select: { patientId: true, status: true, body: true },
              take: 500,
            })
          : [];

      const shippingOnlyRecords = patientShipments.map((shipment: any) => {
        let smsStatus: string | null = null;
        if (shipment.trackingNumber && shipment.patientId) {
          const match = shipmentSmsLogs.find(
            (sms) =>
              sms.patientId === shipment.patientId &&
              sms.body?.includes(shipment.trackingNumber)
          );
          smsStatus = match?.status || null;
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
      });

      const allOrders = [...ordersWithEvents, ...shippingOnlyRecords].sort((a, b) => {
        const dateA = (a as any).lastWebhookAt || a.updatedAt || a.createdAt;
        const dateB = (b as any).lastWebhookAt || b.updatedAt || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const total = result.total + shipmentOnlyTotal;
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
