import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { z } from 'zod';
import { ShippingStatus } from '@prisma/client';

const TABS = [
  'label_created',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'issues',
] as const;

type Tab = (typeof TABS)[number];

const TAB_STATUS_MAP: Record<Tab, ShippingStatus[]> = {
  label_created: [ShippingStatus.PENDING, ShippingStatus.LABEL_CREATED],
  shipped: [ShippingStatus.SHIPPED],
  in_transit: [ShippingStatus.IN_TRANSIT],
  out_for_delivery: [ShippingStatus.OUT_FOR_DELIVERY],
  delivered: [ShippingStatus.DELIVERED],
  issues: [ShippingStatus.RETURNED, ShippingStatus.EXCEPTION, ShippingStatus.CANCELLED],
};

const querySchema = z.object({
  tab: z.enum(TABS).default('in_transit'),
  search: z.string().optional(),
  clinicId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

async function handleGet(req: NextRequest, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { tab, search, clinicId, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const statusFilter = TAB_STATUS_MAP[tab];

    const where: any = {
      status: { in: statusFilter },
    };

    if (clinicId) {
      where.clinicId = clinicId;
    }

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { trackingNumber: { contains: term, mode: 'insensitive' } },
        { lifefileOrderId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const clinicFilter = clinicId ? { clinicId } : {};

    const [shipments, total, ...countResults] = await Promise.all([
      basePrisma.patientShippingUpdate.findMany({
        where,
        orderBy: tab === 'issues'
          ? { updatedAt: 'desc' }
          : tab === 'delivered'
            ? { actualDelivery: 'desc' }
            : { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          trackingNumber: true,
          carrier: true,
          status: true,
          statusNote: true,
          lifefileOrderId: true,
          shippedAt: true,
          estimatedDelivery: true,
          actualDelivery: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          clinicId: true,
          patientId: true,
          orderId: true,
          medicationName: true,
          medicationStrength: true,
          rawPayload: true,
          clinic: { select: { id: true, name: true } },
          order: { select: { id: true, lifefileOrderId: true } },
        },
      }),
      basePrisma.patientShippingUpdate.count({ where }),
      ...TABS.map((t) =>
        basePrisma.patientShippingUpdate.count({
          where: { status: { in: TAB_STATUS_MAP[t] }, ...clinicFilter },
        })
      ),
    ]);

    const counts: Record<Tab, number> = {} as any;
    TABS.forEach((t, i) => {
      counts[t] = countResults[i] as number;
    });

    return NextResponse.json({
      success: true,
      tab,
      shipments: shipments.map((s: any) => ({
        id: s.id,
        trackingNumber: s.trackingNumber,
        carrier: s.carrier,
        status: s.status,
        statusNote: s.statusNote,
        lifefileOrderId: s.lifefileOrderId || s.order?.lifefileOrderId || null,
        shippedAt: s.shippedAt,
        estimatedDelivery: s.estimatedDelivery,
        actualDelivery: s.actualDelivery,
        source: s.source,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        clinicName: s.clinic?.name || null,
        clinicId: s.clinicId,
        patientId: s.patientId,
        orderId: s.orderId,
        medicationName: s.medicationName,
        medicationStrength: s.medicationStrength,
        signedBy: (s.rawPayload as any)?.signedBy || null,
        deliveryPhotoUrl: (s.rawPayload as any)?.photoUrl || null,
        deliveryDetails: (s.rawPayload as any)?.fedexDeliveryDetails || null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/super-admin/shipment-monitor' });
  }
}

export const GET = withSuperAdminAuth(handleGet);
