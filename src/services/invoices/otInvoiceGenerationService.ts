/**
 * OT (Overtime / ot.eonpro.io) — reconciliation statement: EONPro collects patient payments
 * (Stripe gross), then this breakdown allocates pharmacy cost, shipping, TRT telehealth ($50 when applicable),
 * a combined doctor/Rx fee ($30 async or sync; waived if refill <90d after prior paid Rx), fulfillment lines,
 * merchant processing, EONPro platform share, and sales-comp ledger lines when present.
 * `clinicNetPayoutCents` is gross minus those allocations (what remains for the OT clinic).
 *
 * Patient gross prefers net cents from succeeded local Payment rows (Stripe-settled); otherwise
 * `Invoice.amountPaid` / `amountDue` from Stripe webhook sync. Per-sale rows flag Stripe billing name vs
 * profile and whether `Invoice.patientId` matches `Order.patientId`.
 */

import path from 'path';
import fs from 'fs/promises';
import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { midnightInTz } from '@/lib/utils/timezone';
import {
  OT_CLINIC_SUBDOMAIN,
  OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS,
  OT_MERCHANT_PROCESSING_BPS,
  OT_PLATFORM_COMPENSATION_BPS,
  resolveOtProductPriceForPharmacyLine,
  getOtPrescriptionShippingCentsForOrder,
  getOtDoctorRxFeeCentsForSale,
  findPriorPaidOtPrescriptionInvoice,
  isOtTestosteroneReplacementTherapyOrder,
  OT_RX_ASYNC_APPROVAL_FEE_CENTS,
  OT_RX_SYNC_APPROVAL_FEE_CENTS,
  OT_TRT_TELEHEALTH_FEE_CENTS,
} from '@/lib/invoices/ot-pricing';
import { BRAND } from '@/lib/constants/brand-assets';
import {
  compareStripeBillingNameToPatient,
  resolveOtPatientGrossCents,
} from '@/lib/invoices/ot-stripe-sale-alignment';

const CLINIC_TZ = 'America/New_York';

/** Merges duplicate `Rx` rows (same key/name/strength/form) from Lifefile into one invoice line. */
function consolidateOtOrderRxs(
  rxs: { medicationKey: string; medName: string; strength: string; form: string; quantity: string }[],
): { rx: (typeof rxs)[number]; qty: number }[] {
  const keyToTemplate = new Map<string, (typeof rxs)[number]>();
  const keyToQty = new Map<string, number>();
  for (const rx of rxs) {
    const k = `${rx.medicationKey}\t${rx.medName}\t${rx.strength}\t${rx.form}`;
    const q = parseInt(rx.quantity, 10) || 1;
    if (!keyToTemplate.has(k)) keyToTemplate.set(k, rx);
    keyToQty.set(k, (keyToQty.get(k) ?? 0) + q);
  }
  return [...keyToTemplate.keys()].map((k) => ({
    rx: keyToTemplate.get(k)!,
    qty: keyToQty.get(k)!,
  }));
}

export interface OtPharmacyLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medicationName: string;
  strength: string;
  vialSize: string;
  medicationKey: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  pricingStatus: 'priced' | 'estimated' | 'missing';
}

export interface OtShippingLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  feeCents: number;
}

export interface OtPharmacyInvoice {
  invoiceType: 'pharmacy';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtPharmacyLineItem[];
  shippingLineItems: OtShippingLineItem[];
  /** $30 per order with ≥1 Rx */
  prescriptionFeeLineItems: OtShippingLineItem[];
  /** $50 telehealth when order is TRT */
  trtTelehealthLineItems: OtShippingLineItem[];
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  subtotalPrescriptionFeesCents: number;
  subtotalTrtTelehealthCents: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
  missingPriceCount: number;
  /** Qty covered by name/form fallback COGS (not yet mapped to Lifefile product id). */
  estimatedPriceCount: number;
}

export interface OtDoctorApprovalLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medications: string;
  feeCents: number;
  approvalMode: 'async' | 'sync';
  /** Set when fee is $0 due to refill within 90 days of prior paid Rx. */
  doctorFeeWaivedReason: string | null;
}

export interface OtDoctorApprovalsInvoice {
  invoiceType: 'doctor_approvals';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtDoctorApprovalLineItem[];
  asyncFeeCents: number;
  syncFeeCents: number;
  asyncCount: number;
  syncCount: number;
  totalCents: number;
}

export interface OtFulfillmentLineItem {
  orderId: number;
  invoiceDbId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  patientLineAmountCents: number;
  feeCents: number;
}

export interface OtFulfillmentInvoice {
  invoiceType: 'fulfillment';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtFulfillmentLineItem[];
  totalCents: number;
}

export interface OtPlatformCompensation {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
  invoiceCount: number;
}

export interface OtMerchantProcessingFee {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
}

/** One row per order/sale: full allocation from patient gross to OT clinic net. */
export interface OtPerSaleReconciliationLine {
  orderId: number;
  invoiceDbId: number | null;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  /** Stripe invoice gross (amount paid, or amount due fallback). */
  patientGrossCents: number;
  /** `stripe_payments` = sum of net succeeded `Payment` rows; `invoice_sync` = invoice record only. */
  patientGrossSource: 'stripe_payments' | 'invoice_sync';
  /** Stripe `customer_name` (from payment reconciliation) vs patient profile when available. */
  stripeBillingNameMatch: 'match' | 'mismatch' | 'unknown';
  /** False when the prescription invoice is tied to a different patient than the Lifefile order. */
  invoicePatientMatchesOrder: boolean;
  medicationsCostCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  /** Meds + shipping + TRT only (doctor/Rx allocation is separate). */
  pharmacyTotalCents: number;
  /** Doctor/Rx fee charged on this sale ($0 when refill &lt;90d after prior paid Rx). */
  doctorApprovalCents: number;
  /** Standard $30 doctor/Rx rate for async/sync before refill rule. */
  doctorRxFeeNominalCents: number;
  /** Amount of nominal fee waived (0 or nominal). */
  doctorRxFeeWaivedCents: number;
  /** Days since patient’s prior paid prescription invoice at this clinic; null if first paid Rx or unknown. */
  doctorRxFeeDaysSincePrior: number | null;
  /** Explains $0 fee or empty when full fee applies. */
  doctorRxFeeNote: string | null;
  fulfillmentFeesCents: number;
  /** 4% of this sale gross, rounded. */
  merchantProcessingCents: number;
  /** 10% of this sale gross, rounded. */
  platformCompensationCents: number;
  /** Ledger: `SalesRepCommissionEvent` for this Stripe invoice (rep payout). */
  salesRepCommissionCents: number;
  salesRepId: number | null;
  salesRepName: string | null;
  /** Sum of `SalesRepOverrideCommissionEvent` tied to that commission (manager / oversight). */
  managerOverrideTotalCents: number;
  /** Short breakdown, e.g. "Doe, Jane: $1.50" — omit PHI. */
  managerOverrideSummary: string | null;
  totalDeductionsCents: number;
  clinicNetPayoutCents: number;
}

export interface OtDailyInvoices {
  pharmacy: OtPharmacyInvoice;
  doctorApprovals: OtDoctorApprovalsInvoice;
  fulfillment: OtFulfillmentInvoice;
  merchantProcessing: OtMerchantProcessingFee;
  platformCompensation: OtPlatformCompensation;
  /** Sum of pharmacy + doctor + fulfillment + merchant + platform + rep commission + manager overrides. */
  grandTotalCents: number;
  /** Patient gross minus `grandTotalCents` — net for OT clinic payout from EONPro (may be negative if data is inconsistent). */
  clinicNetPayoutCents: number;
  /** Sum of per-sale sales rep commissions (from commission ledger). */
  salesRepCommissionTotalCents: number;
  /** Sum of per-sale manager override / oversight commissions. */
  managerOverrideTotalCents: number;
  /** Every sale in the period, same accounting as the summary (merchant/platform rounded per sale then summed). */
  perSaleReconciliation: OtPerSaleReconciliationLine[];
}

interface RawInvoiceLine {
  description?: string;
  amount?: number;
  quantity?: number;
}

function parseInvoiceLineItemsJson(raw: unknown): RawInvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean).map((row) => {
    if (typeof row !== 'object' || row === null) return {};
    const o = row as Record<string, unknown>;
    return {
      description: typeof o.description === 'string' ? o.description : undefined,
      amount: typeof o.amount === 'number' ? o.amount : undefined,
      quantity: typeof o.quantity === 'number' ? o.quantity : undefined,
    };
  });
}

function safeDecryptName(encrypted: string): string {
  try {
    return decryptPHI(encrypted) ?? encrypted;
  } catch {
    return encrypted;
  }
}

function formatPatientName(patient: { firstName: string; lastName: string }): string {
  const first = safeDecryptName(patient.firstName);
  const last = safeDecryptName(patient.lastName);
  return `${last}, ${first}`;
}

function normalizeGrossCents(inv: { amountPaid: number; amountDue: number | null }): number {
  if (inv.amountPaid > 0) return inv.amountPaid;
  if (inv.amountDue != null && inv.amountDue > 0) return inv.amountDue;
  return 0;
}

function moneyLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Match OT `Invoice.stripeInvoiceId` to ledger rows (`stripeObjectId` = Stripe invoice id on payment webhook). */
async function loadOtPaidPrescriptionInvoicesByPatient(
  clinicId: number,
  patientIds: number[],
): Promise<Map<number, { id: number; paidAt: Date }[]>> {
  const map = new Map<number, { id: number; paidAt: Date }[]>();
  if (patientIds.length === 0) return map;
  const rows = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      patientId: { in: patientIds },
      prescriptionProcessed: true,
      paidAt: { not: null },
      status: { notIn: ['VOID', 'REFUNDED'] },
    },
    select: { id: true, patientId: true, paidAt: true, amountPaid: true, amountDue: true },
    orderBy: [{ patientId: 'asc' }, { paidAt: 'asc' }, { id: 'asc' }],
  });
  for (const row of rows) {
    if (!row.paidAt) continue;
    if (normalizeGrossCents({ amountPaid: row.amountPaid, amountDue: row.amountDue }) <= 0) continue;
    const list = map.get(row.patientId) ?? [];
    list.push({ id: row.id, paidAt: row.paidAt });
    map.set(row.patientId, list);
  }
  return map;
}

async function loadOtSalesRepCommissionLookup(
  clinicId: number,
  invoiceDbIds: number[],
): Promise<{
  stripeByInvoiceDbId: Map<number, string | null>;
  commissionByStripeObjectId: Map<
    string,
    { id: number; salesRepId: number; commissionAmountCents: number }
  >;
  overrideBySourceEventId: Map<number, { totalCents: number; summary: string }>;
  repLabelById: Map<number, string>;
}> {
  const stripeByInvoiceDbId = new Map<number, string | null>();
  const commissionByStripeObjectId = new Map<
    string,
    { id: number; salesRepId: number; commissionAmountCents: number }
  >();
  const overrideBySourceEventId = new Map<number, { totalCents: number; summary: string }>();
  const repLabelById = new Map<number, string>();

  if (invoiceDbIds.length === 0) {
    return { stripeByInvoiceDbId, commissionByStripeObjectId, overrideBySourceEventId, repLabelById };
  }

  const invoices = await basePrisma.invoice.findMany({
    where: { id: { in: invoiceDbIds } },
    select: { id: true, stripeInvoiceId: true },
  });
  for (const inv of invoices) {
    stripeByInvoiceDbId.set(inv.id, inv.stripeInvoiceId);
  }

  const stripeIds = [...new Set(invoices.map((i) => i.stripeInvoiceId).filter((x): x is string => !!x))];
  if (stripeIds.length === 0) {
    return { stripeByInvoiceDbId, commissionByStripeObjectId, overrideBySourceEventId, repLabelById };
  }

  const events = await basePrisma.salesRepCommissionEvent.findMany({
    where: {
      clinicId,
      stripeObjectId: { in: stripeIds },
      status: { not: 'REVERSED' },
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      stripeObjectId: true,
      salesRepId: true,
      commissionAmountCents: true,
    },
  });
  for (const ev of events) {
    if (!ev.stripeObjectId) continue;
    if (!commissionByStripeObjectId.has(ev.stripeObjectId)) {
      commissionByStripeObjectId.set(ev.stripeObjectId, {
        id: ev.id,
        salesRepId: ev.salesRepId,
        commissionAmountCents: ev.commissionAmountCents,
      });
    }
  }

  const sourceIds = [...commissionByStripeObjectId.values()].map((v) => v.id);
  const overrides =
    sourceIds.length > 0
      ? await basePrisma.salesRepOverrideCommissionEvent.findMany({
          where: {
            clinicId,
            sourceCommissionEventId: { in: sourceIds },
            status: { not: 'REVERSED' },
          },
          select: {
            sourceCommissionEventId: true,
            overrideRepId: true,
            commissionAmountCents: true,
          },
        })
      : [];

  const userIds = new Set<number>();
  for (const v of commissionByStripeObjectId.values()) userIds.add(v.salesRepId);
  for (const o of overrides) userIds.add(o.overrideRepId);

  if (userIds.size > 0) {
    const users = await basePrisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const u of users) {
      repLabelById.set(u.id, `${u.lastName}, ${u.firstName}`);
    }
  }

  const agg = new Map<number, { parts: string[]; total: number }>();
  for (const o of overrides) {
    const sid = o.sourceCommissionEventId;
    if (sid == null) continue;
    const label = repLabelById.get(o.overrideRepId) ?? `User #${o.overrideRepId}`;
    const cur = agg.get(sid) ?? { parts: [], total: 0 };
    cur.total += o.commissionAmountCents;
    cur.parts.push(`${label}: ${moneyLabel(o.commissionAmountCents)}`);
    agg.set(sid, cur);
  }
  for (const [sid, v] of agg) {
    overrideBySourceEventId.set(sid, { totalCents: v.total, summary: v.parts.join('; ') });
  }

  return { stripeByInvoiceDbId, commissionByStripeObjectId, overrideBySourceEventId, repLabelById };
}

/** Net cents per invoice from Stripe-processed local Payment rows (SUCCEEDED only — widest DB compatibility). */
async function loadOtPaymentNetCentsByInvoiceId(invoiceDbIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (invoiceDbIds.length === 0) return map;
  const payments = await basePrisma.payment.findMany({
    where: {
      invoiceId: { in: invoiceDbIds },
      status: 'SUCCEEDED',
    },
    select: { invoiceId: true, amount: true },
  });
  for (const p of payments) {
    if (p.invoiceId == null || p.amount <= 0) continue;
    map.set(p.invoiceId, (map.get(p.invoiceId) ?? 0) + p.amount);
  }
  return map;
}

/** Latest Stripe billing name captured during reconciliation (for profile name sanity check). */
async function loadOtStripeCustomerNameByInvoiceId(invoiceDbIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (invoiceDbIds.length === 0) return map;
  const rows = await basePrisma.paymentReconciliation.findMany({
    where: {
      invoiceId: { in: invoiceDbIds },
      customerName: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { invoiceId: true, customerName: true },
  });
  for (const r of rows) {
    if (r.invoiceId == null) continue;
    const n = r.customerName?.trim();
    if (!n || map.has(r.invoiceId)) continue;
    map.set(r.invoiceId, n);
  }
  return map;
}

async function resolveOtClinic(): Promise<{ clinicId: number; clinicName: string }> {
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (!clinic) {
    throw new Error(`OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})`);
  }
  return { clinicId: clinic.id, clinicName: clinic.name };
}

function lineLooksLikeExcludedService(descLower: string): boolean {
  return (
    descLower.includes('shipping') ||
    descLower.includes('overnight') ||
    descLower.includes('fedex') ||
    descLower.includes('ups ') ||
    descLower.includes('delivery')
  );
}

function shouldCountAsFulfillmentLine(
  description: string,
  rxs: { medName: string; strength: string }[],
): boolean {
  const d = description.toLowerCase().trim();
  if (!d || lineLooksLikeExcludedService(d)) return false;
  for (const rx of rxs) {
    const fragment = rx.medName.toLowerCase().trim();
    if (fragment.length >= 3 && d.includes(fragment)) return false;
  }
  return true;
}

export async function generateOtDailyInvoices(date: string, endDate?: string): Promise<OtDailyInvoices> {
  const { clinicId, clinicName } = await resolveOtClinic();

  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);

  const paidInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: { not: null },
    },
    select: {
      id: true,
      orderId: true,
      paidAt: true,
      patientId: true,
      prescriptionProcessedAt: true,
      amountPaid: true,
      amountDue: true,
      lineItems: true,
    },
  });

  const invoiceByOrderId = new Map<
    number,
    {
      paidAt: Date | null;
      invoiceDbId: number;
      patientId: number;
      amountPaid: number;
      amountDue: number | null;
      lineItems: unknown;
    }
  >();
  const orderIdsFromInvoices = new Set<number>();
  for (const inv of paidInvoices) {
    if (inv.orderId) {
      invoiceByOrderId.set(inv.orderId, {
        paidAt: inv.paidAt,
        invoiceDbId: inv.id,
        patientId: inv.patientId,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        lineItems: inv.lineItems,
      });
      orderIdsFromInvoices.add(inv.orderId);
    }
  }

  const unlinkedInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: null,
    },
    select: {
      id: true,
      paidAt: true,
      patientId: true,
      prescriptionProcessedAt: true,
      amountPaid: true,
      amountDue: true,
      lineItems: true,
    },
  });

  const wideStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wideEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Prisma rejects `in: []`; when all period invoices are unlinked (no orderId yet), only query by date window.
  const orderIdsMatchedToInvoice = [...orderIdsFromInvoices];
  const orderOrClause =
    orderIdsMatchedToInvoice.length > 0
      ? [{ id: { in: orderIdsMatchedToInvoice } }, { createdAt: { gte: wideStart, lte: wideEnd } }]
      : [{ createdAt: { gte: wideStart, lte: wideEnd } }];

  const allOrders = await basePrisma.order.findMany({
    where: {
      clinicId,
      OR: orderOrClause,
      cancelledAt: null,
      fulfillmentChannel: 'lifefile',
      status: { notIn: ['error', 'cancelled', 'declined', 'queued_for_provider'] },
    },
    select: {
      id: true,
      createdAt: true,
      approvedAt: true,
      queuedForProviderAt: true,
      lifefileOrderId: true,
      shippingMethod: true,
      patientId: true,
      providerId: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: { select: { id: true, firstName: true, lastName: true } },
      rxs: {
        select: { medicationKey: true, medName: true, strength: true, form: true, quantity: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const inv of unlinkedInvoices) {
    if (!inv.prescriptionProcessedAt) continue;
    const processedMs = inv.prescriptionProcessedAt.getTime();
    let bestOrder: (typeof allOrders)[number] | null = null;
    let bestDiff = Infinity;
    for (const o of allOrders) {
      if (o.patientId !== inv.patientId) continue;
      if (orderIdsFromInvoices.has(o.id)) continue;
      const diff = Math.abs(o.createdAt.getTime() - processedMs);
      if (diff < bestDiff && diff < 5 * 60 * 1000) {
        bestDiff = diff;
        bestOrder = o;
      }
    }
    if (bestOrder) {
      invoiceByOrderId.set(bestOrder.id, {
        paidAt: inv.paidAt,
        invoiceDbId: inv.id,
        patientId: inv.patientId,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        lineItems: inv.lineItems,
      });
      orderIdsFromInvoices.add(bestOrder.id);
    }
  }

  const filteredOrders = allOrders.filter((o) => orderIdsFromInvoices.has(o.id));

  logger.info('OT invoice generation: orders loaded', {
    clinicId,
    date,
    endDate: endDate ?? date,
    matchedOrders: filteredOrders.length,
  });

  const invoiceDbIdsForCommissions = [
    ...new Set(
      filteredOrders
        .map((o) => invoiceByOrderId.get(o.id)?.invoiceDbId)
        .filter((x): x is number => x != null),
    ),
  ];
  const salesRepLookup = await loadOtSalesRepCommissionLookup(clinicId, invoiceDbIdsForCommissions);

  let paymentNetByInvoiceId = new Map<number, number>();
  let stripeCustomerNameByInvoiceId = new Map<number, string>();
  try {
    const [payments, stripeNames] = await Promise.all([
      loadOtPaymentNetCentsByInvoiceId(invoiceDbIdsForCommissions),
      loadOtStripeCustomerNameByInvoiceId(invoiceDbIdsForCommissions),
    ]);
    paymentNetByInvoiceId = payments;
    stripeCustomerNameByInvoiceId = stripeNames;
  } catch (preloadErr) {
    const msg = preloadErr instanceof Error ? preloadErr.message : String(preloadErr);
    logger.error('OT invoice: payment / PaymentReconciliation preload failed; using invoice gross only', {
      message: msg,
    });
  }

  const patientIdsForDoctorFee = [...new Set(filteredOrders.map((o) => o.patientId))];
  const paidRxHistoryByPatient = await loadOtPaidPrescriptionInvoicesByPatient(
    clinicId,
    patientIdsForDoctorFee,
  );

  const pharmacyLineItems: OtPharmacyLineItem[] = [];
  const shippingLineItems: OtShippingLineItem[] = [];
  const trtTelehealthLineItems: OtShippingLineItem[] = [];
  const doctorLines: OtDoctorApprovalLineItem[] = [];
  const fulfillmentLines: OtFulfillmentLineItem[] = [];
  const perSaleReconciliation: OtPerSaleReconciliationLine[] = [];

  let subtotalMedicationsCents = 0;
  let subtotalShippingCents = 0;
  let subtotalTrtTelehealthCents = 0;
  let totalVials = 0;
  let missingPriceCount = 0;
  let estimatedPriceCount = 0;
  let grossSalesCents = 0;
  const grossInvoicesCounted = new Set<number>();

  for (const order of filteredOrders) {
    const patientName = order.patient
      ? formatPatientName(order.patient)
      : `Patient #${order.patientId}`;
    const providerName = order.provider
      ? `${order.provider.lastName}, ${order.provider.firstName}`
      : `Provider #${order.providerId}`;
    const sentAt = order.approvedAt ?? order.createdAt;
    const orderDate = sentAt.toISOString();
    const invMeta = invoiceByOrderId.get(order.id);
    const paidAt = invMeta?.paidAt?.toISOString() ?? null;

    if (invMeta && !grossInvoicesCounted.has(invMeta.invoiceDbId)) {
      grossInvoicesCounted.add(invMeta.invoiceDbId);
      const g = resolveOtPatientGrossCents({
        invoiceDbId: invMeta.invoiceDbId,
        invoiceAmountPaid: invMeta.amountPaid,
        invoiceAmountDue: invMeta.amountDue,
        paymentNetCentsByInvoiceId: paymentNetByInvoiceId,
        invoiceGrossFallback: normalizeGrossCents,
      });
      grossSalesCents += g.cents;
    }

    if (invMeta && invMeta.patientId !== order.patientId) {
      logger.warn('OT invoice: prescription invoice patientId does not match order patientId', {
        orderId: order.id,
        invoiceDbId: invMeta.invoiceDbId,
        invoicePatientId: invMeta.patientId,
        orderPatientId: order.patientId,
      });
    }

    let orderVialCount = 0;
    let orderMedTotalCents = 0;

    for (const { rx, qty } of consolidateOtOrderRxs(order.rxs)) {
      const resolved = resolveOtProductPriceForPharmacyLine(rx);
      orderVialCount += qty;
      const unitCents = resolved?.row.priceCents ?? 0;
      if (!resolved) missingPriceCount += qty;
      else if (resolved.source === 'fallback') estimatedPriceCount += qty;
      orderMedTotalCents += unitCents * qty;

      const pricingStatus: OtPharmacyLineItem['pricingStatus'] = resolved
        ? resolved.source === 'catalog'
          ? 'priced'
          : 'estimated'
        : 'missing';
      const displayName = resolved?.row.name ?? rx.medName;
      const displayStrength = resolved?.row.strength ?? rx.strength;
      const displayVial = resolved?.row.vialSize ?? (rx.form || '');

      pharmacyLineItems.push({
        orderId: order.id,
        lifefileOrderId: order.lifefileOrderId,
        orderDate,
        paidAt,
        patientName,
        patientId: order.patientId,
        providerName,
        providerId: order.providerId,
        medicationName: displayName,
        strength: displayStrength,
        vialSize: displayVial,
        medicationKey: rx.medicationKey,
        quantity: qty,
        unitPriceCents: unitCents,
        lineTotalCents: unitCents * qty,
        pricingStatus,
      });
    }

    subtotalMedicationsCents += orderMedTotalCents;
    totalVials += orderVialCount;

    let orderShippingCents = 0;
    let orderTrtTelehealthCents = 0;

    if (order.rxs.length > 0) {
      const { feeCents: shipFee, tier: shipTier } = getOtPrescriptionShippingCentsForOrder(order.rxs);
      orderShippingCents = shipFee;
      if (shipFee > 0) {
        subtotalShippingCents += shipFee;
        const shipLabel =
          shipTier === 'premium'
            ? 'Prescription shipping — NAD+/peptide/GLP-1 tier ($30)'
            : 'Prescription shipping — standard ($20)';
        shippingLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: shipLabel,
          feeCents: shipFee,
        });
      }

      if (isOtTestosteroneReplacementTherapyOrder(order.rxs)) {
        orderTrtTelehealthCents = OT_TRT_TELEHEALTH_FEE_CENTS;
        subtotalTrtTelehealthCents += OT_TRT_TELEHEALTH_FEE_CENTS;
        trtTelehealthLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: 'Telehealth visit — testosterone replacement therapy ($50)',
          feeCents: OT_TRT_TELEHEALTH_FEE_CENTS,
        });
      }
    }

    const approvalMode: 'async' | 'sync' = order.queuedForProviderAt ? 'async' : 'sync';
    const currentPaidAtDate = invMeta?.paidAt ?? null;
    const patientRxList = paidRxHistoryByPatient.get(order.patientId) ?? [];
    const priorPaidRx =
      currentPaidAtDate != null && invMeta
        ? findPriorPaidOtPrescriptionInvoice(
            patientRxList,
            invMeta.invoiceDbId,
            currentPaidAtDate,
          )
        : null;
    const doctorRxFee = getOtDoctorRxFeeCentsForSale({
      priorPaidPrescriptionInvoice: priorPaidRx,
      currentPaidAt: currentPaidAtDate,
      approvalMode,
    });
    const approvalFee = doctorRxFee.feeCents;
    const doctorRxFeeNote =
      doctorRxFee.waivedReason ??
      (approvalFee > 0 && priorPaidRx != null && doctorRxFee.daysSincePriorPaidRx != null
        ? `Full fee (${doctorRxFee.daysSincePriorPaidRx}d since prior paid Rx)`
        : approvalFee > 0 && priorPaidRx == null
          ? 'Full fee (no prior paid Rx in history)'
          : null);
    const medicationsList = order.rxs.map((rx) => `${rx.medName} ${rx.strength}`).join(', ');

    doctorLines.push({
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      orderDate,
      paidAt,
      patientName,
      patientId: order.patientId,
      providerName,
      providerId: order.providerId,
      medications: medicationsList,
      feeCents: approvalFee,
      approvalMode,
      doctorFeeWaivedReason: doctorRxFee.waivedReason,
    });

    let orderFulfillmentFeesCents = 0;
    if (invMeta?.lineItems != null) {
      const lines = parseInvoiceLineItemsJson(invMeta.lineItems);
      for (const li of lines) {
        const desc = li.description?.trim() ?? '';
        if (!desc) continue;
        if (!shouldCountAsFulfillmentLine(desc, order.rxs)) continue;
        const patientAmt = typeof li.amount === 'number' ? li.amount : 0;
        const fee = OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS;
        if (fee <= 0 && patientAmt <= 0) continue;
        orderFulfillmentFeesCents += fee;
        fulfillmentLines.push({
          orderId: order.id,
          invoiceDbId: invMeta.invoiceDbId,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: desc,
          patientLineAmountCents: patientAmt,
          feeCents: fee,
        });
      }
    }

    const grossResolved = invMeta
      ? resolveOtPatientGrossCents({
          invoiceDbId: invMeta.invoiceDbId,
          invoiceAmountPaid: invMeta.amountPaid,
          invoiceAmountDue: invMeta.amountDue,
          paymentNetCentsByInvoiceId: paymentNetByInvoiceId,
          invoiceGrossFallback: normalizeGrossCents,
        })
      : { cents: 0 as number, source: 'invoice_sync' as const };
    const patientGrossCents = grossResolved.cents;

    const stripeBillingNameMatch =
      invMeta && order.patient
        ? compareStripeBillingNameToPatient({
            stripeBillingName: stripeCustomerNameByInvoiceId.get(invMeta.invoiceDbId) ?? null,
            patientFirstName: safeDecryptName(order.patient.firstName),
            patientLastName: safeDecryptName(order.patient.lastName),
          })
        : 'unknown';
    const invoicePatientMatchesOrder = invMeta == null || invMeta.patientId === order.patientId;
    const saleMerchantCents = Math.round((patientGrossCents * OT_MERCHANT_PROCESSING_BPS) / 10_000);
    const salePlatformCents = Math.round((patientGrossCents * OT_PLATFORM_COMPENSATION_BPS) / 10_000);
    const pharmacyTotalForOrder =
      orderMedTotalCents + orderShippingCents + orderTrtTelehealthCents;

    const invDbId = invMeta?.invoiceDbId ?? null;
    const stripeInvId =
      invDbId != null ? (salesRepLookup.stripeByInvoiceDbId.get(invDbId) ?? null) : null;
    const comm =
      stripeInvId != null ? (salesRepLookup.commissionByStripeObjectId.get(stripeInvId) ?? null) : null;
    const salesRepCommissionCents = comm?.commissionAmountCents ?? 0;
    const salesRepId = comm?.salesRepId ?? null;
    const salesRepName =
      salesRepId != null
        ? (salesRepLookup.repLabelById.get(salesRepId) ?? `User #${salesRepId}`)
        : null;
    const ov = comm ? salesRepLookup.overrideBySourceEventId.get(comm.id) : undefined;
    const managerOverrideTotalCentsForOrder = ov?.totalCents ?? 0;
    const managerOverrideSummary = ov?.summary ?? null;

    const totalDeductionsForOrder =
      pharmacyTotalForOrder +
      approvalFee +
      orderFulfillmentFeesCents +
      saleMerchantCents +
      salePlatformCents +
      salesRepCommissionCents +
      managerOverrideTotalCentsForOrder;

    perSaleReconciliation.push({
      orderId: order.id,
      invoiceDbId: invMeta?.invoiceDbId ?? null,
      lifefileOrderId: order.lifefileOrderId,
      orderDate,
      paidAt,
      patientName,
      patientGrossCents,
      patientGrossSource: grossResolved.source,
      stripeBillingNameMatch,
      invoicePatientMatchesOrder,
      medicationsCostCents: orderMedTotalCents,
      shippingCents: orderShippingCents,
      trtTelehealthCents: orderTrtTelehealthCents,
      pharmacyTotalCents: pharmacyTotalForOrder,
      doctorApprovalCents: approvalFee,
      doctorRxFeeNominalCents: doctorRxFee.nominalFeeCents,
      doctorRxFeeWaivedCents: doctorRxFee.waivedAmountCents,
      doctorRxFeeDaysSincePrior: doctorRxFee.daysSincePriorPaidRx,
      doctorRxFeeNote: doctorRxFeeNote,
      fulfillmentFeesCents: orderFulfillmentFeesCents,
      merchantProcessingCents: saleMerchantCents,
      platformCompensationCents: salePlatformCents,
      salesRepCommissionCents,
      salesRepId,
      salesRepName,
      managerOverrideTotalCents: managerOverrideTotalCentsForOrder,
      managerOverrideSummary,
      totalDeductionsCents: totalDeductionsForOrder,
      clinicNetPayoutCents: patientGrossCents - totalDeductionsForOrder,
    });
  }

  perSaleReconciliation.sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.orderId - b.orderId;
  });

  const pharmacyTotal =
    subtotalMedicationsCents + subtotalShippingCents + subtotalTrtTelehealthCents;
  const asyncCount = doctorLines.filter((l) => l.approvalMode === 'async').length;
  const syncCount = doctorLines.filter((l) => l.approvalMode === 'sync').length;
  const doctorTotal = doctorLines.reduce((s, l) => s + l.feeCents, 0);
  const fulfillmentTotal = fulfillmentLines.reduce((s, l) => s + l.feeCents, 0);
  const merchantFee = perSaleReconciliation.reduce((s, r) => s + r.merchantProcessingCents, 0);
  const platformFee = perSaleReconciliation.reduce((s, r) => s + r.platformCompensationCents, 0);
  const salesRepCommissionTotalCents = perSaleReconciliation.reduce(
    (s, r) => s + r.salesRepCommissionCents,
    0,
  );
  const managerOverrideTotalCents = perSaleReconciliation.reduce(
    (s, r) => s + r.managerOverrideTotalCents,
    0,
  );
  const grandTotal =
    pharmacyTotal +
    doctorTotal +
    fulfillmentTotal +
    merchantFee +
    platformFee +
    salesRepCommissionTotalCents +
    managerOverrideTotalCents;
  const clinicNetPayoutCents = grossSalesCents - grandTotal;

  const nowIso = new Date().toISOString();

  return {
    pharmacy: {
      invoiceType: 'pharmacy',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: pharmacyLineItems,
      shippingLineItems,
      prescriptionFeeLineItems: [],
      trtTelehealthLineItems,
      subtotalMedicationsCents,
      subtotalShippingCents,
      subtotalPrescriptionFeesCents: 0,
      subtotalTrtTelehealthCents,
      totalCents: pharmacyTotal,
      orderCount: filteredOrders.length,
      vialCount: totalVials,
      missingPriceCount,
      estimatedPriceCount,
    },
    doctorApprovals: {
      invoiceType: 'doctor_approvals',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: doctorLines,
      asyncFeeCents: OT_RX_ASYNC_APPROVAL_FEE_CENTS,
      syncFeeCents: OT_RX_SYNC_APPROVAL_FEE_CENTS,
      asyncCount,
      syncCount,
      totalCents: doctorTotal,
    },
    fulfillment: {
      invoiceType: 'fulfillment',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: fulfillmentLines,
      totalCents: fulfillmentTotal,
    },
    merchantProcessing: {
      grossSalesCents,
      rateBps: OT_MERCHANT_PROCESSING_BPS,
      feeCents: merchantFee,
    },
    platformCompensation: {
      grossSalesCents,
      rateBps: OT_PLATFORM_COMPENSATION_BPS,
      feeCents: platformFee,
      invoiceCount: grossInvoicesCounted.size,
    },
    grandTotalCents: grandTotal,
    clinicNetPayoutCents,
    salesRepCommissionTotalCents,
    managerOverrideTotalCents,
    perSaleReconciliation,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function stripCsvBom(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

function escapeCSV(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function generateOtPharmacyCSV(invoice: OtPharmacyInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT (OVERTIME) PHARMACY PRODUCTS INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push(`Generated,${new Date(invoice.invoiceDate).toLocaleString('en-US')}`);
  lines.push(`Missing internal prices (line items),${invoice.missingPriceCount}`);
  lines.push(`Estimated internal prices — name match (qty),${invoice.estimatedPriceCount}`);
  lines.push('');

  lines.push('=== MEDICATION LINE ITEMS ===');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medication', 'Strength', 'Vial', 'Qty', 'Unit', 'Line', 'Priced']
      .map(escapeCSV)
      .join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.lifefileOrderId ?? '',
        li.patientName,
        li.providerName,
        li.medicationName,
        li.strength,
        li.vialSize,
        li.quantity,
        `$${centsToDisplay(li.unitPriceCents)}`,
        `$${centsToDisplay(li.lineTotalCents)}`,
        li.pricingStatus,
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`Medications Subtotal,,,,,,,,,,$${centsToDisplay(invoice.subtotalMedicationsCents)}`);
  if (invoice.shippingLineItems.length > 0) {
    lines.push('');
    lines.push('=== PRESCRIPTION SHIPPING (ONE FEE PER ORDER) ===');
    lines.push(['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(','));
    for (const sl of invoice.shippingLineItems) {
      lines.push(
        [
          new Date(sl.orderDate).toLocaleDateString('en-US'),
          sl.orderId,
          sl.lifefileOrderId ?? '',
          sl.patientName,
          sl.description,
          `$${centsToDisplay(sl.feeCents)}`,
        ]
          .map(escapeCSV)
          .join(','),
      );
    }
    lines.push(`Prescription shipping subtotal,,,,,$${centsToDisplay(invoice.subtotalShippingCents)}`);
  }
  if (invoice.prescriptionFeeLineItems.length > 0) {
    lines.push('');
    lines.push('=== PRESCRIPTION FEE ($30 PER ORDER) ===');
    lines.push(['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(','));
    for (const sl of invoice.prescriptionFeeLineItems) {
      lines.push(
        [
          new Date(sl.orderDate).toLocaleDateString('en-US'),
          sl.orderId,
          sl.lifefileOrderId ?? '',
          sl.patientName,
          sl.description,
          `$${centsToDisplay(sl.feeCents)}`,
        ]
          .map(escapeCSV)
          .join(','),
      );
    }
    lines.push(`Prescription fees subtotal,,,,,$${centsToDisplay(invoice.subtotalPrescriptionFeesCents)}`);
  }
  if (invoice.trtTelehealthLineItems.length > 0) {
    lines.push('');
    lines.push('=== TRT TELEHEALTH ($50 PER TRT ORDER) ===');
    lines.push(['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(','));
    for (const sl of invoice.trtTelehealthLineItems) {
      lines.push(
        [
          new Date(sl.orderDate).toLocaleDateString('en-US'),
          sl.orderId,
          sl.lifefileOrderId ?? '',
          sl.patientName,
          sl.description,
          `$${centsToDisplay(sl.feeCents)}`,
        ]
          .map(escapeCSV)
          .join(','),
      );
    }
    lines.push(`TRT telehealth subtotal,,,,,$${centsToDisplay(invoice.subtotalTrtTelehealthCents)}`);
  }
  lines.push('');
  lines.push(`PHARMACY TOTAL,,,,,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtDoctorApprovalsCSV(invoice: OtDoctorApprovalsInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT DOCTOR / RX FEE ($30 async or sync; $0 if paid Rx within 90d of prior at this clinic)');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push(`Async (queue) rate,$${centsToDisplay(invoice.asyncFeeCents)}`);
  lines.push(`Sync rate,$${centsToDisplay(invoice.syncFeeCents)}`);
  lines.push(`Async count,${invoice.asyncCount}`);
  lines.push(`Sync count,${invoice.syncCount}`);
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medications', 'Mode', 'Fee', 'Note']
      .map(escapeCSV)
      .join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.lifefileOrderId ?? '',
        li.patientName,
        li.providerName,
        li.medications,
        li.approvalMode === 'async' ? 'async' : 'sync',
        `$${centsToDisplay(li.feeCents)}`,
        li.doctorFeeWaivedReason ?? '',
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`TOTAL,,,,,,,$${centsToDisplay(invoice.totalCents)},`);
  return lines.join('\r\n');
}

export function generateOtFulfillmentCSV(invoice: OtFulfillmentInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT FULFILLMENT (NON-PHARMACY STRIPE LINES) INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'Invoice ID', 'Patient', 'Description', 'Patient line $', 'Fee'].map(escapeCSV).join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.invoiceDbId,
        li.patientName,
        li.description,
        `$${centsToDisplay(li.patientLineAmountCents)}`,
        `$${centsToDisplay(li.feeCents)}`,
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`TOTAL,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtPerSaleReconciliationCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const lines: string[] = [
    BOM,
    'OT / EONPRO PER-SALE RECONCILIATION (ONE ROW PER ORDER / SALE)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    `Generated,${new Date(data.pharmacy.invoiceDate).toLocaleString('en-US')}`,
    `Sales count,${data.perSaleReconciliation.length}`,
    '',
    'Merchant/platform are computed per sale (rounded) then summed — matches period summary totals.',
    'Sales rep + manager amounts come from the commission ledger (Stripe invoice id match).',
    'Doctor / Rx: $30 async/sync; charged only on new sale or if ≥90 days since prior paid Rx at this clinic; otherwise waived ($0).',
    '',
  ];
  const header = [
    'Paid (ET)',
    'Order ID',
    'Invoice DB id',
    'LF Order ID',
    'Patient',
    'Patient gross',
    'Medications cost',
    'Shipping',
    'TRT telehealth ($50)',
    'Pharmacy total',
    'Doctor / Rx fee (charged)',
    'Doctor / Rx nominal',
    'Doctor / Rx waived',
    'Days since prior paid Rx',
    'Doctor / Rx note',
    'Fulfillment fees',
    'Merchant 4%',
    'EONPro 10%',
    'Attributed sales rep',
    'Sales rep commission',
    'Manager oversight total',
    'Manager oversight detail',
    'Total deductions',
    'Net to OT clinic',
    'Gross source',
    'Stripe billing name vs profile',
    'Invoice patient = order patient',
  ];
  lines.push(header.map(escapeCSV).join(','));
  for (const r of data.perSaleReconciliation) {
    const paidEt = r.paidAt
      ? new Date(r.paidAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        })
      : new Date(r.orderDate).toLocaleDateString('en-US');
    lines.push(
      [
        paidEt,
        r.orderId,
        r.invoiceDbId ?? '',
        r.lifefileOrderId ?? '',
        r.patientName,
        `$${centsToDisplay(r.patientGrossCents)}`,
        `$${centsToDisplay(r.medicationsCostCents)}`,
        `$${centsToDisplay(r.shippingCents)}`,
        `$${centsToDisplay(r.trtTelehealthCents)}`,
        `$${centsToDisplay(r.pharmacyTotalCents)}`,
        `$${centsToDisplay(r.doctorApprovalCents)}`,
        `$${centsToDisplay(r.doctorRxFeeNominalCents)}`,
        `$${centsToDisplay(r.doctorRxFeeWaivedCents)}`,
        r.doctorRxFeeDaysSincePrior != null ? String(r.doctorRxFeeDaysSincePrior) : '',
        r.doctorRxFeeNote ?? '',
        `$${centsToDisplay(r.fulfillmentFeesCents)}`,
        `$${centsToDisplay(r.merchantProcessingCents)}`,
        `$${centsToDisplay(r.platformCompensationCents)}`,
        r.salesRepName ?? '',
        `$${centsToDisplay(r.salesRepCommissionCents)}`,
        `$${centsToDisplay(r.managerOverrideTotalCents)}`,
        r.managerOverrideSummary ?? '',
        `$${centsToDisplay(r.totalDeductionsCents)}`,
        `$${centsToDisplay(r.clinicNetPayoutCents)}`,
        r.patientGrossSource,
        r.stripeBillingNameMatch,
        r.invoicePatientMatchesOrder ? 'yes' : 'no',
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  const sum = (pick: (row: OtPerSaleReconciliationLine) => number) =>
    data.perSaleReconciliation.reduce((s, row) => s + pick(row), 0);
  lines.push('');
  lines.push(
    [
      'COLUMN TOTALS (check vs summary)',
      '',
      '',
      '',
      '',
      `$${centsToDisplay(sum((x) => x.patientGrossCents))}`,
      `$${centsToDisplay(sum((x) => x.medicationsCostCents))}`,
      `$${centsToDisplay(sum((x) => x.shippingCents))}`,
      `$${centsToDisplay(sum((x) => x.trtTelehealthCents))}`,
      `$${centsToDisplay(sum((x) => x.pharmacyTotalCents))}`,
      `$${centsToDisplay(sum((x) => x.doctorApprovalCents))}`,
      `$${centsToDisplay(sum((x) => x.doctorRxFeeNominalCents))}`,
      `$${centsToDisplay(sum((x) => x.doctorRxFeeWaivedCents))}`,
      '',
      '',
      `$${centsToDisplay(sum((x) => x.fulfillmentFeesCents))}`,
      `$${centsToDisplay(sum((x) => x.merchantProcessingCents))}`,
      `$${centsToDisplay(sum((x) => x.platformCompensationCents))}`,
      '',
      `$${centsToDisplay(sum((x) => x.salesRepCommissionCents))}`,
      `$${centsToDisplay(sum((x) => x.managerOverrideTotalCents))}`,
      '',
      `$${centsToDisplay(sum((x) => x.totalDeductionsCents))}`,
      `$${centsToDisplay(sum((x) => x.clinicNetPayoutCents))}`,
      '',
      '',
      '',
    ]
      .map(escapeCSV)
      .join(','),
  );
  lines.push(
    [
      'Summary reconciliation (same period)',
      '',
      '',
      '',
      '',
      `$${centsToDisplay(data.platformCompensation.grossSalesCents)}`,
      '',
      '',
      '',
      `$${centsToDisplay(data.pharmacy.totalCents)}`,
      `$${centsToDisplay(data.doctorApprovals.totalCents)}`,
      `$${centsToDisplay(sum((x) => x.doctorRxFeeNominalCents))}`,
      `$${centsToDisplay(sum((x) => x.doctorRxFeeWaivedCents))}`,
      '',
      '',
      `$${centsToDisplay(data.fulfillment.totalCents)}`,
      `$${centsToDisplay(data.merchantProcessing.feeCents)}`,
      `$${centsToDisplay(data.platformCompensation.feeCents)}`,
      '',
      `$${centsToDisplay(data.salesRepCommissionTotalCents)}`,
      `$${centsToDisplay(data.managerOverrideTotalCents)}`,
      '',
      `$${centsToDisplay(data.grandTotalCents)}`,
      `$${centsToDisplay(data.clinicNetPayoutCents)}`,
      '',
      '',
      '',
    ]
      .map(escapeCSV)
      .join(','),
  );
  return lines.join('\r\n');
}

export function generateOtCombinedCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const invCount = data.platformCompensation.invoiceCount;
  const lines: string[] = [
    BOM,
    'OT / EONPRO CLINIC RECONCILIATION (EONPro holds patient payments; allocations determine OT clinic payout)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    '',
    `Patient gross (paid invoices: ${invCount}),$${centsToDisplay(data.platformCompensation.grossSalesCents)}`,
    `Less — Pharmacy (meds + shipping + TRT telehealth when applicable),$${centsToDisplay(data.pharmacy.totalCents)}`,
    `Less — Doctor / Rx fee ($30; $0 refill <90d after prior paid Rx),$${centsToDisplay(data.doctorApprovals.totalCents)}`,
    `Less — Fulfillment (other Stripe lines),$${centsToDisplay(data.fulfillment.totalCents)}`,
    `Less — Merchant processing (${data.merchantProcessing.rateBps / 100}% of gross),$${centsToDisplay(data.merchantProcessing.feeCents)}`,
    `Less — EONPro platform (${data.platformCompensation.rateBps / 100}% of gross),$${centsToDisplay(data.platformCompensation.feeCents)}`,
    `Less — Sales rep commission (ledger),$${centsToDisplay(data.salesRepCommissionTotalCents)}`,
    `Less — Manager oversight / override (ledger),$${centsToDisplay(data.managerOverrideTotalCents)}`,
    '',
    `Total deductions from gross,$${centsToDisplay(data.grandTotalCents)}`,
    `Net payable to OT clinic,$${centsToDisplay(data.clinicNetPayoutCents)}`,
    '',
    '--- PER-SALE: FULL BREAKDOWN (EVERY SALE) ---',
    stripCsvBom(generateOtPerSaleReconciliationCSV(data)),
    '',
    '--- DETAIL: PHARMACY ---',
    stripCsvBom(generateOtPharmacyCSV(data.pharmacy)),
    '',
    '--- DETAIL: DOCTOR APPROVALS ---',
    stripCsvBom(generateOtDoctorApprovalsCSV(data.doctorApprovals)),
    '',
    '--- DETAIL: FULFILLMENT ---',
    stripCsvBom(generateOtFulfillmentCSV(data.fulfillment)),
  ];
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// PDF — compact summary statement (all sections)
// ---------------------------------------------------------------------------

let cachedLogo: Uint8Array | null = null;

async function loadLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', BRAND.logos.eonproLogoPdf.replace(/^\//, ''))));
    return cachedLogo;
  } catch {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (baseUrl) {
      try {
        const url = baseUrl.startsWith('http') ? `${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}` : `https://${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}`;
        const res = await fetch(url);
        if (res.ok) {
          cachedLogo = new Uint8Array(await res.arrayBuffer());
          return cachedLogo;
        }
      } catch { /* noop */ }
    }
  }
  return null;
}

function sanitizeForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u02BB\u02BC\u02BD\u02BE\u02BF]/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export async function generateOtSummaryPDF(data: OtDailyInvoices): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  try {
    const b = await loadLogoBytes();
    if (b) logo = await doc.embedPng(b);
  } catch {
    /* skip */
  }

  const PW = 612;
  const PH = 792;
  const M = 48;
  let page = doc.addPage([PW, PH]);
  let y = PH - M;

  const dark = rgb(0.12, 0.12, 0.12);
  const mid = rgb(0.4, 0.4, 0.4);
  const green = rgb(0.06, 0.45, 0.31);

  const draw = (s: string, x: number, size: number, f = font, c = dark) => {
    page.drawText(sanitizeForPdf(s), { x, y, size, font: f, color: c });
  };

  if (logo) {
    const sc = 32 / logo.height;
    page.drawImage(logo, { x: M, y: y - 8, width: logo.width * sc, height: 32 });
    y -= 40;
  } else {
    y -= 8;
  }

  draw('OT / OVERTIME — CLINIC RECONCILIATION', M, 15, fontBold, green);
  y -= 20;
  draw('EONPro collects patient payments; allocations below determine OT clinic payout.', M, 9, font, mid);
  y -= 22;
  draw(data.pharmacy.clinicName, M, 11, fontBold);
  y -= 16;
  const period = `${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} — ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`;
  draw(period, M, 9, font, mid);
  y -= 28;

  const invN = data.platformCompensation.invoiceCount;
  const rows: [string, string][] = [
    [`Patient gross (${invN} paid invoices)`, `$${centsToDisplay(data.platformCompensation.grossSalesCents)}`],
    [
      'Less — Pharmacy (medications + shipping + TRT telehealth if applicable)',
      `$${centsToDisplay(data.pharmacy.totalCents)}`,
    ],
    [
      'Less — Doctor / Rx fee ($30; $0 refill <90d after prior paid Rx)',
      `$${centsToDisplay(data.doctorApprovals.totalCents)}`,
    ],
    ['Less — Fulfillment (other Stripe lines)', `$${centsToDisplay(data.fulfillment.totalCents)}`],
    [
      `Less — Merchant processing (${data.merchantProcessing.rateBps / 100}% of gross)`,
      `$${centsToDisplay(data.merchantProcessing.feeCents)}`,
    ],
    [
      `Less — EONPro platform (${data.platformCompensation.rateBps / 100}% of gross)`,
      `$${centsToDisplay(data.platformCompensation.feeCents)}`,
    ],
    ['Less — Sales rep commission (ledger)', `$${centsToDisplay(data.salesRepCommissionTotalCents)}`],
    ['Less — Manager oversight / override (ledger)', `$${centsToDisplay(data.managerOverrideTotalCents)}`],
  ];

  for (const [label, amt] of rows) {
    draw(label, M, 10, font);
    draw(amt, PW - M - 90, 10, fontBold);
    y -= 18;
  }

  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: green });
  y -= 20;
  draw('Total deductions from gross', M, 11, fontBold, dark);
  draw(`$${centsToDisplay(data.grandTotalCents)}`, PW - M - 100, 11, fontBold, dark);
  y -= 22;
  const netColor = data.clinicNetPayoutCents < 0 ? rgb(0.65, 0.12, 0.12) : green;
  draw('Net payable to OT clinic', M, 12, fontBold, netColor);
  draw(`$${centsToDisplay(data.clinicNetPayoutCents)}`, PW - M - 100, 12, fontBold, netColor);
  y -= 36;
  draw(`Pharmacy orders: ${data.pharmacy.orderCount} · Vials: ${data.pharmacy.vialCount}`, M, 8, font, mid);
  y -= 14;
  draw(
    `Approvals: ${data.doctorApprovals.asyncCount} async · ${data.doctorApprovals.syncCount} sync`,
    M,
    8,
    font,
    mid,
  );
  y -= 14;
  draw(
    `Unpriced medication qty: ${data.pharmacy.missingPriceCount} · Name-estimated qty: ${data.pharmacy.estimatedPriceCount}`,
    M,
    8,
    font,
    mid,
  );
  y -= 16;
  draw(
    `Per-sale breakdown: export Combined CSV or Per-sale CSV (${data.perSaleReconciliation.length} sales).`,
    M,
    8,
    font,
    mid,
  );

  return doc.save();
}
