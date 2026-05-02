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
import { decryptPatientPHI } from '@/lib/security/phi-encryption';
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

function fmtD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtUSD(cents: number) {
  return (cents / 100).toFixed(2);
}

/**
 * Product-enrichment internals for the payroll Export CSV. The goal is one
 * "Items Purchased" string per commission event, resolved via a few batched
 * queries against `Payment` and `Invoice` rows keyed off indexed columns —
 * no per-event N+1.
 *
 * Lookup chain:
 *   1. Stripe `pi_*` object IDs  → `Payment.stripePaymentIntentId` (unique idx)
 *   2. Manual entry `metadata.paymentId` → `Payment.id` (PK)
 *   3. Stripe `in_*` object IDs  → `Invoice.stripeInvoiceId` (unique idx)
 *   4. Invoices linked from any resolved Payment (`payment.invoiceId` PK)
 *   5. `InvoiceItem` for the resulting invoices → `Product.name` preferred,
 *      fallback to the line-item `description`.
 *
 * `ch_*` (charge) and `cs_*` (Checkout) IDs aren't looked up here — there's
 * no index on `Payment.stripeChargeId`, and they're rare enough that the
 * `pi_*` / `metadata.paymentId` paths cover almost all of them anyway.
 */
interface PaymentRow {
  id: number;
  stripePaymentIntentId: string | null;
  invoiceId: number | null;
}

interface InvoiceWithItems {
  id: number;
  stripeInvoiceId: string | null;
  items: Array<{
    description: string;
    quantity: number;
    product: { name: string } | null;
  }>;
}

interface CommissionEventForProductLookup {
  id: number;
  stripeObjectId: string | null;
  metadata: unknown;
}

function metadataPaymentId(metadata: unknown): number | null {
  const meta = metadata as Record<string, unknown> | null;
  if (!meta) return null;
  const pid = meta.paymentId;
  return typeof pid === 'number' && Number.isFinite(pid) ? pid : null;
}

function formatInvoiceItems(invoice: InvoiceWithItems): string {
  const names = invoice.items
    .map((it) => {
      const base = it.product?.name ?? it.description;
      if (!base) return '';
      return it.quantity > 1 ? `${base} \u00d7${it.quantity}` : base;
    })
    .filter((s): s is string => s.length > 0);
  return names.join('; ');
}

async function fetchPaymentsForEvents(
  stripePaymentIntentIds: string[],
  paymentIdsFromMeta: number[]
): Promise<PaymentRow[]> {
  const orClauses: Array<Record<string, unknown>> = [];
  if (stripePaymentIntentIds.length > 0) {
    orClauses.push({ stripePaymentIntentId: { in: stripePaymentIntentIds } });
  }
  if (paymentIdsFromMeta.length > 0) {
    orClauses.push({ id: { in: paymentIdsFromMeta } });
  }
  if (orClauses.length === 0) return [];
  return prisma.payment.findMany({
    where: { OR: orClauses },
    select: { id: true, stripePaymentIntentId: true, invoiceId: true },
  });
}

async function fetchInvoicesWithItems(
  invoiceIds: number[],
  stripeInvoiceIds: string[]
): Promise<InvoiceWithItems[]> {
  const orClauses: Array<Record<string, unknown>> = [];
  if (invoiceIds.length > 0) orClauses.push({ id: { in: invoiceIds } });
  if (stripeInvoiceIds.length > 0) {
    orClauses.push({ stripeInvoiceId: { in: stripeInvoiceIds } });
  }
  if (orClauses.length === 0) return [];
  return prisma.invoice.findMany({
    where: { OR: orClauses },
    select: {
      id: true,
      stripeInvoiceId: true,
      items: {
        select: {
          description: true,
          quantity: true,
          product: { select: { name: true } },
        },
      },
    },
  });
}

interface ProductLookupContext {
  paymentByPi: Map<string, PaymentRow>;
  paymentById: Map<number, PaymentRow>;
  invoiceById: Map<number, InvoiceWithItems>;
  invoiceByStripeId: Map<string, InvoiceWithItems>;
}

function invoiceItemsLabelFromPayment(
  payment: PaymentRow | undefined,
  invoiceById: Map<number, InvoiceWithItems>
): string {
  if (!payment) return '';
  const invId = payment.invoiceId;
  if (invId === null) return '';
  const inv = invoiceById.get(invId);
  return inv ? formatInvoiceItems(inv) : '';
}

function lookupProductsForEvent(
  ev: CommissionEventForProductLookup,
  ctx: ProductLookupContext
): string {
  const sid = ev.stripeObjectId;
  if (sid?.startsWith('in_')) {
    const inv = ctx.invoiceByStripeId.get(sid);
    if (inv) return formatInvoiceItems(inv);
  }
  if (sid?.startsWith('pi_')) {
    const label = invoiceItemsLabelFromPayment(ctx.paymentByPi.get(sid), ctx.invoiceById);
    if (label) return label;
  }
  const metaPaymentId = metadataPaymentId(ev.metadata);
  if (metaPaymentId !== null) {
    const label = invoiceItemsLabelFromPayment(
      ctx.paymentById.get(metaPaymentId),
      ctx.invoiceById
    );
    if (label) return label;
  }
  return '';
}

/**
 * Build a `Map<eventId, "Items Purchased label">` for the given commission
 * events. Events with no resolvable products are simply absent from the map.
 * Failures are non-fatal — a warning is logged and the report still renders.
 */
async function resolveProductsForEvents(
  events: CommissionEventForProductLookup[]
): Promise<Map<number, string>> {
  const productLabelByEventId = new Map<number, string>();
  if (events.length === 0) return productLabelByEventId;

  try {
    const stripeObjectIds = events
      .map((e) => e.stripeObjectId)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    const stripePaymentIntentIds = stripeObjectIds.filter((s) => s.startsWith('pi_'));
    const stripeInvoiceIds = stripeObjectIds.filter((s) => s.startsWith('in_'));
    const paymentIdsFromMeta = events
      .map((ev) => metadataPaymentId(ev.metadata))
      .filter((id): id is number => id !== null);

    const payments = await fetchPaymentsForEvents(stripePaymentIntentIds, paymentIdsFromMeta);

    const paymentByPi = new Map<string, PaymentRow>();
    const paymentById = new Map<number, PaymentRow>();
    const invoiceIdsFromPayments = new Set<number>();
    for (const pmt of payments) {
      if (pmt.stripePaymentIntentId) paymentByPi.set(pmt.stripePaymentIntentId, pmt);
      paymentById.set(pmt.id, pmt);
      if (typeof pmt.invoiceId === 'number') invoiceIdsFromPayments.add(pmt.invoiceId);
    }

    const invoices = await fetchInvoicesWithItems(
      Array.from(invoiceIdsFromPayments),
      stripeInvoiceIds
    );

    const invoiceById = new Map<number, InvoiceWithItems>();
    const invoiceByStripeId = new Map<string, InvoiceWithItems>();
    for (const inv of invoices) {
      invoiceById.set(inv.id, inv);
      if (inv.stripeInvoiceId) invoiceByStripeId.set(inv.stripeInvoiceId, inv);
    }

    const ctx: ProductLookupContext = {
      paymentByPi,
      paymentById,
      invoiceById,
      invoiceByStripeId,
    };
    for (const ev of events) {
      const label = lookupProductsForEvent(ev, ctx);
      if (label) productLabelByEventId.set(ev.id, label);
    }
  } catch (err) {
    logger.warn('[SalesReps] Product enrichment failed for payroll report', {
      error: err instanceof Error ? err.message : 'Unknown',
      eventCount: events.length,
    });
  }

  return productLabelByEventId;
}

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
    format: format ?? 'json',
    // CSV exports include patient name + Stripe customer ID + purchased line items
    // for payroll reconciliation. Patient names are PHI; itemsPurchased is
    // medication/product names which can be inferred-PHI in some clinics.
    includesCustomerPhi: format === 'csv',
    includesItemsPurchased: format === 'csv',
  });

  try {
    return await withoutClinicFilter(async () => {
      const clinicIdNum = clinicIdParam ? parseInt(clinicIdParam, 10) : null;
      const salesRepIdNum = salesRepIdParam ? parseInt(salesRepIdParam, 10) : null;

      const where: Record<string, any> = {
        occurredAt: { gte: startDate, lte: endDate },
      };
      if (clinicIdNum && !Number.isNaN(clinicIdNum)) where.clinicId = clinicIdNum;
      if (salesRepIdNum && !Number.isNaN(salesRepIdNum)) where.salesRepId = salesRepIdNum;
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

      // Calculate weeks in the reporting period for base pay proration
      const periodMs = endDate.getTime() - startDate.getTime();
      const periodWeeks = Math.max(1, Math.round(periodMs / (7 * 86_400_000)));

      // ---------------------------------------------------------------
      // Salary sources: EmployeeSalary (primary) + SalesRepPlanAssignment (legacy fallback)
      // Both queries are wrapped defensively so the report still works
      // if a migration hasn't been applied yet.
      // ---------------------------------------------------------------
      let employeeSalaries: Array<{
        userId: number;
        weeklyBasePayCents: number;
        hourlyRateCents: number | null;
        clinicId: number;
        user: {
          id: number;
          firstName: string;
          lastName: string;
          email: string;
          role: string;
        } | null;
        clinic: { id: number; name: string } | null;
      }> = [];
      try {
        const employeeSalaryWhere: Record<string, any> = {
          isActive: true,
          effectiveFrom: { lte: endDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
        };
        if (clinicIdNum) employeeSalaryWhere.clinicId = clinicIdNum;
        if (salesRepIdNum) employeeSalaryWhere.userId = salesRepIdNum;

        employeeSalaries = await prisma.employeeSalary.findMany({
          where: employeeSalaryWhere,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, role: true },
            },
            clinic: { select: { id: true, name: true } },
          },
        });
      } catch (salaryErr) {
        logger.warn('[SalesReps] EmployeeSalary query failed — table may not exist yet', {
          error: salaryErr instanceof Error ? salaryErr.message : 'Unknown',
        });
      }

      const repIds = [...new Set(events.map((e) => e.salesRepId))];
      let planAssignments: Array<{
        salesRepId: number;
        weeklyBasePayCents: number | null;
        hourlyRateCents: number | null;
      }> = [];
      try {
        planAssignments =
          repIds.length > 0
            ? await prisma.salesRepPlanAssignment.findMany({
                where: {
                  salesRepId: { in: repIds },
                  effectiveFrom: { lte: endDate },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
                },
                select: {
                  salesRepId: true,
                  weeklyBasePayCents: true,
                  hourlyRateCents: true,
                },
              })
            : [];
      } catch (planErr) {
        logger.warn('[SalesReps] PlanAssignment salary query failed — column may not exist yet', {
          error: planErr instanceof Error ? planErr.message : 'Unknown',
        });
      }

      // Build combined base pay map: EmployeeSalary takes priority over SalesRepPlanAssignment
      const basePayByUser = new Map<
        number,
        {
          weeklyBasePayCents: number;
          hourlyRateCents: number | null;
          periodBasePayCents: number;
          userName: string;
          userEmail: string;
          userRole: string;
          clinicId: number;
          clinicName: string;
        }
      >();

      for (const es of employeeSalaries) {
        if (es.weeklyBasePayCents > 0) {
          basePayByUser.set(es.userId, {
            weeklyBasePayCents: es.weeklyBasePayCents,
            hourlyRateCents: es.hourlyRateCents,
            periodBasePayCents: es.weeklyBasePayCents * periodWeeks,
            userName:
              `${es.user?.firstName || ''} ${es.user?.lastName || ''}`.trim() ||
              es.user?.email ||
              `User #${es.userId}`,
            userEmail: es.user?.email || '',
            userRole: es.user?.role || '',
            clinicId: es.clinicId,
            clinicName: es.clinic?.name || '',
          });
        }
      }

      for (const pa of planAssignments) {
        if (
          pa.weeklyBasePayCents &&
          pa.weeklyBasePayCents > 0 &&
          !basePayByUser.has(pa.salesRepId)
        ) {
          basePayByUser.set(pa.salesRepId, {
            weeklyBasePayCents: pa.weeklyBasePayCents,
            hourlyRateCents: pa.hourlyRateCents,
            periodBasePayCents: pa.weeklyBasePayCents * periodWeeks,
            userName: '',
            userEmail: '',
            userRole: 'SALES_REP',
            clinicId: 0,
            clinicName: '',
          });
        }
      }

      // Per-rep/employee summary with new/recurring breakdown and status counts
      const repSummaries = new Map<
        number,
        {
          name: string;
          email: string;
          userRole: string;
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
          weeklyBasePayCents: number;
          periodBasePayCents: number;
          periodWeeks: number;
        }
      >();

      function ensureRepSummary(
        userId: number,
        name: string,
        email: string,
        clinicId: number,
        clinicName: string,
        userRole?: string
      ) {
        if (!repSummaries.has(userId)) {
          const bp = basePayByUser.get(userId);
          repSummaries.set(userId, {
            name,
            email,
            userRole: userRole || bp?.userRole || 'SALES_REP',
            clinicId,
            clinicName,
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
            weeklyBasePayCents: bp?.weeklyBasePayCents || 0,
            periodBasePayCents: bp?.periodBasePayCents || 0,
            periodWeeks,
          });
        }
      }

      // Add salary-only employees (STAFF/SALES_REP without commission events)
      for (const [userId, bp] of basePayByUser) {
        ensureRepSummary(
          userId,
          bp.userName,
          bp.userEmail,
          bp.clinicId,
          bp.clinicName,
          bp.userRole
        );
      }

      for (const ev of events) {
        const repId = ev.salesRepId;
        const repName =
          `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() ||
          ev.salesRep?.email ||
          `Rep #${repId}`;
        ensureRepSummary(
          repId,
          repName,
          ev.salesRep?.email || '',
          ev.clinicId,
          ev.clinic?.name || ''
        );

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

        if (ev.status === 'PENDING') {
          s.pendingCount++;
          s.pendingCents += ev.commissionAmountCents;
        } else if (ev.status === 'APPROVED') {
          s.approvedCount++;
          s.approvedCents += ev.commissionAmountCents;
        } else if (ev.status === 'PAID') {
          s.paidCount++;
          s.paidCents += ev.commissionAmountCents;
        } else if (ev.status === 'REVERSED') {
          s.reversedCount++;
          s.reversedCents += ev.commissionAmountCents;
        }
      }

      // Override events
      const overrideWhere: Record<string, any> = {
        occurredAt: { gte: startDate, lte: endDate },
      };
      if (clinicIdNum) overrideWhere.clinicId = clinicIdNum;
      if (salesRepIdNum) overrideWhere.overrideRepId = salesRepIdNum;
      if (statusFilter && statusFilter !== 'ALL') {
        overrideWhere.status = statusFilter;
      } else if (!statusFilter) {
        overrideWhere.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
      }

      let overrideEvents: Array<{
        id: number;
        occurredAt: Date;
        overrideRepId: number;
        subordinateRepId: number;
        clinicId: number;
        eventAmountCents: number;
        overridePercentBps: number;
        commissionAmountCents: number;
        status: string;
        stripeEventId: string | null;
        isManual: boolean;
        notes: string | null;
        metadata: any;
        patientId: number | null;
        sourceCommissionEventId: number | null;
        overrideRep: { id: number; firstName: string; lastName: string; email: string } | null;
        clinic: { id: number; name: string } | null;
      }> = [];
      try {
        overrideEvents = (await prisma.salesRepOverrideCommissionEvent.findMany({
          where: overrideWhere,
          orderBy: [{ overrideRepId: 'asc' }, { occurredAt: 'asc' }],
          include: {
            overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
            clinic: { select: { id: true, name: true } },
          },
        })) as any;
      } catch (overrideErr) {
        logger.warn('[SalesReps] Override commission query failed — table may not exist yet', {
          error: overrideErr instanceof Error ? overrideErr.message : 'Unknown',
        });
      }

      // ---------------------------------------------------------------
      // Customer enrichment: resolve patientId → { customerName, stripeCustomerId }
      // for the Export CSV. PHI name fields are decrypted in-process and never
      // logged. Failures are non-fatal — the report still renders without names.
      // ---------------------------------------------------------------
      const patientIds = Array.from(
        new Set(
          [
            ...events.map((e) => e.patientId),
            ...overrideEvents.map((o) => o.patientId),
          ].filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
        )
      );

      const customerByPatientId = new Map<
        number,
        { customerName: string; stripeCustomerId: string }
      >();
      if (patientIds.length > 0) {
        try {
          const patients = await prisma.patient.findMany({
            where: { id: { in: patientIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              stripeCustomerId: true,
            },
          });
          for (const p of patients) {
            const decrypted = decryptPatientPHI(
              p as unknown as Record<string, unknown>,
              ['firstName', 'lastName']
            ) as { firstName: string | null; lastName: string | null };
            const customerName = `${decrypted.firstName ?? ''} ${decrypted.lastName ?? ''}`
              .trim();
            customerByPatientId.set(p.id, {
              customerName,
              stripeCustomerId: p.stripeCustomerId ?? '',
            });
          }
        } catch (custErr) {
          logger.warn('[SalesReps] Patient enrichment failed for payroll report', {
            error: custErr instanceof Error ? custErr.message : 'Unknown',
            patientCount: patientIds.length,
          });
        }
      }

      function customerFor(patientId: number | null | undefined): {
        customerName: string;
        stripeCustomerId: string;
      } {
        if (typeof patientId !== 'number') return { customerName: '', stripeCustomerId: '' };
        return (
          customerByPatientId.get(patientId) ?? { customerName: '', stripeCustomerId: '' }
        );
      }

      function csvField(value: string): string {
        return `"${value.replace(/"/g, '""')}"`;
      }

      // Resolve the actual line items purchased per direct commission event.
      // Override events inherit the same label from their `sourceCommissionEventId`.
      const productsByEventId = await resolveProductsForEvents(
        events.map((ev) => ({
          id: ev.id,
          stripeObjectId: ev.stripeObjectId,
          metadata: ev.metadata,
        }))
      );

      function productsFor(eventId: number | null | undefined): string {
        if (typeof eventId !== 'number') return '';
        return productsByEventId.get(eventId) ?? '';
      }

      const overrideRepSummaries = new Map<
        number,
        {
          name: string;
          email: string;
          clinicName: string;
          totalOverrideEvents: number;
          totalOverrideRevenueCents: number;
          totalOverrideCommissionCents: number;
        }
      >();

      for (const ov of overrideEvents) {
        const repId = ov.overrideRepId;
        if (!overrideRepSummaries.has(repId)) {
          overrideRepSummaries.set(repId, {
            name:
              `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim() ||
              ov.overrideRep?.email ||
              `Rep #${repId}`,
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
        pending: { count: 0, cents: 0 },
        approved: { count: 0, cents: 0 },
        paid: { count: 0, cents: 0 },
        reversed: { count: 0, cents: 0 },
      };
      const newVsRecurring = {
        newSale: { count: 0, cents: 0 },
        recurring: { count: 0, cents: 0 },
      };
      for (const ev of events) {
        const c = ev.commissionAmountCents;
        if (ev.status === 'PENDING') {
          statusBreakdown.pending.count++;
          statusBreakdown.pending.cents += c;
        } else if (ev.status === 'APPROVED') {
          statusBreakdown.approved.count++;
          statusBreakdown.approved.cents += c;
        } else if (ev.status === 'PAID') {
          statusBreakdown.paid.count++;
          statusBreakdown.paid.cents += c;
        } else if (ev.status === 'REVERSED') {
          statusBreakdown.reversed.count++;
          statusBreakdown.reversed.cents += c;
        }
        if (ev.isRecurring) {
          newVsRecurring.recurring.count++;
          newVsRecurring.recurring.cents += c;
        } else {
          newVsRecurring.newSale.count++;
          newVsRecurring.newSale.cents += c;
        }
      }

      const totalBasePayCents = Array.from(repSummaries.values()).reduce(
        (a, r) => a + r.periodBasePayCents,
        0
      );
      const directCommCents = events.reduce((a, e) => a + e.commissionAmountCents, 0);
      const grandTotal = {
        events: events.length,
        revenueCents: events.reduce((a, e) => a + e.eventAmountCents, 0),
        commissionCents: directCommCents,
        overrideEvents: overrideGrandTotal.events,
        overrideCommissionCents: overrideGrandTotal.commissionCents,
        combinedCommissionCents: directCommCents + overrideGrandTotal.commissionCents,
        totalBasePayCents,
        totalPayrollCents: directCommCents + overrideGrandTotal.commissionCents + totalBasePayCents,
        periodWeeks,
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
        csv += `Combined Commission,$${fmtUSD(grandTotal.combinedCommissionCents)}\n`;
        csv += `Total Base Salary,$${fmtUSD(grandTotal.totalBasePayCents)}\n`;
        csv += `TOTAL PAYROLL,$${fmtUSD(grandTotal.totalPayrollCents)}\n`;
        csv += `Period Weeks,${periodWeeks}\n`;
        csv += `New Sale Commissions,${newVsRecurring.newSale.count},$${fmtUSD(newVsRecurring.newSale.cents)}\n`;
        csv += `Recurring Commissions,${newVsRecurring.recurring.count},$${fmtUSD(newVsRecurring.recurring.cents)}\n`;
        csv += `Pending,${statusBreakdown.pending.count},$${fmtUSD(statusBreakdown.pending.cents)}\n`;
        csv += `Approved (Ready to Pay),${statusBreakdown.approved.count},$${fmtUSD(statusBreakdown.approved.cents)}\n`;
        csv += `Paid,${statusBreakdown.paid.count},$${fmtUSD(statusBreakdown.paid.cents)}\n`;
        csv += `Reversed,${statusBreakdown.reversed.count},$${fmtUSD(statusBreakdown.reversed.cents)}\n\n`;

        csv += `=== PER-EMPLOYEE SUMMARY ===\n`;
        csv += `Employee,Email,Role,Clinic,Events,Revenue,Base Commission,Volume Tier,Product Bonus,Multi-Item,Total Commission,New Sales,New Sale $,Recurring,Recurring $,Override $,Combined Commission,Weekly Base Salary,Period Base Pay (${periodWeeks}wk),Total Payroll,Manual,Stripe,Pending $,Approved $,Paid $\n`;
        for (const [, s] of repSummaries) {
          const combined = s.totalCommissionCents + s.totalOverrideCommissionCents;
          const totalPayroll = combined + s.periodBasePayCents;
          csv += `"${s.name}","${s.email}","${s.userRole}","${s.clinicName}",${s.totalEvents},$${fmtUSD(s.totalRevenueCents)},$${fmtUSD(s.totalBaseCents)},$${fmtUSD(s.totalVolumeTierCents)},$${fmtUSD(s.totalProductCents)},$${fmtUSD(s.totalMultiItemCents)},$${fmtUSD(s.totalCommissionCents)},${s.newSaleCount},$${fmtUSD(s.newSaleCommissionCents)},${s.recurringCount},$${fmtUSD(s.recurringCommissionCents)},$${fmtUSD(s.totalOverrideCommissionCents)},$${fmtUSD(combined)},$${fmtUSD(s.weeklyBasePayCents)},$${fmtUSD(s.periodBasePayCents)},$${fmtUSD(totalPayroll)},${s.manualCount},${s.stripeCount},$${fmtUSD(s.pendingCents)},$${fmtUSD(s.approvedCents)},$${fmtUSD(s.paidCents)}\n`;
        }

        csv += `\n=== EVENT DETAIL ===\n`;
        csv += `Date,Sales Rep,Email,Clinic,Status,Type,Source,Revenue,Base,Volume Tier,Product,Multi-Item,Total Commission,Plan,Items Purchased,Notes,Customer Name,Stripe Customer ID,Stripe Event\n`;
        for (const ev of filteredEvents) {
          const repName =
            `${ev.salesRep?.firstName || ''} ${ev.salesRep?.lastName || ''}`.trim() ||
            ev.salesRep?.email ||
            '';
          const meta = (ev.metadata as Record<string, any>) || {};
          const saleType = ev.isRecurring ? 'Recurring' : 'New Sale';
          const source = ev.isManual ? 'Manual' : 'Stripe';
          const cust = customerFor(ev.patientId);
          const items = productsFor(ev.id);
          csv += `${ev.occurredAt.toISOString().slice(0, 10)},${csvField(repName)},${csvField(ev.salesRep?.email || '')},${csvField(ev.clinic?.name || '')},${ev.status},${saleType},${source},$${fmtUSD(ev.eventAmountCents)},$${fmtUSD(ev.baseCommissionCents)},$${fmtUSD(ev.volumeTierBonusCents)},$${fmtUSD(ev.productBonusCents)},$${fmtUSD(ev.multiItemBonusCents)},$${fmtUSD(ev.commissionAmountCents)},${csvField(meta.planName || '')},${csvField(items)},${csvField(ev.notes || '')},${csvField(cust.customerName)},${csvField(cust.stripeCustomerId)},${ev.stripeEventId || ''}\n`;
        }

        if (overrideEvents.length > 0) {
          csv += `\n=== OVERRIDE COMMISSION DETAIL ===\n`;
          csv += `Date,Override Rep,Email,Clinic,Status,Subordinate Revenue,Override Rate,Override Commission,Items Purchased,Customer Name,Stripe Customer ID,Stripe Event\n`;
          for (const ov of overrideEvents) {
            const repName =
              `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim() ||
              ov.overrideRep?.email ||
              '';
            const cust = customerFor(ov.patientId);
            const items = productsFor(ov.sourceCommissionEventId);
            csv += `${ov.occurredAt.toISOString().slice(0, 10)},${csvField(repName)},${csvField(ov.overrideRep?.email || '')},${csvField(ov.clinic?.name || '')},${ov.status},$${fmtUSD(ov.eventAmountCents)},${(ov.overridePercentBps / 100).toFixed(2)}%,$${fmtUSD(ov.commissionAmountCents)},${csvField(items)},${csvField(cust.customerName)},${csvField(cust.stripeCustomerId)},${ov.stripeEventId || ''}\n`;
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
        repSummaries: Array.from(repSummaries.entries()).map(([userId, s]) => ({
          salesRepId: userId,
          ...s,
          combinedTotalCents: s.totalCommissionCents + s.totalOverrideCommissionCents,
          totalPayrollCents:
            s.totalCommissionCents + s.totalOverrideCommissionCents + s.periodBasePayCents,
        })),
        overrideRepSummaries: Array.from(overrideRepSummaries.entries()).map(([repId, s]) => ({
          salesRepId: repId,
          ...s,
        })),
        events: filteredEvents.map((ev: EventRow) => {
          const cust = customerFor(ev.patientId);
          const items = productsFor(ev.id);
          return {
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
            patientId: ev.patientId,
            customerName: cust.customerName.length > 0 ? cust.customerName : null,
            stripeCustomerId: cust.stripeCustomerId.length > 0 ? cust.stripeCustomerId : null,
            itemsPurchased: items.length > 0 ? items : null,
          };
        }),
        overrideEvents: overrideEvents.map((ov) => {
          const cust = customerFor(ov.patientId);
          const items = productsFor(ov.sourceCommissionEventId);
          return {
            id: ov.id,
            occurredAt: ov.occurredAt,
            overrideRepId: ov.overrideRepId,
            overrideRepName:
              `${ov.overrideRep?.firstName || ''} ${ov.overrideRep?.lastName || ''}`.trim(),
            overrideRepEmail: ov.overrideRep?.email,
            subordinateRepId: ov.subordinateRepId,
            clinicName: ov.clinic?.name,
            status: ov.status,
            eventAmountCents: ov.eventAmountCents,
            overridePercentBps: ov.overridePercentBps,
            commissionAmountCents: ov.commissionAmountCents,
            stripeEventId: ov.stripeEventId,
            patientId: ov.patientId,
            customerName: cust.customerName.length > 0 ? cust.customerName : null,
            stripeCustomerId: cust.stripeCustomerId.length > 0 ? cust.stripeCustomerId : null,
            itemsPurchased: items.length > 0 ? items : null,
          };
        }),
      });
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    logger.error('[SalesReps] Payroll report failed', {
      error: errObj.message,
      stack: errObj.stack?.split('\n').slice(0, 5).join(' | '),
      code: (error as any)?.code,
      meta: (error as any)?.meta,
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
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, eventIds, overrideEventIds, salesRepId, clinicId, startDate, endDate } =
      parsed.data;
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
    const errObj = error instanceof Error ? error : new Error(String(error));
    logger.error('[SalesReps] Payroll batch update failed', {
      error: errObj.message,
      stack: errObj.stack?.split('\n').slice(0, 5).join(' | '),
      code: (error as any)?.code,
      meta: (error as any)?.meta,
    });
    return serverError('Failed to update commission status');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handleGet));
export const PATCH = superAdminRateLimit(withSuperAdminAuth(handlePatch));
