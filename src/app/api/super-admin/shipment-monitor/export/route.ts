import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { z } from 'zod';
import { ShippingStatus } from '@prisma/client';

function safeDecrypt(val: string | null | undefined): string | null {
  if (!val) return null;
  try { return decryptPHI(val) || val; } catch { return val; }
}

const TABS = ['label_created', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'issues'] as const;
type Tab = (typeof TABS)[number];

const TAB_STATUS_MAP: Record<Tab, ShippingStatus[]> = {
  label_created: [ShippingStatus.PENDING, ShippingStatus.LABEL_CREATED],
  shipped: [ShippingStatus.SHIPPED],
  in_transit: [ShippingStatus.IN_TRANSIT],
  out_for_delivery: [ShippingStatus.OUT_FOR_DELIVERY],
  delivered: [ShippingStatus.DELIVERED],
  issues: [ShippingStatus.RETURNED, ShippingStatus.EXCEPTION, ShippingStatus.CANCELLED],
};

function parseDateRange(range: string | undefined): Date | undefined {
  if (!range) return undefined;
  const now = new Date();
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 86400000);
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '90d': return new Date(now.getTime() - 90 * 86400000);
    default: {
      const d = new Date(range);
      return isNaN(d.getTime()) ? undefined : d;
    }
  }
}

const querySchema = z.object({
  tab: z.enum(TABS).optional(),
  search: z.string().optional(),
  clinicId: z.coerce.number().int().positive().optional(),
  dateRange: z.string().optional(),
});

function formatCsvDate(d: Date | string | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function handleExport(req: NextRequest, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { tab, search, clinicId, dateRange } = parsed.data;
    const dateFrom = parseDateRange(dateRange);

    const where: any = {};
    if (tab) where.status = { in: TAB_STATUS_MAP[tab] };
    if (clinicId) where.clinicId = clinicId;
    if (dateFrom) where.createdAt = { gte: dateFrom };
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { trackingNumber: { contains: term, mode: 'insensitive' } },
        { lifefileOrderId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const records = await basePrisma.patientShippingUpdate.findMany({
      where,
      distinct: ['trackingNumber'],
      orderBy: { createdAt: 'desc' },
      take: 10000,
      select: {
        lifefileOrderId: true,
        trackingNumber: true,
        status: true,
        statusNote: true,
        carrier: true,
        shippedAt: true,
        estimatedDelivery: true,
        actualDelivery: true,
        source: true,
        createdAt: true,
        clinic: { select: { name: true } },
        patient: { select: { firstName: true, lastName: true } },
        order: { select: { lifefileOrderId: true } },
        rawPayload: true,
      },
    });

    const header = [
      'Lifefile ID', 'Tracking Number', 'Status', 'Status Note', 'Carrier',
      'Patient Name', 'Clinic', 'Shipped', 'Est. Delivery', 'Actual Delivery',
      'Signed By', 'Source', 'Created',
    ].join(',');

    const rows = records.map((r: any) => {
      const patientName = [safeDecrypt(r.patient?.firstName), safeDecrypt(r.patient?.lastName)].filter(Boolean).join(' ');
      return [
        escapeCsv(r.lifefileOrderId || r.order?.lifefileOrderId),
        escapeCsv(r.trackingNumber),
        escapeCsv(r.status),
        escapeCsv(r.statusNote),
        escapeCsv(r.carrier),
        escapeCsv(patientName),
        escapeCsv(r.clinic?.name),
        formatCsvDate(r.shippedAt),
        formatCsvDate(r.estimatedDelivery),
        formatCsvDate(r.actualDelivery),
        escapeCsv((r.rawPayload as any)?.signedBy),
        escapeCsv(r.source),
        formatCsvDate(r.createdAt),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const filename = `shipment-monitor-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/super-admin/shipment-monitor/export' });
  }
}

export const GET = withSuperAdminAuth(handleExport);
