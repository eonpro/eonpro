import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { ShippingStatus } from '@prisma/client';

const querySchema = z.object({
  tab: z.enum(['in_transit', 'delivered', 'issues']).default('in_transit'),
  search: z.string().optional(),
  clinicId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const IN_TRANSIT_STATUSES: ShippingStatus[] = [
  ShippingStatus.PENDING,
  ShippingStatus.LABEL_CREATED,
  ShippingStatus.SHIPPED,
  ShippingStatus.IN_TRANSIT,
  ShippingStatus.OUT_FOR_DELIVERY,
];
const DELIVERED_STATUSES: ShippingStatus[] = [ShippingStatus.DELIVERED];
const ISSUE_STATUSES: ShippingStatus[] = [
  ShippingStatus.RETURNED,
  ShippingStatus.EXCEPTION,
  ShippingStatus.CANCELLED,
];

async function handleGet(req: NextRequest, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { tab, search, clinicId, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    let statusFilter: ShippingStatus[];
    switch (tab) {
      case 'delivered':
        statusFilter = DELIVERED_STATUSES;
        break;
      case 'issues':
        statusFilter = ISSUE_STATUSES;
        break;
      default:
        statusFilter = IN_TRANSIT_STATUSES;
    }

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

    const [shipments, total, tabCounts] = await Promise.all([
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
          clinic: { select: { id: true, name: true } },
          order: { select: { id: true, lifefileOrderId: true } },
        },
      }),
      basePrisma.patientShippingUpdate.count({ where }),
      Promise.all([
        basePrisma.patientShippingUpdate.count({
          where: { status: { in: IN_TRANSIT_STATUSES }, ...(clinicId ? { clinicId } : {}) },
        }),
        basePrisma.patientShippingUpdate.count({
          where: { status: { in: DELIVERED_STATUSES }, ...(clinicId ? { clinicId } : {}) },
        }),
        basePrisma.patientShippingUpdate.count({
          where: { status: { in: ISSUE_STATUSES }, ...(clinicId ? { clinicId } : {}) },
        }),
      ]),
    ]);

    const [inTransitCount, deliveredCount, issuesCount] = tabCounts;

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
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts: {
        inTransit: inTransitCount,
        delivered: deliveredCount,
        issues: issuesCount,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/super-admin/shipment-monitor' });
  }
}

export const GET = withSuperAdminAuth(handleGet);
