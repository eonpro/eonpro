/**
 * Sales Rep Payroll Report API
 *
 * GET  — Returns per-event commission detail aggregated by rep for payroll.
 * POST — Same data exported as CSV (triggers download).
 *
 * Designed for payroll accuracy: includes every commission event with full
 * breakdown (base, volume tier, product, multi-item), status, plan name,
 * and whether it was manual or Stripe-generated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { serverError } from '@/lib/api/error-response';
import { superAdminRateLimit } from '@/lib/rateLimit';

function parseDates(req: NextRequest): { startDate: Date; endDate: Date } {
  const p = req.nextUrl.searchParams;
  const s = p.get('startDate');
  const e = p.get('endDate');

  if (!s || !e) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start, endDate: now };
  }

  const startDate = new Date(s);
  const endDate = new Date(e);
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
}

async function handler(req: NextRequest): Promise<Response> {
  const p = req.nextUrl.searchParams;
  const clinicIdParam = p.get('clinicId');
  const salesRepIdParam = p.get('salesRepId');
  const statusFilter = p.get('status');
  const format = p.get('format');

  const { startDate, endDate } = parseDates(req);

  logger.security('[SalesReps] Payroll report accessed', {
    action: 'SALES_REP_PAYROLL_REPORT',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    clinicFilter: clinicIdParam || 'all',
    salesRepFilter: salesRepIdParam || 'all',
  });

  try {
    return await withoutClinicFilter(async () => {
      const where: Record<string, any> = {
        occurredAt: { gte: startDate, lte: endDate },
      };

      if (clinicIdParam) where.clinicId = parseInt(clinicIdParam, 10);
      if (salesRepIdParam) where.salesRepId = parseInt(salesRepIdParam, 10);
      if (statusFilter) {
        where.status = statusFilter;
      } else {
        where.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
      }

      const events = await prisma.salesRepCommissionEvent.findMany({
        where,
        orderBy: [{ salesRepId: 'asc' }, { occurredAt: 'asc' }],
        include: {
          salesRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          clinic: { select: { id: true, name: true } },
        },
      });

      type EventRow = (typeof events)[number];

      const repSummaries = new Map<number, {
        name: string;
        email: string;
        clinicName: string;
        totalEvents: number;
        totalRevenueCents: number;
        totalCommissionCents: number;
        totalBaseCents: number;
        totalVolumeTierCents: number;
        totalProductCents: number;
        totalMultiItemCents: number;
        manualCount: number;
        stripeCount: number;
      }>();

      for (const ev of events) {
        const repId = ev.salesRepId;
        if (!repSummaries.has(repId)) {
          repSummaries.set(repId, {
            name: `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() || ev.salesRep?.email || `Rep #${repId}`,
            email: ev.salesRep?.email || '',
            clinicName: ev.clinic?.name || '',
            totalEvents: 0,
            totalRevenueCents: 0,
            totalCommissionCents: 0,
            totalBaseCents: 0,
            totalVolumeTierCents: 0,
            totalProductCents: 0,
            totalMultiItemCents: 0,
            manualCount: 0,
            stripeCount: 0,
          });
        }
        const s = repSummaries.get(repId)!;
        s.totalEvents++;
        s.totalRevenueCents += ev.eventAmountCents;
        s.totalCommissionCents += ev.commissionAmountCents;
        s.totalBaseCents += ev.baseCommissionCents;
        s.totalVolumeTierCents += ev.volumeTierBonusCents;
        s.totalProductCents += ev.productBonusCents;
        s.totalMultiItemCents += ev.multiItemBonusCents;
        if (ev.isManual) s.manualCount++;
        else s.stripeCount++;
      }

      const grandTotal = {
        events: events.length,
        revenueCents: events.reduce((a, e) => a + e.eventAmountCents, 0),
        commissionCents: events.reduce((a, e) => a + e.commissionAmountCents, 0),
      };

      if (format === 'csv') {
        const fmtD = (d: Date) => d.toISOString().slice(0, 10);
        let csv = `Sales Rep Payroll Report\n`;
        csv += `Period: ${fmtD(startDate)} to ${fmtD(endDate)}\n`;
        csv += `Generated: ${new Date().toLocaleString()}\n\n`;

        csv += `=== PER-REP SUMMARY ===\n`;
        csv += `Sales Rep,Email,Clinic,Events,Revenue,Base Commission,Volume Tier Bonus,Product Bonus,Multi-Item Bonus,Total Commission,Manual,Stripe\n`;
        for (const [, s] of repSummaries) {
          csv += `"${s.name}","${s.email}","${s.clinicName}",${s.totalEvents},${(s.totalRevenueCents / 100).toFixed(2)},${(s.totalBaseCents / 100).toFixed(2)},${(s.totalVolumeTierCents / 100).toFixed(2)},${(s.totalProductCents / 100).toFixed(2)},${(s.totalMultiItemCents / 100).toFixed(2)},${(s.totalCommissionCents / 100).toFixed(2)},${s.manualCount},${s.stripeCount}\n`;
        }

        csv += `\nGrand Total,,,"${grandTotal.events}","${(grandTotal.revenueCents / 100).toFixed(2)}",,,,"${(grandTotal.commissionCents / 100).toFixed(2)}"\n`;

        csv += `\n=== EVENT DETAIL ===\n`;
        csv += `Date,Sales Rep,Email,Clinic,Status,Source,Stripe Event,Revenue,Base,Volume Tier,Product,Multi-Item,Total Commission,Plan,Notes\n`;
        for (const ev of events) {
          const repName = `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() || ev.salesRep?.email || '';
          const meta = (ev.metadata as Record<string, any>) || {};
          csv += `${ev.occurredAt.toISOString().slice(0, 10)},"${repName}","${ev.salesRep?.email || ''}","${ev.clinic?.name || ''}",${ev.status},${ev.isManual ? 'Manual' : 'Stripe'},${ev.stripeEventId || ''},${(ev.eventAmountCents / 100).toFixed(2)},${(ev.baseCommissionCents / 100).toFixed(2)},${(ev.volumeTierBonusCents / 100).toFixed(2)},${(ev.productBonusCents / 100).toFixed(2)},${(ev.multiItemBonusCents / 100).toFixed(2)},${(ev.commissionAmountCents / 100).toFixed(2)},"${meta.planName || ''}","${(ev.notes || '').replace(/"/g, '""')}"\n`;
        }

        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="sales-rep-payroll-${fmtD(startDate)}-to-${fmtD(endDate)}.csv"`,
          },
        });
      }

      return NextResponse.json({
        dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        grandTotal,
        repSummaries: Array.from(repSummaries.entries()).map(([repId, s]) => ({
          salesRepId: repId,
          ...s,
        })),
        events: events.map((ev: EventRow) => ({
          id: ev.id,
          occurredAt: ev.occurredAt,
          salesRepId: ev.salesRepId,
          salesRepName: `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim(),
          salesRepEmail: ev.salesRep?.email,
          clinicName: ev.clinic?.name,
          status: ev.status,
          isManual: ev.isManual,
          stripeEventId: ev.stripeEventId,
          eventAmountCents: ev.eventAmountCents,
          commissionAmountCents: ev.commissionAmountCents,
          baseCommissionCents: ev.baseCommissionCents,
          volumeTierBonusCents: ev.volumeTierBonusCents,
          productBonusCents: ev.productBonusCents,
          multiItemBonusCents: ev.multiItemBonusCents,
          planName: (ev.metadata as any)?.planName || null,
          notes: ev.notes,
        })),
      });
    });
  } catch (error) {
    logger.error('[SalesReps] Payroll report failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to generate payroll report');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handler));
