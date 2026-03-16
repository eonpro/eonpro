/**
 * Sales Rep Payroll Report API
 *
 * GET   — Comprehensive payroll data: per-rep summaries, event detail, status breakdown,
 *          new-vs-recurring split, override commissions. Supports JSON and CSV export.
 * PATCH — Batch mark commission events as PAID (for payroll processing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { serverError } from '@/lib/api/error-response';
import { superAdminRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';

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

function fmtD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtUSD(cents: number) { return (cents / 100).toFixed(2); }

async function handleGet(req: NextRequest): Promise<Response> {
  const p = req.nextUrl.searchParams;
  const clinicIdParam = p.get('clinicId');
  const salesRepIdParam = p.get('salesRepId');
  const statusFilter = p.get('status');
  const typeFilter = p.get('type');
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
      if (statusFilter && statusFilter !== 'ALL') {
        where.status = statusFilter;
      } else if (!statusFilter) {
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

      // Per-rep summary with new/recurring breakdown and status counts
      const repSummaries = new Map<number, {
        name: string;
        email: string;
        clinicId: number;
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
        newSaleCount: number;
        newSaleCommissionCents: number;
        recurringCount: number;
        recurringCommissionCents: number;
        pendingCount: number;
        pendingCents: number;
        approvedCount: number;
        approvedCents: number;
        paidCount: number;
        paidCents: number;
        reversedCount: number;
        reversedCents: number;
        totalOverrideCommissionCents: number;
        totalOverrideEvents: number;
      }>();

      for (const ev of events) {
        const repId = ev.salesRepId;
        if (!repSummaries.has(repId)) {
          repSummaries.set(repId, {
            name: `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() || ev.salesRep?.email || `Rep #${repId}`,
            email: ev.salesRep?.email || '',
            clinicId: ev.clinicId,
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
            newSaleCount: 0,
            newSaleCommissionCents: 0,
            recurringCount: 0,
            recurringCommissionCents: 0,
            pendingCount: 0,
            pendingCents: 0,
            approvedCount: 0,
            approvedCents: 0,
            paidCount: 0,
            paidCents: 0,
            reversedCount: 0,
            reversedCents: 0,
            totalOverrideCommissionCents: 0,
            totalOverrideEvents: 0,
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

        if (ev.isRecurring) {
          s.recurringCount++;
          s.recurringCommissionCents += ev.commissionAmountCents;
        } else {
          s.newSaleCount++;
          s.newSaleCommissionCents += ev.commissionAmountCents;
        }

        if (ev.status === 'PENDING') { s.pendingCount++; s.pendingCents += ev.commissionAmountCents; }
        else if (ev.status === 'APPROVED') { s.approvedCount++; s.approvedCents += ev.commissionAmountCents; }
        else if (ev.status === 'PAID') { s.paidCount++; s.paidCents += ev.commissionAmountCents; }
        else if (ev.status === 'REVERSED') { s.reversedCount++; s.reversedCents += ev.commissionAmountCents; }
      }

      // Override events
      const overrideWhere: Record<string, any> = {
        occurredAt: { gte: startDate, lte: endDate },
      };
      if (clinicIdParam) overrideWhere.clinicId = parseInt(clinicIdParam, 10);
      if (salesRepIdParam) overrideWhere.overrideRepId = parseInt(salesRepIdParam, 10);
      if (statusFilter && statusFilter !== 'ALL') {
        overrideWhere.status = statusFilter;
      } else if (!statusFilter) {
        overrideWhere.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
      }

      const overrideEvents = await prisma.salesRepOverrideCommissionEvent.findMany({
        where: overrideWhere,
        orderBy: [{ overrideRepId: 'asc' }, { occurredAt: 'asc' }],
        include: {
          overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          clinic: { select: { id: true, name: true } },
        },
      });

      const overrideRepSummaries = new Map<number, {
        name: string;
        email: string;
        clinicName: string;
        totalOverrideEvents: number;
        totalOverrideRevenueCents: number;
        totalOverrideCommissionCents: number;
      }>();

      for (const ov of overrideEvents) {
        const repId = ov.overrideRepId;
        if (!overrideRepSummaries.has(repId)) {
          overrideRepSummaries.set(repId, {
            name: `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim() || ov.overrideRep?.email || `Rep #${repId}`,
            email: ov.overrideRep?.email || '',
            clinicName: ov.clinic?.name || '',
            totalOverrideEvents: 0,
            totalOverrideRevenueCents: 0,
            totalOverrideCommissionCents: 0,
          });
        }
        const os = overrideRepSummaries.get(repId)!;
        os.totalOverrideEvents++;
        os.totalOverrideRevenueCents += ov.eventAmountCents;
        os.totalOverrideCommissionCents += ov.commissionAmountCents;
      }

      for (const [repId, os] of overrideRepSummaries) {
        const existing = repSummaries.get(repId);
        if (existing) {
          existing.totalOverrideCommissionCents = os.totalOverrideCommissionCents;
          existing.totalOverrideEvents = os.totalOverrideEvents;
        }
      }

      const overrideGrandTotal = {
        events: overrideEvents.length,
        commissionCents: overrideEvents.reduce((a, e) => a + e.commissionAmountCents, 0),
      };

      const statusBreakdown = {
        pending: { count: events.filter((e) => e.status === 'PENDING').length, cents: events.filter((e) => e.status === 'PENDING').reduce((a, e) => a + e.commissionAmountCents, 0) },
        approved: { count: events.filter((e) => e.status === 'APPROVED').length, cents: events.filter((e) => e.status === 'APPROVED').reduce((a, e) => a + e.commissionAmountCents, 0) },
        paid: { count: events.filter((e) => e.status === 'PAID').length, cents: events.filter((e) => e.status === 'PAID').reduce((a, e) => a + e.commissionAmountCents, 0) },
        reversed: { count: events.filter((e) => e.status === 'REVERSED').length, cents: events.filter((e) => e.status === 'REVERSED').reduce((a, e) => a + e.commissionAmountCents, 0) },
      };

      const newVsRecurring = {
        newSale: { count: events.filter((e) => !e.isRecurring).length, cents: events.filter((e) => !e.isRecurring).reduce((a, e) => a + e.commissionAmountCents, 0) },
        recurring: { count: events.filter((e) => e.isRecurring).length, cents: events.filter((e) => e.isRecurring).reduce((a, e) => a + e.commissionAmountCents, 0) },
      };

      const grandTotal = {
        events: events.length,
        revenueCents: events.reduce((a, e) => a + e.eventAmountCents, 0),
        commissionCents: events.reduce((a, e) => a + e.commissionAmountCents, 0),
        overrideEvents: overrideGrandTotal.events,
        overrideCommissionCents: overrideGrandTotal.commissionCents,
        combinedCommissionCents: events.reduce((a, e) => a + e.commissionAmountCents, 0) + overrideGrandTotal.commissionCents,
        statusBreakdown,
        newVsRecurring,
      };

      // Filter by type if requested
      let filteredEvents = events;
      if (typeFilter === 'manual') filteredEvents = events.filter((e) => e.isManual);
      else if (typeFilter === 'stripe') filteredEvents = events.filter((e) => !e.isManual);
      else if (typeFilter === 'new') filteredEvents = events.filter((e) => !e.isRecurring);
      else if (typeFilter === 'recurring') filteredEvents = events.filter((e) => e.isRecurring);

      if (format === 'csv') {
        let csv = `Sales Rep Payroll Report\n`;
        csv += `Period: ${fmtD(startDate)} to ${fmtD(endDate)}\n`;
        csv += `Generated: ${new Date().toLocaleString()}\n\n`;

        csv += `=== PAYROLL SUMMARY ===\n`;
        csv += `Total Direct Commission,$${fmtUSD(grandTotal.commissionCents)}\n`;
        csv += `Total Override Commission,$${fmtUSD(overrideGrandTotal.commissionCents)}\n`;
        csv += `Combined Total,$${fmtUSD(grandTotal.combinedCommissionCents)}\n`;
        csv += `New Sale Commissions,${newVsRecurring.newSale.count},$${fmtUSD(newVsRecurring.newSale.cents)}\n`;
        csv += `Recurring Commissions,${newVsRecurring.recurring.count},$${fmtUSD(newVsRecurring.recurring.cents)}\n`;
        csv += `Pending,${statusBreakdown.pending.count},$${fmtUSD(statusBreakdown.pending.cents)}\n`;
        csv += `Approved (Ready to Pay),${statusBreakdown.approved.count},$${fmtUSD(statusBreakdown.approved.cents)}\n`;
        csv += `Paid,${statusBreakdown.paid.count},$${fmtUSD(statusBreakdown.paid.cents)}\n`;
        csv += `Reversed,${statusBreakdown.reversed.count},$${fmtUSD(statusBreakdown.reversed.cents)}\n\n`;

        csv += `=== PER-REP SUMMARY ===\n`;
        csv += `Sales Rep,Email,Clinic,Events,Revenue,Base Commission,Volume Tier,Product Bonus,Multi-Item,Total Commission,New Sales,New Sale $,Recurring,Recurring $,Override $,Combined Total,Manual,Stripe,Pending $,Approved $,Paid $\n`;
        for (const [, s] of repSummaries) {
          const combined = s.totalCommissionCents + s.totalOverrideCommissionCents;
          csv += `"${s.name}","${s.email}","${s.clinicName}",${s.totalEvents},$${fmtUSD(s.totalRevenueCents)},$${fmtUSD(s.totalBaseCents)},$${fmtUSD(s.totalVolumeTierCents)},$${fmtUSD(s.totalProductCents)},$${fmtUSD(s.totalMultiItemCents)},$${fmtUSD(s.totalCommissionCents)},${s.newSaleCount},$${fmtUSD(s.newSaleCommissionCents)},${s.recurringCount},$${fmtUSD(s.recurringCommissionCents)},$${fmtUSD(s.totalOverrideCommissionCents)},$${fmtUSD(combined)},${s.manualCount},${s.stripeCount},$${fmtUSD(s.pendingCents)},$${fmtUSD(s.approvedCents)},$${fmtUSD(s.paidCents)}\n`;
        }

        csv += `\n=== EVENT DETAIL ===\n`;
        csv += `Date,Sales Rep,Email,Clinic,Status,Type,Source,Revenue,Base,Volume Tier,Product,Multi-Item,Total Commission,Plan,Notes,Stripe Event\n`;
        for (const ev of filteredEvents) {
          const repName = `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() || ev.salesRep?.email || '';
          const meta = (ev.metadata as Record<string, any>) || {};
          const saleType = ev.isRecurring ? 'Recurring' : 'New Sale';
          const source = ev.isManual ? 'Manual' : 'Stripe';
          csv += `${ev.occurredAt.toISOString().slice(0, 10)},"${repName}","${ev.salesRep?.email || ''}","${ev.clinic?.name || ''}",${ev.status},${saleType},${source},$${fmtUSD(ev.eventAmountCents)},$${fmtUSD(ev.baseCommissionCents)},$${fmtUSD(ev.volumeTierBonusCents)},$${fmtUSD(ev.productBonusCents)},$${fmtUSD(ev.multiItemBonusCents)},$${fmtUSD(ev.commissionAmountCents)},"${meta.planName || ''}","${(ev.notes || '').replace(/"/g, '""')}",${ev.stripeEventId || ''}\n`;
        }

        if (overrideEvents.length > 0) {
          csv += `\n=== OVERRIDE COMMISSION DETAIL ===\n`;
          csv += `Date,Override Rep,Email,Clinic,Status,Subordinate Revenue,Override Rate,Override Commission,Stripe Event\n`;
          for (const ov of overrideEvents) {
            const repName = `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim() || ov.overrideRep?.email || '';
            csv += `${ov.occurredAt.toISOString().slice(0, 10)},"${repName}","${ov.overrideRep?.email || ''}","${ov.clinic?.name || ''}",${ov.status},$${fmtUSD(ov.eventAmountCents)},${(ov.overridePercentBps / 100).toFixed(2)}%,$${fmtUSD(ov.commissionAmountCents)},${ov.stripeEventId || ''}\n`;
          }

          csv += `\n=== COMBINED TOTALS ===\n`;
          csv += `Direct Commission,Override Commission,Combined Total\n`;
          csv += `$${fmtUSD(grandTotal.commissionCents)},$${fmtUSD(overrideGrandTotal.commissionCents)},$${fmtUSD(grandTotal.combinedCommissionCents)}\n`;
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
          combinedTotalCents: s.totalCommissionCents + s.totalOverrideCommissionCents,
        })),
        overrideRepSummaries: Array.from(overrideRepSummaries.entries()).map(([repId, s]) => ({
          salesRepId: repId,
          ...s,
        })),
        events: filteredEvents.map((ev: EventRow) => ({
          id: ev.id,
          occurredAt: ev.occurredAt,
          salesRepId: ev.salesRepId,
          salesRepName: `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim(),
          salesRepEmail: ev.salesRep?.email,
          clinicId: ev.clinicId,
          clinicName: ev.clinic?.name,
          status: ev.status,
          isManual: ev.isManual,
          isRecurring: ev.isRecurring,
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
        overrideEvents: overrideEvents.map((ov) => ({
          id: ov.id,
          occurredAt: ov.occurredAt,
          overrideRepId: ov.overrideRepId,
          overrideRepName: `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim(),
          overrideRepEmail: ov.overrideRep?.email,
          subordinateRepId: ov.subordinateRepId,
          clinicName: ov.clinic?.name,
          status: ov.status,
          eventAmountCents: ov.eventAmountCents,
          overridePercentBps: ov.overridePercentBps,
          commissionAmountCents: ov.commissionAmountCents,
          stripeEventId: ov.stripeEventId,
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

// ============================================================================
// PATCH — Batch mark commission events as PAID
// ============================================================================

const patchSchema = z.object({
  action: z.enum(['mark_paid', 'mark_approved']),
  eventIds: z.array(z.number().positive()).min(1).max(500).optional(),
  overrideEventIds: z.array(z.number().positive()).min(1).max(500).optional(),
  salesRepId: z.number().positive().optional(),
  clinicId: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

async function handlePatch(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { action, eventIds, overrideEventIds, salesRepId, clinicId, startDate, endDate } = parsed.data;
    const now = new Date();
    const targetStatus = action === 'mark_paid' ? 'PAID' : 'APPROVED';
    const fromStatus = action === 'mark_paid' ? 'APPROVED' : 'PENDING';

    return await withoutClinicFilter(async () => {
      let directCount = 0;
      let overrideCount = 0;

      if (eventIds && eventIds.length > 0) {
        const result = await prisma.salesRepCommissionEvent.updateMany({
          where: { id: { in: eventIds }, status: fromStatus },
          data: {
            status: targetStatus,
            ...(targetStatus === 'PAID' ? { paidAt: now } : { approvedAt: now }),
          },
        });
        directCount = result.count;
      } else if (salesRepId || clinicId) {
        const where: Record<string, any> = { status: fromStatus };
        if (salesRepId) where.salesRepId = salesRepId;
        if (clinicId) where.clinicId = clinicId;
        if (startDate) where.occurredAt = { ...where.occurredAt, gte: new Date(startDate) };
        if (endDate) {
          const ed = new Date(endDate);
          ed.setHours(23, 59, 59, 999);
          where.occurredAt = { ...where.occurredAt, lte: ed };
        }
        const result = await prisma.salesRepCommissionEvent.updateMany({
          where,
          data: {
            status: targetStatus,
            ...(targetStatus === 'PAID' ? { paidAt: now } : { approvedAt: now }),
          },
        });
        directCount = result.count;
      }

      if (overrideEventIds && overrideEventIds.length > 0) {
        const result = await prisma.salesRepOverrideCommissionEvent.updateMany({
          where: { id: { in: overrideEventIds }, status: fromStatus },
          data: {
            status: targetStatus,
            ...(targetStatus === 'PAID' ? { paidAt: now } : { approvedAt: now }),
          },
        });
        overrideCount = result.count;
      }

      logger.info('[SalesReps] Payroll batch status update', {
        action,
        directCount,
        overrideCount,
        eventIds: eventIds?.length || 0,
        overrideEventIds: overrideEventIds?.length || 0,
      });

      return NextResponse.json({
        success: true,
        action,
        directUpdated: directCount,
        overrideUpdated: overrideCount,
      });
    });
  } catch (error) {
    logger.error('[SalesReps] Payroll batch update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to update commission status');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handleGet));
export const PATCH = superAdminRateLimit(withSuperAdminAuth(handlePatch));
