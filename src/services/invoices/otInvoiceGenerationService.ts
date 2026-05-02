/**
 * OT (Overtime / ot.eonpro.io) — reconciliation statement: EONPro collects patient payments
 * (Stripe gross), then this breakdown allocates pharmacy cost, shipping, TRT telehealth ($50 when applicable),
 * a combined doctor/Rx fee ($30 async · $50 sync testosterone cypionate; waived if refill <90d after prior paid Rx), fulfillment lines,
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
  effectiveOtPharmacyBillQuantity,
  getOtPrescriptionShippingCentsForOrder,
  getOtDoctorRxFeeCentsForSale,
  findPriorPaidOtPrescriptionInvoice,
  isOtTestosteroneReplacementTherapyOrder,
  OT_RX_ASYNC_APPROVAL_FEE_CENTS,
  OT_RX_SYNC_APPROVAL_FEE_CENTS,
  OT_TRT_TELEHEALTH_FEE_CENTS,
  getOtDoctorApprovalModeFromRxs,
  classifyOtNonPharmacyChargeLine,
  OT_BLOODWORK_DOCTOR_FEE_CENTS,
  getOtProductFamilyKeysFromText,
  type OtNonPharmacyChargeKind,
} from '@/lib/invoices/ot-pricing';
import { BRAND } from '@/lib/constants/brand-assets';
import {
  compareStripeBillingNameToPatient,
  resolveOtPatientGrossCents,
} from '@/lib/invoices/ot-stripe-sale-alignment';
import {
  computeOtAllocationOverrideTotals,
  getOtTieredNewSaleRateBps,
  type OtAllocationOverridePayload,
  type OtAllocationOverrideStatus,
  type OtAllocationOverrideTotals,
} from '@/services/invoices/otAllocationOverrideTypes';
import {
  buildOtNonRxReconciliation,
  type OtNonRxReconciliationLine,
} from '@/services/invoices/otNonRxReconciliationService';
import {
  findOtPackageMatchByPatientGross,
  findOtPackageMatchForInvoiceLine,
  OT_PACKAGE_TIER_LABELS,
} from '@/lib/invoices/ot-package-catalog';

const CLINIC_TZ = 'America/New_York';

/** Thrown when OT subdomain clinic is missing — maps to a clear API response (not a generic 500). */
export class OtInvoiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtInvoiceConfigurationError';
  }
}

/**
 * OT reconciliation is patient-centric: include any invoice for OT patients. Requiring
 * `Invoice.clinicId ∈ { ot, null }` dropped rows where the invoice row still pointed at a platform / legacy
 * clinic id while the patient already belonged to OT — cash (Payment) matched but pharmacy stayed empty.
 */
function otInvoicePatientClinicScope(clinicId: number) {
  return { patient: { clinicId } };
}

/**
 * All settled payments for OT clinic patients in the window (Eastern `paidAt`, or `createdAt` if `paidAt` null).
 * Includes consults, partial invoices, etc. — not limited to `prescriptionProcessed` invoices.
 */
async function loadOtSucceededPaymentsForPeriod(
  clinicId: number,
  periodStart: Date,
  periodEnd: Date
): Promise<
  {
    id: number;
    amount: number;
    refundedAmount: number | null;
    paidAt: Date | null;
    createdAt: Date;
    patientId: number;
    invoiceId: number | null;
    description: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
  }[]
> {
  const inPeriod = {
    OR: [
      { paidAt: { gte: periodStart, lte: periodEnd } },
      { AND: [{ paidAt: null }, { createdAt: { gte: periodStart, lte: periodEnd } }] },
    ],
  };
  try {
    return await basePrisma.payment.findMany({
      where: {
        AND: [
          { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          otInvoicePatientClinicScope(clinicId),
          inPeriod,
        ],
      },
      select: {
        id: true,
        amount: true,
        refundedAmount: true,
        paidAt: true,
        createdAt: true,
        patientId: true,
        invoiceId: true,
        description: true,
        stripePaymentIntentId: true,
        stripeChargeId: true,
      },
      orderBy: [{ id: 'asc' }],
    });
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    logger.warn('OT invoice: primary payment query failed; falling back to SUCCEEDED-only', {
      clinicId,
      message: msg,
    });
    const rows = await basePrisma.payment.findMany({
      where: {
        AND: [{ status: 'SUCCEEDED' }, otInvoicePatientClinicScope(clinicId), inPeriod],
      },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        createdAt: true,
        patientId: true,
        invoiceId: true,
        description: true,
        stripePaymentIntentId: true,
        stripeChargeId: true,
      },
      orderBy: [{ id: 'asc' }],
    });
    return rows.map((r) => ({ ...r, refundedAmount: null as number | null }));
  }
}

/** Merges duplicate `Rx` rows (same key/name/strength/form) from Lifefile into one invoice line. */
function consolidateOtOrderRxs(
  rxs: {
    medicationKey: string;
    medName: string;
    strength: string;
    form: string;
    quantity: string;
  }[]
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
  /** Schedule rate before refill waiver ($30 async · $50 sync). */
  nominalFeeCents: number;
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
  /**
   * Human-readable description of what the patient paid for. Derived from the
   * order's primary medication (name + strength + form), with a fallback to the
   * concatenated invoice line item descriptions when the order has none.
   * Surfaced on the manual reconciliation editor row header so admins can see
   * the package without expanding every row.
   */
  productDescription: string | null;
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
  /**
   * True when the patient had a prior paid Rx invoice at this clinic within
   * the last 30 days (window matches stakeholder rule for new vs rebill
   * commission rate). False on first-ever paid Rx or when prior > 30 days.
   * Drives the auto commission rate in `buildDefaultOverridePayload`:
   * 1% (REBILL) when true, 8% (NEW) when false.
   */
  isRebill: boolean;
  /**
   * True when every non-discount Stripe invoice line item on this sale
   * classifies as bloodwork (per `classifyOtNonPharmacyChargeLine`). Set
   * even when the Lifefile order has phantom Rx records attached, so the
   * manual reconciliation editor can seed bloodwork defaults (no shipping,
   * no TRT, no fulfillment, $10 doctor fee) regardless of what's on the
   * order shell.
   */
  isBloodworkOnly: boolean;
  /**
   * Structured Stripe invoice line items (description + amountCents),
   * filtered to remove discount / refund / credit / adjustment rows.
   * Used by `buildDefaultOverridePayload` to detect multi-package sales
   * — each line is matched to a catalog package via
   * `findOtPackageMatchForInvoiceLine` so the editor pre-fills every
   * component instead of just one. Empty array when the invoice has no
   * line items synced.
   */
  invoiceLineItems: Array<{ description: string; amountCents: number }>;
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

/** Every succeeded (or partially refunded) `Payment` for OT patients in the period — cash collected (consult + Rx + all). */
export interface OtPaymentCollectionRow {
  paymentId: number;
  /** When the payment completed; null if only `recordedAt` is set in DB. */
  paidAt: string | null;
  /** `Payment.createdAt` — useful when `paidAt` is missing. */
  recordedAt: string;
  amountCents: number;
  /** After subtracting `refundedAmount` when present. */
  netCollectedCents: number;
  /** `Payment.refundedAmount` (cumulative cents refunded across all refunds on the charge); 0 when none. */
  refundedAmountCents: number;
  /** True when `refundedAmount >= amount` (i.e. status went to REFUNDED, not PARTIALLY_REFUNDED). */
  isFullyRefunded: boolean;
  patientId: number;
  patientName: string;
  description: string | null;
  invoiceId: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
}

/**
 * One row per refunded `Payment` (full or partial) in the period.
 *
 * The OT page treats refunds as a first-class category so they appear on the
 * report (a tile + tab), not just baked silently into `Cash collected (net)`.
 * `refundedAmountCents` is what we subtract from gross to get the "Cash
 * collected (net)" total; `paymentsCollectedNetCents` stays correct.
 */
export interface OtRefundLineItem {
  paymentId: number;
  paidAt: string | null;
  refundedAt: string | null;
  patientId: number;
  patientName: string;
  amountCents: number;
  refundedAmountCents: number;
  isFullyRefunded: boolean;
  description: string | null;
  invoiceId: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
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
  /** All DB `Payment` rows (OT patients) settled in the period — source of truth for cash in. */
  paymentCollections: OtPaymentCollectionRow[];
  /** Sum of `netCollectedCents` across `paymentCollections` (== gross − refunds). */
  paymentsCollectedNetCents: number;
  /** Sum of `amountCents` across `paymentCollections` (before refund subtraction). */
  paymentsCollectedGrossCents: number;
  /** Sum of `refundedAmountCents` across `paymentCollections` — equals gross − net. */
  refundsTotalCents: number;
  /** One row per refunded payment (full or partial) in the period; sorted by refund time. */
  refundLineItems: OtRefundLineItem[];
  /** Gross from matched prescription invoices only (subset of cash); for comparison to Stripe-matched Rx workflow. */
  matchedPrescriptionInvoiceGrossCents: number;
  /** When true, 4%/10% fees use `paymentsCollectedNetCents`; when false, per matched-sale rounding (legacy). */
  feesUseCashCollectedBasis: boolean;
  /**
   * Payments in the period that did not map to a loaded Rx order’s invoice for COGS (investigation / admin).
   * When no pharmacy rows loaded, this equals `paymentCollections`.
   */
  paymentsWithoutPharmacyCogs: OtPaymentCollectionRow[];
  /**
   * Stripe invoice lines for payments tied to invoices that are **not** the Rx-order invoice used for pharmacy COGS
   * (e.g. standalone bloodwork $180, consults). Explains many “unmapped” cash rows.
   */
  nonRxChargeLineItems: OtNonRxChargeLineItem[];
  /** Count of period `Payment` rows whose `invoiceId` is one of those non-Rx invoices we loaded. */
  nonRxExplainedPaymentCount: number;
  /**
   * One editable disposition row per non-Rx charge in the period. Built from
   * `paymentCollections` minus fully-refunded payments and minus payments
   * already attributed to pharmacy COGS. Sales-rep commission and manager
   * override columns are pre-filled from the `SalesRepCommissionEvent` ledger
   * when the row is keyed off an invoice (admin can override per-row in the
   * editor). Sums into the period grand total alongside `perSaleReconciliation`.
   */
  nonRxReconciliation: OtNonRxReconciliationLine[];
}

export type { OtNonRxReconciliationLine };

export interface OtNonRxChargeLineItem {
  invoiceDbId: number;
  patientId: number;
  patientName: string;
  paidAt: string | null;
  description: string;
  lineAmountCents: number;
  chargeKind: OtNonPharmacyChargeKind;
}

interface RawInvoiceLine {
  description?: string;
  amount?: number;
  quantity?: number;
  /**
   * Stripe product ID (`prod_…`) when the line item was synced from a Stripe
   * invoice. May be absent on legacy / hand-built invoices. Used by the
   * rebill detector to recognize the same product across description
   * variations.
   */
  stripeProductId?: string;
  /** Stripe price ID (`price_…`) — same use case. */
  stripePriceId?: string;
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
      stripeProductId:
        typeof o.stripeProductId === 'string'
          ? o.stripeProductId
          : typeof o.productId === 'string'
            ? o.productId
            : typeof o.product === 'string'
              ? o.product
              : undefined,
      stripePriceId:
        typeof o.stripePriceId === 'string'
          ? o.stripePriceId
          : typeof o.priceId === 'string'
            ? o.priceId
            : typeof o.price === 'string'
              ? o.price
              : undefined,
    };
  });
}

function safeDecryptName(encrypted: string | null | undefined): string {
  if (encrypted == null) return '';
  try {
    return decryptPHI(encrypted) ?? encrypted;
  } catch {
    return encrypted;
  }
}

function formatPatientName(patient: {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}): string {
  const first = safeDecryptName(patient.firstName).trim();
  const last = safeDecryptName(patient.lastName).trim();
  const parts = [last, first].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(', ') : 'Patient';
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
  patientIds: number[]
): Promise<Map<number, { id: number; paidAt: Date }[]>> {
  const map = new Map<number, { id: number; paidAt: Date }[]>();
  if (patientIds.length === 0) return map;
  const rows = await basePrisma.invoice.findMany({
    where: {
      patientId: { in: patientIds },
      ...otInvoicePatientClinicScope(clinicId),
      prescriptionProcessed: true,
      paidAt: { not: null },
      status: { notIn: ['VOID', 'REFUNDED'] },
    },
    select: { id: true, patientId: true, paidAt: true, amountPaid: true, amountDue: true },
    orderBy: [{ patientId: 'asc' }, { paidAt: 'asc' }, { id: 'asc' }],
  });
  for (const row of rows) {
    if (!row.paidAt) continue;
    if (normalizeGrossCents({ amountPaid: row.amountPaid, amountDue: row.amountDue }) <= 0)
      continue;
    const list = map.get(row.patientId) ?? [];
    list.push({ id: row.id, paidAt: row.paidAt });
    map.set(row.patientId, list);
  }
  return map;
}

async function loadOtSalesRepCommissionLookup(
  clinicId: number,
  invoiceDbIds: number[]
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
    return {
      stripeByInvoiceDbId,
      commissionByStripeObjectId,
      overrideBySourceEventId,
      repLabelById,
    };
  }

  const invoices = await basePrisma.invoice.findMany({
    where: { id: { in: invoiceDbIds } },
    select: { id: true, stripeInvoiceId: true },
  });
  for (const inv of invoices) {
    stripeByInvoiceDbId.set(inv.id, inv.stripeInvoiceId);
  }

  const stripeIds = [
    ...new Set(invoices.map((i) => i.stripeInvoiceId).filter((x): x is string => !!x)),
  ];
  if (stripeIds.length === 0) {
    return {
      stripeByInvoiceDbId,
      commissionByStripeObjectId,
      overrideBySourceEventId,
      repLabelById,
    };
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

/**
 * One paid-invoice signature in a patient's purchase history. Used by the
 * rebill detector to decide whether the current sale is a NEW (8% rep
 * commission) or REBILL (1%) — a rebill is **any prior paid invoice with
 * an overlapping product signature**.
 */
export interface OtPatientPurchaseSignature {
  invoiceId: number;
  paidAt: Date;
  /** Drug family tokens (e.g. 'sermorelin', 'tirzepatide', 'nad'). */
  productFamilies: Set<string>;
  /** Stripe product IDs (`prod_…`) when the invoice line items carry them. */
  stripeProductIds: Set<string>;
  /** Stripe price IDs (`price_…`) — secondary signal. */
  stripePriceIds: Set<string>;
  /**
   * Per-line charge classifications: 'rx' for prescription rows, plus
   * 'bloodwork' / 'consult' / 'other' for non-Rx lines. Used so the rebill
   * detector can match by chargeKind on the non-Rx side (Bloodwork in March
   * + Bloodwork in April → April is rebill).
   */
  chargeKinds: Set<'rx' | 'bloodwork' | 'consult' | 'other'>;
}

/**
 * Load every paid invoice ever for the given OT-clinic patients, and derive
 * a product signature for each (drug families + Stripe product IDs +
 * chargeKinds). Used by the rebill detector for both Rx and non-Rx sides.
 *
 * Returned map key = patientId, value = chronologically-sorted (oldest
 * first) array of signatures. Skips voided / fully-refunded invoices.
 */
async function loadOtPatientPurchaseHistory(
  clinicId: number,
  patientIds: number[]
): Promise<Map<number, OtPatientPurchaseSignature[]>> {
  const map = new Map<number, OtPatientPurchaseSignature[]>();
  if (patientIds.length === 0) return map;

  /**
   * Pull all paid invoices for these patients (no time filter — "any prior"
   * per stakeholder rule). Include line items + the order's Rx list so we
   * can extract drug families from both sources.
   */
  const invoices = await basePrisma.invoice.findMany({
    where: {
      patientId: { in: patientIds },
      ...otInvoicePatientClinicScope(clinicId),
      paidAt: { not: null },
      status: { notIn: ['VOID', 'REFUNDED'] },
    },
    select: {
      id: true,
      patientId: true,
      paidAt: true,
      lineItems: true,
      orderId: true,
    },
    orderBy: [{ patientId: 'asc' }, { paidAt: 'asc' }, { id: 'asc' }],
  });
  if (invoices.length === 0) return map;

  /** Pull Rx items for any invoice that has an attached order. */
  const orderIds = [...new Set(invoices.map((i) => i.orderId).filter((x): x is number => !!x))];
  const orderRxs =
    orderIds.length > 0
      ? await basePrisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, rxs: { select: { medName: true, medicationKey: true } } },
        })
      : [];
  const rxsByOrderId = new Map<number, { medName: string; medicationKey: string }[]>();
  for (const o of orderRxs) rxsByOrderId.set(o.id, o.rxs);

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const productFamilies = new Set<string>();
    const stripeProductIds = new Set<string>();
    const stripePriceIds = new Set<string>();
    const chargeKinds = new Set<'rx' | 'bloodwork' | 'consult' | 'other'>();

    /** Drug families + chargeKinds from Stripe invoice line items. */
    const lines = parseInvoiceLineItemsJson(inv.lineItems);
    for (const li of lines) {
      const desc = li.description?.trim() ?? '';
      if (li.stripeProductId) stripeProductIds.add(li.stripeProductId);
      if (li.stripePriceId) stripePriceIds.add(li.stripePriceId);
      if (desc) {
        for (const fam of getOtProductFamilyKeysFromText(desc)) {
          productFamilies.add(fam);
        }
        const amt = typeof li.amount === 'number' ? li.amount : 0;
        const kind = classifyOtNonPharmacyChargeLine(desc, amt);
        chargeKinds.add(kind);
      }
    }

    /**
     * Drug families from the order's Rx list — covers cases where the
     * invoice line description is generic (e.g. "Quarterly subscription")
     * but the actual Rx data names the drug.
     */
    if (inv.orderId != null) {
      const rxs = rxsByOrderId.get(inv.orderId) ?? [];
      for (const rx of rxs) {
        for (const fam of getOtProductFamilyKeysFromText(`${rx.medName} ${rx.medicationKey}`)) {
          productFamilies.add(fam);
        }
        if (rxs.length > 0) chargeKinds.add('rx');
      }
    }

    const list = map.get(inv.patientId) ?? [];
    list.push({
      invoiceId: inv.id,
      paidAt: inv.paidAt,
      productFamilies,
      stripeProductIds,
      stripePriceIds,
      chargeKinds,
    });
    map.set(inv.patientId, list);
  }
  return map;
}

/**
 * Build the signature for the *current* sale — same shape as a history entry,
 * derived from the current Rx list + invoice line items. Used to compare
 * against prior history for rebill detection.
 */
function buildOtCurrentSaleSignature(args: {
  rxs: ReadonlyArray<{ medName: string; medicationKey: string }>;
  invoiceLines: ReadonlyArray<RawInvoiceLine>;
}): {
  productFamilies: Set<string>;
  stripeProductIds: Set<string>;
  stripePriceIds: Set<string>;
  chargeKinds: Set<'rx' | 'bloodwork' | 'consult' | 'other'>;
} {
  const productFamilies = new Set<string>();
  const stripeProductIds = new Set<string>();
  const stripePriceIds = new Set<string>();
  const chargeKinds = new Set<'rx' | 'bloodwork' | 'consult' | 'other'>();
  for (const rx of args.rxs) {
    for (const fam of getOtProductFamilyKeysFromText(`${rx.medName} ${rx.medicationKey}`)) {
      productFamilies.add(fam);
    }
  }
  if (args.rxs.length > 0) chargeKinds.add('rx');
  for (const li of args.invoiceLines) {
    if (li.stripeProductId) stripeProductIds.add(li.stripeProductId);
    if (li.stripePriceId) stripePriceIds.add(li.stripePriceId);
    const desc = li.description?.trim() ?? '';
    if (!desc) continue;
    for (const fam of getOtProductFamilyKeysFromText(desc)) productFamilies.add(fam);
    const amt = typeof li.amount === 'number' ? li.amount : 0;
    chargeKinds.add(classifyOtNonPharmacyChargeLine(desc, amt));
  }
  return { productFamilies, stripeProductIds, stripePriceIds, chargeKinds };
}

/**
 * True when the patient has a prior paid invoice (strictly before
 * `currentPaidAt`, excluding the current invoice itself) whose product
 * signature overlaps with the current sale's signature on **any** of:
 *   - drug family
 *   - Stripe product ID
 *   - Stripe price ID
 *   - chargeKind (covers non-Rx like bloodwork → bloodwork)
 *
 * No time-window filter — once a patient has bought a given product
 * family, every future purchase of that family is a rebill (per
 * stakeholder rule 2026-05-02).
 */
function isOtRebillPurchase(
  history: ReadonlyArray<OtPatientPurchaseSignature>,
  current: {
    invoiceId: number | null;
    paidAt: Date | null;
    productFamilies: ReadonlySet<string>;
    stripeProductIds: ReadonlySet<string>;
    stripePriceIds: ReadonlySet<string>;
    chargeKinds: ReadonlySet<'rx' | 'bloodwork' | 'consult' | 'other'>;
  }
): boolean {
  if (!current.paidAt) return false;
  if (history.length === 0) return false;
  const refMs = current.paidAt.getTime();
  for (const h of history) {
    if (h.invoiceId === current.invoiceId) continue;
    const hMs = h.paidAt.getTime();
    if (hMs > refMs) continue; // not strictly prior
    if (hMs === refMs && h.invoiceId >= (current.invoiceId ?? 0)) continue; // tie-break by id
    /** Intersect every signal in the order they're most likely to match. */
    for (const fam of current.productFamilies) {
      if (h.productFamilies.has(fam)) return true;
    }
    for (const pid of current.stripeProductIds) {
      if (h.stripeProductIds.has(pid)) return true;
    }
    for (const priceId of current.stripePriceIds) {
      if (h.stripePriceIds.has(priceId)) return true;
    }
    for (const kind of current.chargeKinds) {
      if (h.chargeKinds.has(kind)) return true;
    }
  }
  return false;
}

/**
 * Load the active sales-rep assignment for each patient — used as a fallback
 * when the SalesRepCommissionEvent ledger has no entry for an invoice yet
 * (e.g. the commission engine hasn't run, or the sale predates the commission
 * system). Mirrors what the patient profile page shows in its "Sales rep"
 * card so admins see the same rep on both surfaces.
 *
 * Returns a map keyed by `patientId` → `{ salesRepId, salesRepName }`.
 * Patients with no active assignment are absent from the map.
 */
async function loadOtPatientSalesRepAssignments(
  clinicId: number,
  patientIds: number[]
): Promise<Map<number, { salesRepId: number; salesRepName: string }>> {
  const map = new Map<number, { salesRepId: number; salesRepName: string }>();
  if (patientIds.length === 0) return map;

  const assignments = await basePrisma.patientSalesRepAssignment.findMany({
    where: {
      clinicId,
      patientId: { in: patientIds },
      isActive: true,
    },
    /** Most recent active assignment wins if there are stale duplicate rows. */
    orderBy: { assignedAt: 'desc' },
    select: {
      patientId: true,
      salesRepId: true,
    },
  });

  if (assignments.length === 0) return map;

  const repIds = [...new Set(assignments.map((a) => a.salesRepId))];
  const reps = await basePrisma.user.findMany({
    where: { id: { in: repIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const labelById = new Map(reps.map((u) => [u.id, `${u.lastName}, ${u.firstName}`]));

  for (const a of assignments) {
    /** First write wins thanks to `orderBy desc`; skip later duplicates. */
    if (map.has(a.patientId)) continue;
    map.set(a.patientId, {
      salesRepId: a.salesRepId,
      salesRepName: labelById.get(a.salesRepId) ?? `User #${a.salesRepId}`,
    });
  }
  return map;
}

/** Net cents per invoice from Stripe-processed local Payment rows (SUCCEEDED only — widest DB compatibility). */
async function loadOtPaymentNetCentsByInvoiceId(
  invoiceDbIds: number[]
): Promise<Map<number, number>> {
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
async function loadOtStripeCustomerNameByInvoiceId(
  invoiceDbIds: number[]
): Promise<Map<number, string>> {
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
    throw new OtInvoiceConfigurationError(
      `OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})`
    );
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
  rxs: { medName: string; strength: string }[]
): boolean {
  const d = description.toLowerCase().trim();
  if (!d || lineLooksLikeExcludedService(d)) return false;
  for (const rx of rxs) {
    const fragment = rx.medName.toLowerCase().trim();
    if (fragment.length >= 3 && d.includes(fragment)) return false;
  }
  return true;
}

export async function generateOtDailyInvoices(
  date: string,
  endDate?: string
): Promise<OtDailyInvoices> {
  const { clinicId, clinicName } = await resolveOtClinic();

  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);

  const wideStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wideEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
  /** Aligns with payment→patient→order fallback — reused for consult/cash invoices with no `orderId`. */
  const patientFallbackStart = new Date(periodStart.getTime() - 45 * 24 * 60 * 60 * 1000);
  const patientFallbackEnd = new Date(periodEnd.getTime() + 14 * 24 * 60 * 60 * 1000);
  /** Max |invoice.paidAt − (order.approvedAt ?? order.createdAt)| when linking cash invoice → Rx order. */
  const OT_ORPHAN_PAYMENT_INVOICE_ORDER_MAX_MS = 45 * 86_400_000;

  const [paidInvoices, rawPeriodPayments] = await Promise.all([
    basePrisma.invoice.findMany({
      where: {
        ...otInvoicePatientClinicScope(clinicId),
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
    }),
    loadOtSucceededPaymentsForPeriod(clinicId, periodStart, periodEnd),
  ]);

  const paymentPatientIds = [...new Set(rawPeriodPayments.map((p) => p.patientId))];
  const paymentPatientNameById = new Map<number, string>();
  if (paymentPatientIds.length > 0) {
    const paymentPatients = await basePrisma.patient.findMany({
      where: { id: { in: paymentPatientIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const p of paymentPatients) {
      paymentPatientNameById.set(p.id, formatPatientName(p));
    }
  }

  const refundedAtById = new Map<number, string | null>();
  const paymentCollections: OtPaymentCollectionRow[] = rawPeriodPayments
    .map((p) => {
      const refunded = Math.max(0, p.refundedAmount ?? 0);
      const netCollectedCents = Math.max(0, p.amount - refunded);
      const isFullyRefunded = refunded > 0 && refunded >= p.amount;
      /**
       * `Payment.refundedAt` is read alongside `refundedAmount` from the same row but
       * was excluded from this select to keep the original payload narrow. We pull it
       * separately below for the refund line items.
       */
      return {
        paymentId: p.id,
        paidAt: p.paidAt?.toISOString() ?? null,
        recordedAt: p.createdAt.toISOString(),
        amountCents: p.amount,
        netCollectedCents,
        refundedAmountCents: refunded,
        isFullyRefunded,
        patientId: p.patientId,
        patientName: paymentPatientNameById.get(p.patientId) ?? `Patient #${p.patientId}`,
        description: p.description,
        invoiceId: p.invoiceId,
        stripePaymentIntentId: p.stripePaymentIntentId,
        stripeChargeId: p.stripeChargeId,
      } satisfies OtPaymentCollectionRow;
    })
    .sort((a, b) => {
      const ta = new Date(a.paidAt ?? a.recordedAt).getTime();
      const tb = new Date(b.paidAt ?? b.recordedAt).getTime();
      if (ta !== tb) return ta - tb;
      return a.paymentId - b.paymentId;
    });

  const refundedPaymentIds = paymentCollections
    .filter((r) => r.refundedAmountCents > 0)
    .map((r) => r.paymentId);
  if (refundedPaymentIds.length > 0) {
    const refundedAtRows = await basePrisma.payment.findMany({
      where: { id: { in: refundedPaymentIds } },
      select: { id: true, refundedAt: true },
    });
    for (const r of refundedAtRows) {
      refundedAtById.set(r.id, r.refundedAt?.toISOString() ?? null);
    }
  }

  const refundLineItems: OtRefundLineItem[] = paymentCollections
    .filter((r) => r.refundedAmountCents > 0)
    .map((r) => ({
      paymentId: r.paymentId,
      paidAt: r.paidAt,
      refundedAt: refundedAtById.get(r.paymentId) ?? null,
      patientId: r.patientId,
      patientName: r.patientName,
      amountCents: r.amountCents,
      refundedAmountCents: r.refundedAmountCents,
      isFullyRefunded: r.isFullyRefunded,
      description: r.description,
      invoiceId: r.invoiceId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      stripeChargeId: r.stripeChargeId,
    }))
    .sort((a, b) => {
      /** Order by when the refund occurred (refundedAt), falling back to original paidAt. */
      const ta = new Date(a.refundedAt ?? a.paidAt ?? 0).getTime();
      const tb = new Date(b.refundedAt ?? b.paidAt ?? 0).getTime();
      if (ta !== tb) return ta - tb;
      return a.paymentId - b.paymentId;
    });

  logger.info('OT invoice generation: payments in period (all types)', {
    clinicId,
    date,
    endDate: endDate ?? date,
    paymentRowCount: paymentCollections.length,
    paymentsCollectedNetCents: paymentCollections.reduce((s, r) => s + r.netCollectedCents, 0),
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

  /**
   * Tie cash (`Payment` in the Eastern window) to pharmacy COGS:
   * 1. `Payment.invoiceId` when set
   * 2. `PaymentReconciliation` rows matched by Stripe charge / payment-intent id when `invoiceId` on Payment is null
   *
   * We do **not** require `prescriptionProcessed` on the invoice here — OT often marks paid before that flag flips;
   * COGS still come from `Order.rxs`. (Doctor-fee / prior-Rx history still use processed invoices elsewhere.)
   */
  const stripeChargeIds = [
    ...new Set(
      rawPeriodPayments
        .map((p) => p.stripeChargeId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
  const stripePiIds = [
    ...new Set(
      rawPeriodPayments
        .map((p) => p.stripePaymentIntentId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
  let reconciliationInvoiceIds: number[] = [];
  if (stripeChargeIds.length > 0 || stripePiIds.length > 0) {
    const reconOr: {
      stripeChargeId?: { in: string[] };
      stripePaymentIntentId?: { in: string[] };
    }[] = [];
    if (stripeChargeIds.length > 0) reconOr.push({ stripeChargeId: { in: stripeChargeIds } });
    if (stripePiIds.length > 0) reconOr.push({ stripePaymentIntentId: { in: stripePiIds } });
    const recRows = await basePrisma.paymentReconciliation.findMany({
      where: {
        OR: reconOr,
        invoiceId: { not: null },
      },
      select: { invoiceId: true },
    });
    reconciliationInvoiceIds = [
      ...new Set(recRows.map((r) => r.invoiceId).filter((id): id is number => id != null)),
    ];
  }

  const paymentLinkedInvoiceIds = [
    ...new Set([
      ...rawPeriodPayments.map((p) => p.invoiceId).filter((id): id is number => id != null),
      ...reconciliationInvoiceIds,
    ]),
  ];

  if (paymentLinkedInvoiceIds.length > 0) {
    const paymentBridgedInvoices = await basePrisma.invoice.findMany({
      where: {
        id: { in: paymentLinkedInvoiceIds },
        ...otInvoicePatientClinicScope(clinicId),
        paidAt: { not: null },
        status: { notIn: ['VOID', 'REFUNDED'] },
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
    let bridgedOrderCount = 0;
    const bridgedInvoicesWithoutOrderId: (typeof paymentBridgedInvoices)[number][] = [];
    for (const inv of paymentBridgedInvoices) {
      if (inv.orderId != null) {
        if (invoiceByOrderId.has(inv.orderId)) continue;
        invoiceByOrderId.set(inv.orderId, {
          paidAt: inv.paidAt,
          invoiceDbId: inv.id,
          patientId: inv.patientId,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          lineItems: inv.lineItems,
        });
        orderIdsFromInvoices.add(inv.orderId);
        bridgedOrderCount += 1;
      } else {
        bridgedInvoicesWithoutOrderId.push(inv);
      }
    }

    if (bridgedInvoicesWithoutOrderId.length > 0) {
      const orphanPatientIds = [...new Set(bridgedInvoicesWithoutOrderId.map((i) => i.patientId))];
      const orphanCandidateOrders = await basePrisma.order.findMany({
        where: {
          patientId: { in: orphanPatientIds },
          patient: { clinicId },
          cancelledAt: null,
          status: { notIn: ['error', 'cancelled', 'declined'] },
          rxs: { some: {} },
          OR: [
            { createdAt: { gte: patientFallbackStart, lte: patientFallbackEnd } },
            { approvedAt: { gte: patientFallbackStart, lte: patientFallbackEnd } },
          ],
        },
        select: {
          id: true,
          patientId: true,
          createdAt: true,
          approvedAt: true,
        },
        orderBy: { id: 'desc' },
      });
      const ordersByPatient = new Map<number, typeof orphanCandidateOrders>();
      for (const o of orphanCandidateOrders) {
        const list = ordersByPatient.get(o.patientId) ?? [];
        list.push(o);
        ordersByPatient.set(o.patientId, list);
      }
      let orphanAttached = 0;
      for (const inv of bridgedInvoicesWithoutOrderId) {
        if (!inv.paidAt) continue;
        const paidMs = inv.paidAt.getTime();
        const candidates = ordersByPatient.get(inv.patientId) ?? [];
        let best: (typeof orphanCandidateOrders)[number] | null = null;
        let bestDiff = Infinity;
        for (const o of candidates) {
          const anchorMs = (o.approvedAt ?? o.createdAt).getTime();
          const diff = Math.abs(anchorMs - paidMs);
          if (diff <= OT_ORPHAN_PAYMENT_INVOICE_ORDER_MAX_MS && diff < bestDiff) {
            bestDiff = diff;
            best = o;
          }
        }
        if (!best) continue;
        if (invoiceByOrderId.has(best.id)) continue;
        invoiceByOrderId.set(best.id, {
          paidAt: inv.paidAt,
          invoiceDbId: inv.id,
          patientId: inv.patientId,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          lineItems: inv.lineItems,
        });
        orderIdsFromInvoices.add(best.id);
        orphanAttached += 1;
      }
      if (orphanAttached > 0 || bridgedInvoicesWithoutOrderId.length > 0) {
        logger.info(
          'OT invoice: cash invoice without orderId → Rx order (patient + date proximity)',
          {
            clinicId,
            orphanInvoices: bridgedInvoicesWithoutOrderId.length,
            orphanCandidateOrders: orphanCandidateOrders.length,
            orphanAttached,
          }
        );
      }
    }

    const invoiceIdsMissingFromDb = paymentLinkedInvoiceIds.length - paymentBridgedInvoices.length;
    if (
      bridgedOrderCount > 0 ||
      reconciliationInvoiceIds.length > 0 ||
      invoiceIdsMissingFromDb > 0
    ) {
      logger.info('OT invoice generation: payment→invoice bridge', {
        clinicId,
        bridgedOrderCount,
        invoiceIdsRequested: paymentLinkedInvoiceIds.length,
        invoicesReturned: paymentBridgedInvoices.length,
        reconciliationInvoiceIdCount: reconciliationInvoiceIds.length,
        invoiceIdsMissingFromDb,
      });
    }
  }

  /**
   * Last-resort COGS link: patients with cash in the period → their Rx orders in the wide window →
   * latest paid invoice per `orderId`. Handles payments that never set `Payment.invoiceId` or point at a
   * non-Rx Stripe invoice while the Rx row exists with `orderId`.
   */
  if (paymentPatientIds.length > 0) {
    const extraOrderRows = await basePrisma.order.findMany({
      where: {
        patientId: { in: paymentPatientIds },
        patient: { clinicId },
        cancelledAt: null,
        /** Do not filter channel here — mis-set `fulfillmentChannel` should not block COGS once we have a paid invoice on `orderId`. */
        status: { notIn: ['error', 'cancelled', 'declined'] },
        OR: [
          { createdAt: { gte: patientFallbackStart, lte: patientFallbackEnd } },
          { approvedAt: { gte: patientFallbackStart, lte: patientFallbackEnd } },
        ],
      },
      select: { id: true },
    });
    const extraOrderIds = extraOrderRows
      .map((o) => o.id)
      .filter((id) => !orderIdsFromInvoices.has(id));
    if (extraOrderIds.length > 0) {
      const invForExtraOrders = await basePrisma.invoice.findMany({
        where: {
          orderId: { in: extraOrderIds },
          ...otInvoicePatientClinicScope(clinicId),
          paidAt: { not: null },
          status: { notIn: ['VOID', 'REFUNDED'] },
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
      const bestInvByOrder = new Map<
        number,
        {
          id: number;
          orderId: number | null;
          paidAt: Date | null;
          patientId: number;
          prescriptionProcessedAt: Date | null;
          amountPaid: number;
          amountDue: number | null;
          lineItems: unknown;
        }
      >();
      for (const inv of invForExtraOrders) {
        if (inv.orderId == null) continue;
        const prev = bestInvByOrder.get(inv.orderId);
        const invPaid = inv.paidAt?.getTime() ?? 0;
        const prevPaid = prev?.paidAt?.getTime() ?? 0;
        if (!prev || invPaid >= prevPaid) {
          bestInvByOrder.set(inv.orderId, inv);
        }
      }
      let fallbackAttached = 0;
      for (const [orderId, inv] of bestInvByOrder) {
        if (invoiceByOrderId.has(orderId)) continue;
        invoiceByOrderId.set(orderId, {
          paidAt: inv.paidAt,
          invoiceDbId: inv.id,
          patientId: inv.patientId,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          lineItems: inv.lineItems,
        });
        orderIdsFromInvoices.add(orderId);
        fallbackAttached += 1;
      }
      if (fallbackAttached > 0) {
        logger.info('OT invoice: patient→order→invoice fallback attached pharmacy rows', {
          clinicId,
          fallbackAttached,
          extraOrdersConsidered: extraOrderIds.length,
        });
      }
    }
  }

  if (rawPeriodPayments.length > 0 && orderIdsFromInvoices.size === 0) {
    const withDirectInvoice = rawPeriodPayments.filter((p) => p.invoiceId != null).length;
    logger.warn(
      'OT invoice: period has payments but no orders for pharmacy — check Invoice.orderId, patient clinic, order status/channel, invoice paidAt/status',
      {
        clinicId,
        paymentRowCount: rawPeriodPayments.length,
        paymentsWithInvoiceId: withDirectInvoice,
        distinctInvoiceIdsFromPaymentsAndRecon: paymentLinkedInvoiceIds.length,
      }
    );
  }

  const unlinkedInvoices = await basePrisma.invoice.findMany({
    where: {
      ...otInvoicePatientClinicScope(clinicId),
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

  // Prisma rejects `in: []`; when all period invoices are unlinked (no orderId yet), only query by date window.
  const orderIdsMatchedToInvoice = [...orderIdsFromInvoices];
  const orderOrClause =
    orderIdsMatchedToInvoice.length > 0
      ? [{ id: { in: orderIdsMatchedToInvoice } }, { createdAt: { gte: wideStart, lte: wideEnd } }]
      : [{ createdAt: { gte: wideStart, lte: wideEnd } }];

  const fulfillmentOr: Array<{ fulfillmentChannel: { in: string[] } } | { id: { in: number[] } }> =
    [{ fulfillmentChannel: { in: ['lifefile', 'dosespot'] } }];
  if (orderIdsMatchedToInvoice.length > 0) {
    fulfillmentOr.push({ id: { in: orderIdsMatchedToInvoice } });
  }

  const allOrders = await basePrisma.order.findMany({
    where: {
      AND: [
        { patient: { clinicId } },
        { OR: orderOrClause },
        { cancelledAt: null },
        /** Paid orders still in admin queue must allocate COGS; only terminal bad states are excluded. */
        { status: { notIn: ['error', 'cancelled', 'declined'] } },
        /**
         * Prefer Lifefile/DoseSpot; always include orders we already matched to a paid invoice so an odd
         * `fulfillmentChannel` value cannot drop pharmacy lines entirely.
         */
        { OR: fulfillmentOr },
      ],
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
        .filter((x): x is number => x != null)
    ),
  ];
  /**
   * Non-Rx invoice ids that may also have sales-rep commissions in the ledger
   * (per stakeholder Q3: ledger lookup applies to non-Rx invoices the same way
   * as Rx, and admin can manually override per row in the editor). Computed
   * here so the lookup is one round-trip for both Rx and non-Rx.
   */
  const rxInvoiceDbIdsForCogsSet = new Set(invoiceDbIdsForCommissions);
  const nonRxInvoiceDbIdsForCommissions = [
    ...new Set(
      paymentCollections
        .filter((p) => !p.isFullyRefunded)
        .map((p) => p.invoiceId)
        .filter((id): id is number => id != null && !rxInvoiceDbIdsForCogsSet.has(id))
    ),
  ];
  const allInvoiceDbIdsForCommissions = [
    ...invoiceDbIdsForCommissions,
    ...nonRxInvoiceDbIdsForCommissions,
  ];
  const salesRepLookup = await loadOtSalesRepCommissionLookup(
    clinicId,
    allInvoiceDbIdsForCommissions
  );

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
    logger.error(
      'OT invoice: payment / PaymentReconciliation preload failed; using invoice gross only',
      {
        message: msg,
      }
    );
  }

  const patientIdsForDoctorFee = [...new Set(filteredOrders.map((o) => o.patientId))];
  /**
   * Also include patients tied to non-Rx payments so non-Rx rows can pick up
   * the same fallback rep (the commission ledger frequently has nothing for
   * pure non-Rx invoices, and admins expect to see whoever the patient
   * profile lists as their sales rep).
   */
  const patientIdsForNonRx = paymentCollections.map((p) => p.patientId);
  const allPatientIdsForRepFallback = [
    ...new Set([...patientIdsForDoctorFee, ...patientIdsForNonRx]),
  ];
  const [paidRxHistoryByPatient, patientSalesRepAssignments, patientPurchaseHistory] =
    await Promise.all([
      loadOtPaidPrescriptionInvoicesByPatient(clinicId, patientIdsForDoctorFee),
      loadOtPatientSalesRepAssignments(clinicId, allPatientIdsForRepFallback),
      /**
       * Per-product purchase history used by the rebill detector. Loads
       * every paid invoice ever for these patients with extracted drug
       * families + Stripe product IDs + chargeKinds. "Any prior" rule
       * applies — once a patient has bought Sermorelin once, every future
       * Sermorelin sale for them is a rebill.
       */
      loadOtPatientPurchaseHistory(clinicId, allPatientIdsForRepFallback),
    ]);

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

    for (const { rx, qty: rawConsolidatedQty } of consolidateOtOrderRxs(order.rxs)) {
      const resolved = resolveOtProductPriceForPharmacyLine(rx);
      const billQty = effectiveOtPharmacyBillQuantity({
        medName: rx.medName,
        form: rx.form,
        consolidatedRawQty: rawConsolidatedQty,
        pricingSource: resolved?.source ?? null,
      });
      orderVialCount += billQty;
      const unitCents = resolved?.row.priceCents ?? 0;
      if (!resolved) missingPriceCount += billQty;
      else if (resolved.source === 'fallback') estimatedPriceCount += billQty;
      orderMedTotalCents += unitCents * billQty;

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
        quantity: billQty,
        unitPriceCents: unitCents,
        lineTotalCents: unitCents * billQty,
        pricingStatus,
      });
    }

    subtotalMedicationsCents += orderMedTotalCents;
    totalVials += orderVialCount;

    let orderShippingCents = 0;
    let orderTrtTelehealthCents = 0;

    if (order.rxs.length > 0) {
      const { feeCents: shipFee, tier: shipTier } = getOtPrescriptionShippingCentsForOrder(
        order.rxs
      );
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

    const approvalMode = getOtDoctorApprovalModeFromRxs(order.rxs);
    const currentPaidAtDate = invMeta?.paidAt ?? null;
    const patientRxList = paidRxHistoryByPatient.get(order.patientId) ?? [];
    const priorPaidRx =
      currentPaidAtDate != null && invMeta
        ? findPriorPaidOtPrescriptionInvoice(patientRxList, invMeta.invoiceDbId, currentPaidAtDate)
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
      nominalFeeCents: doctorRxFee.nominalFeeCents,
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
    const salePlatformCents = Math.round(
      (patientGrossCents * OT_PLATFORM_COMPENSATION_BPS) / 10_000
    );
    const pharmacyTotalForOrder = orderMedTotalCents + orderShippingCents + orderTrtTelehealthCents;

    const invDbId = invMeta?.invoiceDbId ?? null;
    const stripeInvId =
      invDbId != null ? (salesRepLookup.stripeByInvoiceDbId.get(invDbId) ?? null) : null;
    const comm =
      stripeInvId != null
        ? (salesRepLookup.commissionByStripeObjectId.get(stripeInvId) ?? null)
        : null;
    const salesRepCommissionCents = comm?.commissionAmountCents ?? 0;
    /**
     * Rep selection fallback chain (per stakeholder direction 2026-05-02):
     *   1. SalesRepCommissionEvent ledger entry for this Stripe invoice.
     *   2. Active PatientSalesRepAssignment on the patient profile.
     *   3. None.
     * The commission $ amount itself stays at the ledger value (or 0 when
     * absent) — only the rep identity is fallen-back. The auto-rate logic
     * in `buildDefaultOverridePayload` then computes commission from the
     * payload-level rate × patient gross.
     */
    const fallbackAssignment = patientSalesRepAssignments.get(order.patientId) ?? null;
    const salesRepId = comm?.salesRepId ?? fallbackAssignment?.salesRepId ?? null;
    const salesRepName =
      comm != null && comm.salesRepId === salesRepId
        ? (salesRepLookup.repLabelById.get(comm.salesRepId) ?? `User #${comm.salesRepId}`)
        : (fallbackAssignment?.salesRepName ?? null);
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

    /**
     * Patient-facing product description.
     *
     * Prefer the **invoice line items** — that's what the patient was actually
     * billed for and matches what shows in the patient profile's "Treatment"
     * column. Falling back to `order.rxs` was misleading for cases where the
     * Lifefile order had a phantom / comp'd Rx attached (e.g. free Sermorelin
     * carried over from a prior order shell) but the patient was actually
     * billed for bloodwork or a consult on the same invoice. Discount lines
     * are filtered out so they don't drown out the actual product.
     *
     * Truncated to 160 chars so the editor row header stays single-line.
     */
    const rxNames = order.rxs.map((rx) => {
      const parts = [rx.medName, rx.strength].filter((p) => p && p.length > 0);
      return parts.join(' ');
    });
    let productDescription: string | null = null;
    /**
     * Track whether the actual paid invoice line items are *all* bloodwork.
     * Used downstream to flag the row as "bloodwork-only" so the manual
     * reconciliation editor seeds bloodwork defaults (no shipping, no TRT,
     * no fulfillment, $10 doctor fee) even when the Lifefile order shell
     * has a phantom / comp'd Rx attached.
     */
    let isBloodworkOnly = false;
    /**
     * Structured invoice line items (description + amountCents) for the
     * downstream multi-package matcher in `buildDefaultOverridePayload`.
     * Reused for productDescription + isBloodworkOnly classification below.
     */
    let invoiceLineItemsForBuilder: Array<{ description: string; amountCents: number }> = [];
    if (invMeta?.lineItems) {
      const lines = parseInvoiceLineItemsJson(invMeta.lineItems);
      const productLines = lines
        .map((l) => ({
          description: l.description?.trim() ?? '',
          amountCents: typeof l.amount === 'number' ? l.amount : 0,
        }))
        .filter((l) => l.description.length > 0)
        /**
         * Drop line items that look like discount / refund / write-off rows so
         * the description reflects what the patient actually purchased rather
         * than the bookkeeping adjustments. Matches lines starting with
         * "Discount", "Refund", "Credit", "Adjustment", or "Write-off"
         * (case-insensitive), with optional leading "-" or "$".
         */
        .filter(
          (l) => !/^[-$\s]*(discount|refund|credit|adjustment|write[-\s]?off)\b/i.test(l.description)
        );
      invoiceLineItemsForBuilder = productLines;
      if (productLines.length > 0) {
        productDescription = [...new Set(productLines.map((l) => l.description))].join(' · ');
        isBloodworkOnly = productLines.every(
          (l) => classifyOtNonPharmacyChargeLine(l.description, l.amountCents) === 'bloodwork'
        );
      }
    }
    if (!productDescription && rxNames.length > 0) {
      productDescription = [...new Set(rxNames)].join(' · ');
    }
    if (productDescription && productDescription.length > 160) {
      productDescription = productDescription.slice(0, 157) + '…';
    }

    perSaleReconciliation.push({
      orderId: order.id,
      invoiceDbId: invMeta?.invoiceDbId ?? null,
      lifefileOrderId: order.lifefileOrderId,
      orderDate,
      paidAt,
      patientName,
      productDescription,
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
      /**
       * Per-product rebill detection (stakeholder rule 2026-05-02): the
       * sale is a rebill when the patient has any prior paid invoice with
       * an overlapping product signature — same drug family, same Stripe
       * product/price ID, or same chargeKind. NAD+ in March + Sermorelin
       * in April → both are NEW. Sermorelin in March + Sermorelin in
       * April → April is REBILL.
       */
      isRebill: (() => {
        const history = patientPurchaseHistory.get(order.patientId) ?? [];
        const currentLines = invMeta?.lineItems ? parseInvoiceLineItemsJson(invMeta.lineItems) : [];
        const currentSig = buildOtCurrentSaleSignature({
          rxs: order.rxs.map((rx) => ({
            medName: rx.medName,
            medicationKey: rx.medicationKey,
          })),
          invoiceLines: currentLines,
        });
        return isOtRebillPurchase(history, {
          invoiceId: invMeta?.invoiceDbId ?? null,
          paidAt: invMeta?.paidAt ?? null,
          productFamilies: currentSig.productFamilies,
          stripeProductIds: currentSig.stripeProductIds,
          stripePriceIds: currentSig.stripePriceIds,
          chargeKinds: currentSig.chargeKinds,
        });
      })(),
      isBloodworkOnly,
      invoiceLineItems: invoiceLineItemsForBuilder,
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
  const merchantFeeFromPerSale = perSaleReconciliation.reduce(
    (s, r) => s + r.merchantProcessingCents,
    0
  );
  const platformFeeFromPerSale = perSaleReconciliation.reduce(
    (s, r) => s + r.platformCompensationCents,
    0
  );
  const salesRepCommissionTotalCents = perSaleReconciliation.reduce(
    (s, r) => s + r.salesRepCommissionCents,
    0
  );
  const managerOverrideTotalCents = perSaleReconciliation.reduce(
    (s, r) => s + r.managerOverrideTotalCents,
    0
  );

  const matchedPrescriptionInvoiceGrossCents = grossSalesCents;
  const paymentsCollectedGrossCents = paymentCollections.reduce((s, r) => s + r.amountCents, 0);
  const refundsTotalCents = paymentCollections.reduce((s, r) => s + r.refundedAmountCents, 0);
  const paymentsCollectedNetCents = paymentCollections.reduce((s, r) => s + r.netCollectedCents, 0);
  /**
   * Sanity invariant — should always hold by construction:
   *   paymentsCollectedNetCents === paymentsCollectedGrossCents − refundsTotalCents
   * Net is what `feesUseCashCollectedBasis` already drives 4%/10% off of.
   */
  const feesUseCashCollectedBasis = paymentsCollectedNetCents > 0;

  let merchantFee: number;
  let grossForFeeDisplay: number;
  let platformInvoiceCount: number;
  if (feesUseCashCollectedBasis) {
    grossForFeeDisplay = paymentsCollectedNetCents;
    merchantFee = Math.round((paymentsCollectedNetCents * OT_MERCHANT_PROCESSING_BPS) / 10_000);
    platformInvoiceCount = paymentCollections.length;
  } else {
    grossForFeeDisplay = grossSalesCents;
    merchantFee = merchantFeeFromPerSale;
    platformInvoiceCount = grossInvoicesCounted.size;
  }
  /**
   * EONPro 5% fee runs on **patient gross per row** (per stakeholder
   * direction 2026-05-02 — replaced the prior 10% platform compensation on
   * cash-collected-net). Both Rx and non-Rx rows carry their own
   * `platformCompensationCents` at 5%, so the period total is just the sum.
   * Refunded sales naturally drop out because their per-row gross trends
   * toward 0 once the refund posts.
   */
  const platformFee = platformFeeFromPerSale;

  const grandTotal =
    pharmacyTotal +
    doctorTotal +
    fulfillmentTotal +
    merchantFee +
    platformFee +
    salesRepCommissionTotalCents +
    managerOverrideTotalCents;
  const clinicNetPayoutCents = grossForFeeDisplay - grandTotal;

  const invoiceDbIdsUsedForCogs = new Set(
    filteredOrders
      .map((o) => invoiceByOrderId.get(o.id)?.invoiceDbId)
      .filter((x): x is number => x != null)
  );
  const paymentsWithoutPharmacyCogs =
    filteredOrders.length === 0
      ? paymentCollections.slice()
      : paymentCollections.filter(
          (p) => p.invoiceId == null || !invoiceDbIdsUsedForCogs.has(p.invoiceId)
        );

  const unmappedPaymentInvoiceIds = [
    ...new Set(
      paymentCollections
        .map((p) => p.invoiceId)
        .filter((id): id is number => id != null && !invoiceDbIdsUsedForCogs.has(id))
    ),
  ];

  let nonRxChargeLineItems: OtNonRxChargeLineItem[] = [];
  let nonRxExplainedPaymentCount = 0;

  if (unmappedPaymentInvoiceIds.length > 0) {
    const nonRxInvoices = await basePrisma.invoice.findMany({
      where: {
        id: { in: unmappedPaymentInvoiceIds },
        ...otInvoicePatientClinicScope(clinicId),
        status: { notIn: ['VOID', 'REFUNDED'] },
      },
      select: {
        id: true,
        patientId: true,
        paidAt: true,
        lineItems: true,
        amountPaid: true,
        amountDue: true,
      },
    });
    const loadedNonRxInvoiceIds = new Set(nonRxInvoices.map((i) => i.id));
    nonRxExplainedPaymentCount = paymentCollections.filter(
      (p) => p.invoiceId != null && loadedNonRxInvoiceIds.has(p.invoiceId)
    ).length;

    const nonRxPatientIds = [...new Set(nonRxInvoices.map((i) => i.patientId))];
    const nonRxPatients =
      nonRxPatientIds.length > 0
        ? await basePrisma.patient.findMany({
            where: { id: { in: nonRxPatientIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const nonRxPatientNameById = new Map<number, string>();
    for (const p of nonRxPatients) {
      nonRxPatientNameById.set(p.id, formatPatientName(p));
    }

    const built: OtNonRxChargeLineItem[] = [];
    for (const inv of nonRxInvoices) {
      const paidAtStr = inv.paidAt?.toISOString() ?? null;
      const patientName = nonRxPatientNameById.get(inv.patientId) ?? `Patient #${inv.patientId}`;
      const lines = parseInvoiceLineItemsJson(inv.lineItems);
      if (lines.length > 0) {
        for (const li of lines) {
          const desc = li.description?.trim() ?? '';
          if (!desc) continue;
          const patientAmt = typeof li.amount === 'number' ? li.amount : 0;
          built.push({
            invoiceDbId: inv.id,
            patientId: inv.patientId,
            patientName,
            paidAt: paidAtStr,
            description: desc,
            lineAmountCents: patientAmt,
            chargeKind: classifyOtNonPharmacyChargeLine(desc, patientAmt),
          });
        }
      } else {
        const gross = normalizeGrossCents({ amountPaid: inv.amountPaid, amountDue: inv.amountDue });
        if (gross > 0) {
          built.push({
            invoiceDbId: inv.id,
            patientId: inv.patientId,
            patientName,
            paidAt: paidAtStr,
            description: 'Invoice total (line items not synced — open patient Billing for detail)',
            lineAmountCents: gross,
            chargeKind: classifyOtNonPharmacyChargeLine('', gross),
          });
        }
      }
    }
    nonRxChargeLineItems = built.sort((a, b) => {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      if (a.invoiceDbId !== b.invoiceDbId) return a.invoiceDbId - b.invoiceDbId;
      return a.description.localeCompare(b.description);
    });
  }

  // -------------------------------------------------------------------------
  // Non-Rx disposition rows
  // -------------------------------------------------------------------------
  // Build one editable row per non-Rx disposition unit (invoice or standalone
  // payment), then enrich each row with sales-rep / manager-override data from
  // the same `salesRepLookup` used by Rx so non-Rx commissions inherit the
  // ledger automatically (per stakeholder Q3). Admin can manually override
  // per-row in the editor (Phase 5).
  // -------------------------------------------------------------------------
  const nonRxReconciliation = buildOtNonRxReconciliation({
    paymentCollections,
    nonRxChargeLineItems,
    invoiceDbIdsUsedForCogs,
    /**
     * Per-product rebill detection (stakeholder rule 2026-05-02): match by
     * chargeKind on the non-Rx side. Bloodwork in March + Bloodwork in April
     * → April is rebill. Consult + Bloodwork → both NEW (different
     * chargeKinds). "Any prior" — no time window.
     */
    isRebillForRow: ({ patientId, paidAt, chargeKind, invoiceId, paymentId }) => {
      const history = patientPurchaseHistory.get(patientId) ?? [];
      return isOtRebillPurchase(history, {
        invoiceId,
        paidAt,
        productFamilies: new Set<string>(),
        stripeProductIds: new Set<string>(),
        stripePriceIds: new Set<string>(),
        chargeKinds: new Set([chargeKind]),
      });
    },
  }).map((row) => {
    /**
     * Resolve the assigned rep using the same fallback chain as the Rx
     * loop:
     *   1. SalesRepCommissionEvent ledger entry for the row's Stripe invoice.
     *   2. Active PatientSalesRepAssignment on the patient profile.
     *   3. None.
     * Standalone (invoice-less) payment rows can't hit the ledger lookup,
     * so they only ever pick up the patient-assignment fallback.
     */
    const stripeInvId =
      row.invoiceDbId != null
        ? (salesRepLookup.stripeByInvoiceDbId.get(row.invoiceDbId) ?? null)
        : null;
    const comm = stripeInvId
      ? (salesRepLookup.commissionByStripeObjectId.get(stripeInvId) ?? null)
      : null;
    const fallbackAssignment = patientSalesRepAssignments.get(row.patientId) ?? null;
    if (!comm && !fallbackAssignment) return row;
    const ov = comm ? salesRepLookup.overrideBySourceEventId.get(comm.id) : null;
    const resolvedSalesRepId = comm?.salesRepId ?? fallbackAssignment?.salesRepId ?? null;
    const resolvedSalesRepName = comm
      ? (salesRepLookup.repLabelById.get(comm.salesRepId) ?? `User #${comm.salesRepId}`)
      : (fallbackAssignment?.salesRepName ?? null);
    /**
     * Only count commission $ from the ledger — PatientSalesRepAssignment
     * is a rep-identity hint, not a commission-event source. The auto-rate
     * editor will compute the row's effective commission from the payload
     * rate × patient gross at render time.
     */
    const salesRepCommissionCents = comm?.commissionAmountCents ?? 0;
    const managerOverrideTotalCents = ov?.totalCents ?? 0;
    const totalDeductionsCents =
      row.merchantProcessingCents +
      row.platformCompensationCents +
      salesRepCommissionCents +
      managerOverrideTotalCents +
      row.doctorApprovalCents;
    return {
      ...row,
      salesRepId: resolvedSalesRepId,
      salesRepName: resolvedSalesRepName,
      salesRepCommissionCents,
      managerOverrideTotalCents,
      managerOverrideSummary: ov?.summary ?? null,
      totalDeductionsCents,
      clinicNetPayoutCents: row.patientGrossCents - totalDeductionsCents,
    };
  });

  /**
   * Roll non-Rx contributions into the period totals.
   *
   * EONPro fee (5% on patient gross) IS now per-row, so non-Rx
   * `platformCompensationCents` MUST be added to the period total — they're
   * Rx-side per-row sums otherwise. Merchant processing (4%) stays on
   * cash-collected-net at the period level (Stripe's actual basis), so we
   * do NOT add per-row merchant from non-Rx — that would double-count.
   */
  const nonRxSalesRepCommissionTotalCents = nonRxReconciliation.reduce(
    (s, r) => s + r.salesRepCommissionCents,
    0
  );
  const nonRxManagerOverrideTotalCents = nonRxReconciliation.reduce(
    (s, r) => s + r.managerOverrideTotalCents,
    0
  );
  const nonRxPlatformFeeCents = nonRxReconciliation.reduce(
    (s, r) => s + r.platformCompensationCents,
    0
  );

  const combinedSalesRepCommissionTotalCents =
    salesRepCommissionTotalCents + nonRxSalesRepCommissionTotalCents;
  const combinedManagerOverrideTotalCents =
    managerOverrideTotalCents + nonRxManagerOverrideTotalCents;
  const combinedPlatformFeeCents = platformFee + nonRxPlatformFeeCents;
  const combinedGrandTotal =
    grandTotal +
    nonRxSalesRepCommissionTotalCents +
    nonRxManagerOverrideTotalCents +
    nonRxPlatformFeeCents;
  const combinedClinicNetPayoutCents = grossForFeeDisplay - combinedGrandTotal;

  logger.info('OT invoice generation: non-Rx reconciliation built', {
    clinicId,
    date,
    endDate: endDate ?? date,
    nonRxRows: nonRxReconciliation.length,
    bloodworkCount: nonRxReconciliation.filter((r) => r.chargeKind === 'bloodwork').length,
    consultCount: nonRxReconciliation.filter((r) => r.chargeKind === 'consult').length,
    otherCount: nonRxReconciliation.filter((r) => r.chargeKind === 'other').length,
    nonRxSalesRepCommissionTotalCents,
    nonRxManagerOverrideTotalCents,
  });

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
      grossSalesCents: grossForFeeDisplay,
      rateBps: OT_MERCHANT_PROCESSING_BPS,
      feeCents: merchantFee,
    },
    /**
     * EONPro fee is now 5% per row (Rx + non-Rx) on patient gross — not
     * 10% on cash-collected-net like before. `feeCents` is the combined sum
     * across both editor sections so the period tile reflects what admins
     * see on each row's Live Totals panel.
     */
    platformCompensation: {
      grossSalesCents: grossForFeeDisplay,
      rateBps: OT_PLATFORM_COMPENSATION_BPS,
      feeCents: combinedPlatformFeeCents,
      invoiceCount: platformInvoiceCount,
    },
    grandTotalCents: combinedGrandTotal,
    clinicNetPayoutCents: combinedClinicNetPayoutCents,
    salesRepCommissionTotalCents: combinedSalesRepCommissionTotalCents,
    managerOverrideTotalCents: combinedManagerOverrideTotalCents,
    perSaleReconciliation,
    paymentCollections,
    paymentsCollectedNetCents,
    paymentsCollectedGrossCents,
    refundsTotalCents,
    refundLineItems,
    matchedPrescriptionInvoiceGrossCents,
    feesUseCashCollectedBasis,
    paymentsWithoutPharmacyCogs,
    nonRxChargeLineItems,
    nonRxExplainedPaymentCount,
    nonRxReconciliation,
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

/**
 * Convert cents to a thousands-separated dollar string (no leading $).
 * Negative amounts get a leading minus. Examples:
 *   centsToDisplay(127154_00) → '127,154.00'
 *   centsToDisplay(-150_00)   → '-150.00'
 *   centsToDisplay(0)         → '0.00'
 */
function centsToDisplay(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainderCents = abs % 100;
  const dollarsWithCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents2dp = remainderCents.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${dollarsWithCommas}.${cents2dp}`;
}

export function generateOtPharmacyCSV(invoice: OtPharmacyInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT (OVERTIME) PHARMACY PRODUCTS INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`
  );
  lines.push(`Generated,${new Date(invoice.invoiceDate).toLocaleString('en-US')}`);
  lines.push(`Missing internal prices (line items),${invoice.missingPriceCount}`);
  lines.push(`Estimated internal prices — name match (qty),${invoice.estimatedPriceCount}`);
  lines.push('');

  lines.push('=== MEDICATION LINE ITEMS ===');
  lines.push(
    [
      'Date',
      'Order ID',
      'LF Order ID',
      'Patient',
      'Provider',
      'Medication',
      'Strength',
      'Vial',
      'Qty',
      'Unit',
      'Line',
      'Priced',
    ]
      .map(escapeCSV)
      .join(',')
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
        .join(',')
    );
  }
  lines.push('');
  lines.push(`Medications Subtotal,,,,,,,,,,$${centsToDisplay(invoice.subtotalMedicationsCents)}`);
  if (invoice.shippingLineItems.length > 0) {
    lines.push('');
    lines.push('=== PRESCRIPTION SHIPPING (ONE FEE PER ORDER) ===');
    lines.push(
      ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(',')
    );
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
          .join(',')
      );
    }
    lines.push(
      `Prescription shipping subtotal,,,,,$${centsToDisplay(invoice.subtotalShippingCents)}`
    );
  }
  if (invoice.prescriptionFeeLineItems.length > 0) {
    lines.push('');
    lines.push('=== PRESCRIPTION FEE ($30 PER ORDER) ===');
    lines.push(
      ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(',')
    );
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
          .join(',')
      );
    }
    lines.push(
      `Prescription fees subtotal,,,,,$${centsToDisplay(invoice.subtotalPrescriptionFeesCents)}`
    );
  }
  if (invoice.trtTelehealthLineItems.length > 0) {
    lines.push('');
    lines.push('=== TRT TELEHEALTH ($50 PER TRT ORDER) ===');
    lines.push(
      ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(',')
    );
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
          .join(',')
      );
    }
    lines.push(
      `TRT telehealth subtotal,,,,,$${centsToDisplay(invoice.subtotalTrtTelehealthCents)}`
    );
  }
  lines.push('');
  lines.push(`PHARMACY TOTAL,,,,,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtDoctorApprovalsCSV(invoice: OtDoctorApprovalsInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push(
    'OT DOCTOR / RX FEE ($30 async or sync; $0 if paid Rx within 90d of prior at this clinic)'
  );
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`
  );
  lines.push(`Async (queue) rate,$${centsToDisplay(invoice.asyncFeeCents)}`);
  lines.push(`Sync rate,$${centsToDisplay(invoice.syncFeeCents)}`);
  lines.push(`Async count,${invoice.asyncCount}`);
  lines.push(`Sync count,${invoice.syncCount}`);
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medications', 'Mode', 'Fee', 'Note']
      .map(escapeCSV)
      .join(',')
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
        .join(',')
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
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`
  );
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'Invoice ID', 'Patient', 'Description', 'Patient line $', 'Fee']
      .map(escapeCSV)
      .join(',')
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
        .join(',')
    );
  }
  lines.push('');
  lines.push(`TOTAL,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtPaymentCollectionsCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const lines: string[] = [
    BOM,
    'OT / EONPRO — ALL PAYMENTS (DB Payment rows, OT patients, period window)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    `Generated,${new Date(data.pharmacy.invoiceDate).toLocaleString('en-US')}`,
    `Net collected total,$${centsToDisplay(data.paymentsCollectedNetCents)}`,
    `Matched Rx-invoice gross (reference — subset),$${centsToDisplay(data.matchedPrescriptionInvoiceGrossCents)}`,
    `Fees use cash basis (4%/10%),${data.feesUseCashCollectedBasis ? 'yes' : 'no'}`,
    '',
    'Window: Payment.paidAt in Eastern day(s), or createdAt when paidAt is null. Net = amount minus refundedAmount.',
    '',
  ];
  lines.push(
    [
      'Payment ID',
      'Paid (ISO)',
      'Recorded (ISO)',
      'Patient ID',
      'Patient',
      'Amount',
      'Refunded',
      'Net collected',
      'Invoice DB id',
      'Stripe payment intent',
      'Stripe charge',
      'Description',
    ]
      .map(escapeCSV)
      .join(',')
  );
  for (const r of data.paymentCollections) {
    lines.push(
      [
        r.paymentId,
        r.paidAt ?? '',
        r.recordedAt,
        r.patientId,
        r.patientName,
        `$${centsToDisplay(r.amountCents)}`,
        `$${centsToDisplay(r.refundedAmountCents)}`,
        `$${centsToDisplay(r.netCollectedCents)}`,
        r.invoiceId ?? '',
        r.stripePaymentIntentId ?? '',
        r.stripeChargeId ?? '',
        r.description ?? '',
      ]
        .map(escapeCSV)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

export function generateOtRefundsCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const lines: string[] = [
    BOM,
    'OT / EONPRO — REFUNDS (Stripe-issued or admin-issued)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    `Generated,${new Date(data.pharmacy.invoiceDate).toLocaleString('en-US')}`,
    `Refund count,${data.refundLineItems.length}`,
    `Refunds total,$${centsToDisplay(data.refundsTotalCents)}`,
    '',
    'Cash math: Gross collected = $' +
      centsToDisplay(data.paymentsCollectedGrossCents) +
      ' − Refunds = $' +
      centsToDisplay(data.refundsTotalCents) +
      ' → Cash collected (net) = $' +
      centsToDisplay(data.paymentsCollectedNetCents),
    '',
  ];
  lines.push(
    [
      'Refunded (ISO)',
      'Originally paid (ISO)',
      'Payment ID',
      'Patient ID',
      'Patient',
      'Original amount',
      'Refunded amount',
      'Type',
      'Invoice DB id',
      'Stripe payment intent',
      'Stripe charge',
      'Description',
    ]
      .map(escapeCSV)
      .join(',')
  );
  for (const r of data.refundLineItems) {
    lines.push(
      [
        r.refundedAt ?? '',
        r.paidAt ?? '',
        r.paymentId,
        r.patientId,
        r.patientName,
        `$${centsToDisplay(r.amountCents)}`,
        `$${centsToDisplay(r.refundedAmountCents)}`,
        r.isFullyRefunded ? 'full' : 'partial',
        r.invoiceId ?? '',
        r.stripePaymentIntentId ?? '',
        r.stripeChargeId ?? '',
        r.description ?? '',
      ]
        .map(escapeCSV)
        .join(',')
    );
  }
  if (data.refundLineItems.length > 0) {
    lines.push('');
    lines.push(`TOTAL,,,,,,$${centsToDisplay(data.refundsTotalCents)},,,,,`);
  }
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
        .join(',')
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
      .join(',')
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
      .join(',')
  );
  return lines.join('\r\n');
}

export function generateOtCombinedCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const invCount = data.platformCompensation.invoiceCount;
  const grossTopLabel = data.feesUseCashCollectedBasis
    ? `Cash collected (net, ${data.paymentCollections.length} Payment DB rows)`
    : `Patient gross (matched Rx invoices: ${invCount})`;
  const lines: string[] = [
    BOM,
    'OT / EONPRO CLINIC RECONCILIATION (EONPro holds patient payments; allocations determine OT clinic payout)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    '',
    `Gross collected (${data.paymentCollections.length} payments),$${centsToDisplay(data.paymentsCollectedGrossCents)}`,
    `Less — Refunds (${data.refundLineItems.length} refunded payments),$${centsToDisplay(data.refundsTotalCents)}`,
    `${grossTopLabel},$${centsToDisplay(data.platformCompensation.grossSalesCents)}`,
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
    ...(data.feesUseCashCollectedBasis
      ? [
          `Reference — matched prescription-invoice gross (subset),$${centsToDisplay(data.matchedPrescriptionInvoiceGrossCents)}`,
          '',
        ]
      : []),
    '--- ALL PAYMENTS COLLECTED (OT PATIENTS) ---',
    stripCsvBom(generateOtPaymentCollectionsCSV(data)),
    '',
    '--- REFUNDS (OT PATIENTS) ---',
    stripCsvBom(generateOtRefundsCSV(data)),
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
    cachedLogo = new Uint8Array(
      await fs.readFile(
        path.join(process.cwd(), 'public', BRAND.logos.eonproLogoPdf.replace(/^\//, ''))
      )
    );
    return cachedLogo;
  } catch {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (baseUrl) {
      try {
        const url = baseUrl.startsWith('http')
          ? `${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}`
          : `https://${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}`;
        const res = await fetch(url);
        if (res.ok) {
          cachedLogo = new Uint8Array(await res.arrayBuffer());
          return cachedLogo;
        }
      } catch {
        /* noop */
      }
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
  draw(
    'EONPro collects patient payments; allocations below determine OT clinic payout.',
    M,
    9,
    font,
    mid
  );
  y -= 22;
  draw(data.pharmacy.clinicName, M, 11, fontBold);
  y -= 16;
  const period = `${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} — ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`;
  draw(period, M, 9, font, mid);
  y -= 28;

  const invN = data.platformCompensation.invoiceCount;
  const payN = data.paymentCollections.length;
  const grossLabel = data.feesUseCashCollectedBasis
    ? `Cash collected (${payN} payments, net)`
    : `Patient gross (${invN} matched paid invoices)`;
  const referenceGrossRow: [string, string] = [
    'Reference — matched Rx invoice gross',
    `$${centsToDisplay(data.matchedPrescriptionInvoiceGrossCents)}`,
  ];
  const refundsRow: [string, string][] =
    data.refundsTotalCents > 0
      ? [
          [
            `Gross collected (${data.paymentCollections.length} payments)`,
            `$${centsToDisplay(data.paymentsCollectedGrossCents)}`,
          ],
          [
            `Less — Refunds (${data.refundLineItems.length})`,
            `$${centsToDisplay(data.refundsTotalCents)}`,
          ],
        ]
      : [];

  const rows: [string, string][] = [
    ...refundsRow,
    [grossLabel, `$${centsToDisplay(data.platformCompensation.grossSalesCents)}`],
    ...(data.feesUseCashCollectedBasis ? [referenceGrossRow] : []),
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
    [
      'Less — Sales rep commission (ledger)',
      `$${centsToDisplay(data.salesRepCommissionTotalCents)}`,
    ],
    [
      'Less — Manager oversight / override (ledger)',
      `$${centsToDisplay(data.managerOverrideTotalCents)}`,
    ],
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
  draw(
    `Pharmacy orders: ${data.pharmacy.orderCount} · Vials: ${data.pharmacy.vialCount}`,
    M,
    8,
    font,
    mid
  );
  y -= 14;
  draw(
    `Approvals: ${data.doctorApprovals.asyncCount} async · ${data.doctorApprovals.syncCount} sync`,
    M,
    8,
    font,
    mid
  );
  y -= 14;
  draw(
    `Unpriced medication qty: ${data.pharmacy.missingPriceCount} · Name-estimated qty: ${data.pharmacy.estimatedPriceCount}`,
    M,
    8,
    font,
    mid
  );
  y -= 16;
  draw(
    `Per-sale breakdown: export Combined CSV or Per-sale CSV (${data.perSaleReconciliation.length} sales).`,
    M,
    8,
    font,
    mid
  );

  return doc.save();
}

// ===========================================================================
// OT MANUAL RECONCILIATION — defaults builder, override merger, branded PDF
// ===========================================================================
//
// These functions back the "Manual reconciliation" tab on /super-admin/ot-invoices.
// Given an `OtDailyInvoices` snapshot for the period and a per-Order map of admin
// overrides, they produce:
//   - default-populated payloads for sales that haven't been edited yet
//   - a flat list of merged rows (override-substituted where present)
//   - a multi-page branded PDF formatted for OT clinic management.
// ===========================================================================

/**
 * Convert the computed per-sale reconciliation row into the editor's starting
 * payload. The admin will then tweak from this baseline. Pharmacy line items
 * are pulled from the same `OtDailyInvoices.pharmacy.lineItems` data the page
 * already has.
 */
export function buildDefaultOverridePayload(
  line: OtPerSaleReconciliationLine,
  pharmacyLines: OtPharmacyLineItem[]
): OtAllocationOverridePayload {
  /**
   * Tier-aware default: when patient gross matches a known package retail
   * tier AND the product description names a matching package, replace the
   * pharmacy lines (which only know per-SKU price, not per-tier price) with a
   * single line at the tier's catalog cost. Also use the package's default
   * shipping + consult.
   *
   * Example: patient paid $249 for "Enclomiphene Citrate 25 mg". The matcher
   * resolves to "Enclomiphene 25mg (28/84) @ 1 month" → cost $45, not $135
   * (which is the 3-month tier cost in the same SKU's `OT_PRODUCT_PRICES`).
   */
  /**
   * Bloodwork-only sales (paid invoice line items all classify as bloodwork)
   * use a fixed default profile per stakeholder direction (2026-05-02):
   * empty meds list, no shipping, no TRT, no fulfillment, $10 doctor fee.
   * This applies even when the Lifefile order has a phantom / comp'd Rx
   * attached — the actual paid invoice is the source of truth.
   */
  if (line.isBloodworkOnly) {
    return {
      meds: [],
      shippingCents: 0,
      trtTelehealthCents: 0,
      doctorRxFeeCents: OT_BLOODWORK_DOCTOR_FEE_CENTS,
      fulfillmentFeesCents: 0,
      customLineItems: [],
      notes: null,
      patientGrossCents: line.patientGrossCents,
      salesRepId: line.salesRepId ?? null,
      salesRepName: line.salesRepName ?? null,
      salesRepCommissionCentsOverride: null,
      commissionRateBps: line.isRebill ? 100 : 800,
      chargeKind: null,
    };
  }

  /**
   * Multi-package detection (per stakeholder direction 2026-05-02): when the
   * Stripe invoice has multiple line items (e.g. Bloodwork + TRT Solo +
   * HCG + NAD+ + Skin protocol + …), match each line to a catalog package
   * and pre-fill med lines for every match.
   *
   * Unmatched lines are SILENTLY DROPPED — never auto-added as Custom
   * Line Items. Auto-adding would double-deduct because the unmatched
   * description is usually a generic invoice payment label (e.g.
   * "Invoice 3203 (Brendan Gerrain)") whose amount IS the patient gross,
   * not an additional deduction. Admin types real custom lines manually
   * for comp shipping / manager overrides / special handling.
   */
  const matchedMeds: OtAllocationOverridePayload['meds'] = [];
  const customLineItems: OtAllocationOverridePayload['customLineItems'] = [];
  let multiPackageDefaultShipping = 0;
  let multiPackageDefaultConsult = 0;
  let multiMatchCount = 0;
  for (const li of line.invoiceLineItems ?? []) {
    const m = findOtPackageMatchForInvoiceLine(li.description, li.amountCents);
    if (!m) continue;
    multiMatchCount += 1;
    const tierLines = m.pkg.medLinesByTier?.[m.tier];
    if (tierLines && tierLines.length > 0) {
      for (const ml of tierLines) {
        matchedMeds.push({
          medicationKey: null,
          name: ml.name,
          strength: ml.strength,
          vialSize: ml.vialSize,
          quantity: ml.quantity,
          unitPriceCents: ml.unitPriceCents,
          lineTotalCents: ml.unitPriceCents * ml.quantity,
          source: 'catalog' as const,
          commissionRateBps: null,
        });
      }
    } else {
      matchedMeds.push({
        medicationKey: null,
        name: m.pkg.name,
        strength: m.pkg.subtitle ?? '',
        vialSize: OT_PACKAGE_TIER_LABELS[m.tier],
        quantity: 1,
        unitPriceCents: m.quote.costCents,
        lineTotalCents: m.quote.costCents,
        source: 'catalog' as const,
        commissionRateBps: null,
      });
    }
    /**
     * Fee defaults: take the **max** across matched packages so cold meds
     * bump shipping to $30 even when other items would default to $20,
     * and so a TRT package's $50 doctor consult survives bundling with an
     * oral package's $15 default.
     */
    multiPackageDefaultShipping = Math.max(multiPackageDefaultShipping, m.pkg.defaultShippingCents);
    multiPackageDefaultConsult = Math.max(multiPackageDefaultConsult, m.pkg.defaultConsultCents);
  }

  /**
   * If the multi-line matcher found anything, prefer that. If it found
   * nothing AND the gross matches a single tier, use the legacy single-
   * package path. Else fall back to per-Rx pharmacy lines.
   */
  const singleTierMatch =
    multiMatchCount === 0
      ? findOtPackageMatchByPatientGross(line.patientGrossCents, line.productDescription)
      : null;

  const meds: OtAllocationOverridePayload['meds'] =
    multiMatchCount > 0
      ? matchedMeds
      : singleTierMatch
        ? [
            {
              medicationKey: null,
              name: singleTierMatch.pkg.name,
              strength: singleTierMatch.pkg.subtitle ?? '',
              vialSize: OT_PACKAGE_TIER_LABELS[singleTierMatch.tier],
              quantity: 1,
              unitPriceCents: singleTierMatch.quote.costCents,
              lineTotalCents: singleTierMatch.quote.costCents,
              source: 'catalog' as const,
              commissionRateBps: null,
            },
          ]
        : pharmacyLines
            .filter((p) => p.orderId === line.orderId)
            .map((p) => ({
              medicationKey: p.medicationKey || null,
              name: p.medicationName,
              strength: p.strength,
              vialSize: p.vialSize,
              quantity: Math.max(1, p.quantity || 1),
              unitPriceCents: Math.max(0, p.unitPriceCents),
              lineTotalCents: Math.max(0, p.lineTotalCents),
              source: (p.pricingStatus === 'priced' ? 'catalog' : 'custom') as
                | 'catalog'
                | 'custom',
              commissionRateBps: null,
            }));

  const fallbackShipping = singleTierMatch
    ? singleTierMatch.pkg.defaultShippingCents
    : line.shippingCents;
  const fallbackConsult = singleTierMatch
    ? singleTierMatch.pkg.defaultConsultCents
    : line.doctorApprovalCents;

  return {
    meds,
    shippingCents: multiMatchCount > 0 ? multiPackageDefaultShipping : fallbackShipping,
    trtTelehealthCents: line.trtTelehealthCents,
    doctorRxFeeCents: multiMatchCount > 0 ? multiPackageDefaultConsult : fallbackConsult,
    fulfillmentFeesCents: line.fulfillmentFeesCents,
    customLineItems,
    notes: null,
    patientGrossCents: line.patientGrossCents,
    /**
     * Pre-fill the rep from the auto-assignment ledger when present so admins can leave
     * it alone unless they want to change it.
     */
    salesRepId: line.salesRepId ?? null,
    salesRepName: line.salesRepName ?? null,
    /**
     * Default to auto-rate, NOT to the ledger commission. The auto-rate
     * (8% new / 1% rebill on gross-minus-COGS) is the stakeholder's rule of
     * record for the manual reconciliation editor; the ledger commission
     * still drives payroll separately. Admin can type a manual $ override
     * per row to override the auto-rate.
     */
    salesRepCommissionCentsOverride: null,
    /**
     * Auto commission rate in basis points: 1% rebill / 8% new sale.
     * Only applies when `salesRepId != null` (no rep → 0 commission anyway).
     */
    commissionRateBps: line.isRebill ? 100 : 800,
    /**
     * `buildDefaultOverridePayload` is the Rx default builder; non-Rx rows go
     * through `buildDefaultNonRxOverridePayload` and carry their own chargeKind.
     */
    chargeKind: null,
  };
}

export interface OtCustomReconciliationLine {
  orderId: number;
  invoiceDbId: number | null;
  paidAt: string | null;
  patientName: string;
  /** Patient-facing product description (what they paid for). */
  productDescription: string | null;
  stripePaymentIntentId: string | null;
  /** Snapshot status — DRAFT (saved in editor), FINALIZED (locked), or null (computed-only, never edited). */
  overrideStatus: OtAllocationOverrideStatus | null;
  overrideUpdatedAt: string | null;
  overrideLastEditedByUserId: number | null;
  payload: OtAllocationOverridePayload;
  totals: OtAllocationOverrideTotals;
}

/**
 * Same shape as `OtCustomReconciliationLine` but keyed by `dispositionKey`
 * instead of `orderId`, with the chargeKind tag carried alongside. Renders
 * in the PDF as the "Non-Rx allocations" section.
 */
export interface OtCustomNonRxReconciliationLine {
  dispositionKey: string;
  invoiceDbId: number | null;
  paymentId: number | null;
  chargeKind: 'bloodwork' | 'consult' | 'other';
  paidAt: string | null;
  patientName: string;
  productDescription: string | null;
  overrideStatus: OtAllocationOverrideStatus | null;
  overrideUpdatedAt: string | null;
  overrideLastEditedByUserId: number | null;
  payload: OtAllocationOverridePayload;
  totals: OtAllocationOverrideTotals;
}

export interface OtCustomReconciliationGrandTotals {
  saleCount: number;
  draftCount: number;
  finalizedCount: number;
  computedCount: number;
  patientGrossCents: number;
  medicationsCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  doctorRxFeeCents: number;
  fulfillmentFeesCents: number;
  customLineItemsCents: number;
  salesRepCommissionCents: number;
  /** EONPro 5% on patient gross — auto-deducted from every transaction. */
  eonproFeeCents: number;
  /** Stripe / merchant processing 4% on patient gross — auto-deducted. */
  merchantProcessingFeeCents: number;
  /**
   * Auto-applied manager override commission (e.g. Antonio Escobar's 1%
   * on every applicable sale). Sum across all rows; the per-manager
   * payroll breakdown still reads from each row's
   * `totals.managerOverrideManagerName` to attribute.
   */
  managerOverrideCents: number;
  /**
   * Auto-applied doctor payout (e.g. Sergio Naccarato's $35 / $10 rule).
   * **Info-only** — NOT included in `totalDeductionsCents`. Surfaced in
   * the DOCTOR PAYOUTS section of the payroll breakdown PDF.
   */
  doctorPayoutCents: number;
  totalDeductionsCents: number;
  netToOtClinicCents: number;
}

export interface OtAllocationOverrideMeta {
  status: OtAllocationOverrideStatus;
  updatedAt: string;
  lastEditedByUserId: number | null;
  finalizedAt: string | null;
  payload: OtAllocationOverridePayload;
}

/**
 * Merge each per-sale row with its override (if any). For sales with no
 * override, the default payload is used (admin sees the computed values
 * pre-populated when they open the editor).
 *
 * Pure — does not mutate `data` or the override map.
 */
export function applyOtAllocationOverrides(
  data: OtDailyInvoices,
  overridesByOrderId: Map<number, OtAllocationOverrideMeta>,
  /**
   * Optional non-Rx overrides keyed by `dispositionKey`. When omitted (or empty),
   * non-Rx rows seed from `data.nonRxReconciliation` defaults — same UX as
   * "computed-only" Rx rows. Existing callers passing only the first two args
   * stay byte-compatible.
   */
  nonRxOverridesByKey: Map<string, OtAllocationOverrideMeta> = new Map()
): {
  lines: OtCustomReconciliationLine[];
  nonRxLines: OtCustomNonRxReconciliationLine[];
  totals: OtCustomReconciliationGrandTotals;
} {
  /**
   * First pass: build payloads (Rx + non-Rx) without computing totals yet.
   * We need the full payload set to aggregate per-rep new-sale gross
   * before pass 2 applies the volume-tier rate bump.
   */
  const rxPayloads = data.perSaleReconciliation.map((sale) => {
    const meta = overridesByOrderId.get(sale.orderId) ?? null;
    const payload = meta?.payload ?? buildDefaultOverridePayload(sale, data.pharmacy.lineItems);
    return { sale, meta, payload };
  });
  const nonRxPayloads = (data.nonRxReconciliation ?? []).map((row) => {
    const meta = nonRxOverridesByKey.get(row.dispositionKey) ?? null;
    const payload: OtAllocationOverridePayload = meta?.payload ?? {
      meds: [],
      shippingCents: row.shippingCents,
      trtTelehealthCents: row.trtTelehealthCents,
      doctorRxFeeCents: row.doctorApprovalCents,
      fulfillmentFeesCents: row.fulfillmentFeesCents,
      customLineItems: [],
      notes: null,
      patientGrossCents: row.patientGrossCents,
      salesRepId: row.salesRepId,
      salesRepName: row.salesRepName,
      /** Mirror the UI seed: default to auto-rate, not the ledger commission. */
      salesRepCommissionCentsOverride: null,
      commissionRateBps: row.isRebill ? 100 : 800,
      chargeKind: row.chargeKind,
    };
    return { row, meta, payload };
  });

  /**
   * Per-rep volume tier aggregation (per stakeholder rule 2026-05-02): sum
   * each rep's NEW-sale gross (rows where commissionRateBps === 800)
   * across both Rx and non-Rx, then resolve each rep's tier rate. Rebill
   * rows (1%) and rows with no rep are excluded.
   */
  const newSaleGrossByRepId = new Map<number, number>();
  for (const { payload } of [...rxPayloads, ...nonRxPayloads]) {
    if (payload.salesRepId == null) continue;
    if (payload.commissionRateBps !== 800) continue;
    newSaleGrossByRepId.set(
      payload.salesRepId,
      (newSaleGrossByRepId.get(payload.salesRepId) ?? 0) + payload.patientGrossCents
    );
  }
  const repTierRateBpsByRepId = new Map<number, number>();
  for (const [repId, total] of newSaleGrossByRepId) {
    repTierRateBpsByRepId.set(repId, getOtTieredNewSaleRateBps(total));
  }
  const resolveEffectiveRateBps = (payload: OtAllocationOverridePayload): number | undefined => {
    if (payload.salesRepId == null) return undefined;
    if (payload.commissionRateBps !== 800) return undefined;
    const tierBps = repTierRateBpsByRepId.get(payload.salesRepId);
    if (tierBps == null || tierBps <= 800) return undefined;
    return tierBps;
  };

  /** Second pass: compute per-row totals using each row's tier-resolved rate. */
  const lines: OtCustomReconciliationLine[] = rxPayloads.map(({ sale, meta, payload }) => {
    const totals = computeOtAllocationOverrideTotals(payload, resolveEffectiveRateBps(payload));
    return {
      orderId: sale.orderId,
      invoiceDbId: sale.invoiceDbId,
      paidAt: sale.paidAt,
      patientName: sale.patientName,
      productDescription: sale.productDescription,
      stripePaymentIntentId: null,
      overrideStatus: meta?.status ?? null,
      overrideUpdatedAt: meta?.updatedAt ?? null,
      overrideLastEditedByUserId: meta?.lastEditedByUserId ?? null,
      payload,
      totals,
    };
  });

  const nonRxLines: OtCustomNonRxReconciliationLine[] = nonRxPayloads.map(
    ({ row, meta, payload }) => {
      const totals = computeOtAllocationOverrideTotals(payload, resolveEffectiveRateBps(payload));
      return {
        dispositionKey: row.dispositionKey,
        invoiceDbId: row.invoiceDbId,
        paymentId: row.paymentId,
        chargeKind: row.chargeKind,
        paidAt: row.paidAt,
        patientName: row.patientName,
        productDescription: row.productDescription,
        overrideStatus: meta?.status ?? null,
        overrideUpdatedAt: meta?.updatedAt ?? null,
        overrideLastEditedByUserId: meta?.lastEditedByUserId ?? null,
        payload,
        totals,
      };
    }
  );

  const initial: OtCustomReconciliationGrandTotals = {
    saleCount: 0,
    draftCount: 0,
    finalizedCount: 0,
    computedCount: 0,
    patientGrossCents: 0,
    medicationsCents: 0,
    shippingCents: 0,
    trtTelehealthCents: 0,
    doctorRxFeeCents: 0,
    fulfillmentFeesCents: 0,
    customLineItemsCents: 0,
    salesRepCommissionCents: 0,
    eonproFeeCents: 0,
    merchantProcessingFeeCents: 0,
    managerOverrideCents: 0,
    doctorPayoutCents: 0,
    totalDeductionsCents: 0,
    netToOtClinicCents: 0,
  };

  /** Combined Rx + non-Rx grand totals — what the PDF prints. */
  const totals: OtCustomReconciliationGrandTotals = [...lines, ...nonRxLines].reduce(
    (acc, l) => {
      acc.saleCount += 1;
      if (l.overrideStatus === 'DRAFT') acc.draftCount += 1;
      else if (l.overrideStatus === 'FINALIZED') acc.finalizedCount += 1;
      else acc.computedCount += 1;
      acc.patientGrossCents += l.payload.patientGrossCents;
      acc.medicationsCents += l.totals.medicationsCents;
      acc.shippingCents += l.totals.shippingCents;
      acc.trtTelehealthCents += l.totals.trtTelehealthCents;
      acc.doctorRxFeeCents += l.totals.doctorRxFeeCents;
      acc.fulfillmentFeesCents += l.totals.fulfillmentFeesCents;
      acc.customLineItemsCents += l.totals.customLineItemsCents;
      acc.salesRepCommissionCents += l.totals.salesRepCommissionCents;
      acc.eonproFeeCents += l.totals.eonproFeeCents;
      acc.merchantProcessingFeeCents += l.totals.merchantProcessingFeeCents;
      acc.managerOverrideCents += l.totals.managerOverrideCents;
      acc.doctorPayoutCents += l.totals.doctorPayoutCents;
      acc.totalDeductionsCents += l.totals.totalDeductionsCents;
      acc.netToOtClinicCents += l.totals.netToOtClinicCents;
      return acc;
    },
    initial
  );

  return { lines, nonRxLines, totals };
}

/**
 * Branded multi-page PDF for the OT manual reconciliation. Modelled on
 * WellMedR's `need(h) / newPg()` pagination so 200+ sales render reliably.
 *
 * Layout:
 *   - Page 1 starts with EONPro logo, title, period, summary tiles.
 *   - Each sale renders as a stacked block: header band (paid, patient, gross),
 *     line items (one row per med + shipping + TRT + doctor + fulfillment + custom),
 *     totals row, and notes footer when present.
 *   - Final page repeats grand totals and a draft-vs-finalized count.
 *   - Footer on every page: "EONPro -> OT clinic reconciliation | Page N | Generated <ISO>".
 */
export async function generateOtCustomReconciliationPDF(
  data: OtDailyInvoices,
  reconciliation: {
    lines: OtCustomReconciliationLine[];
    /** Optional: non-Rx allocation rows. Rendered as a secondary section. */
    nonRxLines?: OtCustomNonRxReconciliationLine[];
    totals: OtCustomReconciliationGrandTotals;
  }
): Promise<Uint8Array> {
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
  const TW = PW - 2 * M;

  const dark = rgb(0.12, 0.12, 0.12);
  const mid = rgb(0.4, 0.4, 0.4);
  const light = rgb(0.6, 0.6, 0.6);
  const green = rgb(0.06, 0.45, 0.31);
  const rose = rgb(0.65, 0.12, 0.12);
  const greenBg = rgb(0.94, 0.97, 0.95);
  const draftBg = rgb(0.99, 0.95, 0.85);
  const finalizedBg = rgb(0.91, 0.96, 0.92);

  let page = doc.addPage([PW, PH]);
  let y = PH - M;
  let pageNum = 1;

  function drawText(s: string, x: number, sz: number, f = font, c = dark, yOverride?: number) {
    page.drawText(sanitizeForPdf(s), {
      x,
      y: yOverride ?? y,
      size: sz,
      font: f,
      color: c,
    });
  }
  function footer() {
    page.drawLine({
      start: { x: M, y: 28 },
      end: { x: PW - M, y: 28 },
      thickness: 0.4,
      color: rgb(0.88, 0.88, 0.88),
    });
    page.drawText(
      sanitizeForPdf(
        `EONPro -> OT clinic reconciliation  |  Page ${pageNum}  |  Generated ${new Date().toLocaleString('en-US')}`
      ),
      { x: M, y: 16, size: 6.5, font, color: light }
    );
  }
  function newPage() {
    footer();
    page = doc.addPage([PW, PH]);
    y = PH - M;
    pageNum += 1;
  }
  function need(h: number) {
    if (y - h < M + 22) newPage();
  }

  // ---- HEADER (page 1) ---------------------------------------------------
  if (logo) {
    const sc = 36 / logo.height;
    page.drawImage(logo, { x: M, y: y - 10, width: logo.width * sc, height: 36 });
  }
  y -= 4;
  drawText('OT CLINIC MANUAL RECONCILIATION', PW - M - 280, 13, fontBold, green);
  y -= 22;
  page.drawRectangle({ x: M, y, width: TW, height: 2, color: green });
  y -= 18;

  drawText(data.pharmacy.clinicName, M, 11, fontBold);
  drawText(
    `${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} — ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    PW - M - 200,
    9,
    font,
    mid
  );
  y -= 14;
  drawText(
    `${reconciliation.totals.saleCount} sales  |  ${reconciliation.totals.finalizedCount} finalized  |  ${reconciliation.totals.draftCount} draft  |  ${reconciliation.totals.computedCount} computed-only`,
    M,
    8,
    font,
    mid
  );
  drawText('Allocations elected by super-admin', PW - M - 200, 7.5, font, light);
  y -= 18;

  // ---- SUMMARY TILES -----------------------------------------------------
  function summaryRow(label: string, amt: number, bold = false) {
    need(16);
    drawText(label, M, 9.5, bold ? fontBold : font);
    drawText(`$${centsToDisplay(amt)}`, PW - M - 90, 9.5, bold ? fontBold : font);
    y -= 14;
  }
  summaryRow('Patient gross (sum)', reconciliation.totals.patientGrossCents);
  summaryRow('Less — Medications', reconciliation.totals.medicationsCents);
  summaryRow('Less — Shipping', reconciliation.totals.shippingCents);
  summaryRow('Less — TRT telehealth', reconciliation.totals.trtTelehealthCents);
  summaryRow('Less — Doctor consult', reconciliation.totals.doctorRxFeeCents);
  summaryRow('Less — Fulfillment fees', reconciliation.totals.fulfillmentFeesCents);
  summaryRow('Less — Custom line items', reconciliation.totals.customLineItemsCents);
  summaryRow('Less — Sales rep commission', reconciliation.totals.salesRepCommissionCents);
  if (reconciliation.totals.managerOverrideCents > 0) {
    summaryRow('Less — Manager override (auto)', reconciliation.totals.managerOverrideCents);
  }
  summaryRow(
    'Less — Merchant processing (4%)',
    reconciliation.totals.merchantProcessingFeeCents
  );
  summaryRow('Less — EONPro fee (5%)', reconciliation.totals.eonproFeeCents);
  y -= 4;
  page.drawLine({
    start: { x: M, y: y + 4 },
    end: { x: PW - M, y: y + 4 },
    thickness: 0.6,
    color: green,
  });
  y -= 4;
  summaryRow('Total deductions', reconciliation.totals.totalDeductionsCents, true);
  const netColor = reconciliation.totals.netToOtClinicCents < 0 ? rose : green;
  need(20);
  drawText('Net to OT clinic', M, 12, fontBold, netColor);
  drawText(
    `$${centsToDisplay(reconciliation.totals.netToOtClinicCents)}`,
    PW - M - 100,
    12,
    fontBold,
    netColor
  );
  y -= 22;

  // ---- PER-SALE BLOCKS ---------------------------------------------------
  if (reconciliation.lines.length > 0) {
    need(20);
    drawText('PER-SALE ALLOCATIONS', M, 10, fontBold, green);
    y -= 16;
  }

  for (const sale of reconciliation.lines) {
    const lineCount = sale.payload.meds.length + sale.payload.customLineItems.length + 4; // +4 for ship/trt/dr/fulfillment headers
    /** Estimate block height: header (24) + per-row * 13 + totals (28) + notes (varies). */
    const notesH = sale.payload.notes ? 22 : 0;
    const blockH = 24 + 13 * (lineCount + 2) + 28 + notesH + 8;
    need(blockH);

    // Header band
    const statusBg =
      sale.overrideStatus === 'FINALIZED'
        ? finalizedBg
        : sale.overrideStatus === 'DRAFT'
          ? draftBg
          : greenBg;
    page.drawRectangle({ x: M, y: y - 18, width: TW, height: 22, color: statusBg });
    drawText(sale.patientName, M + 6, 10, fontBold);
    const paidLbl = sale.paidAt
      ? new Date(sale.paidAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        })
      : '—';
    drawText(paidLbl, M + 200, 8.5, font, mid);
    drawText(
      `Order #${sale.orderId}${sale.invoiceDbId ? ' · Inv ' + sale.invoiceDbId : ''}`,
      M + 360,
      8.5,
      font,
      mid
    );
    /** Product description on a 2nd header line so reviewers see what was actually paid for. */
    if (sale.productDescription) {
      y -= 12;
      drawText(`Paid for: ${sale.productDescription}`, M + 6, 8, font, mid);
    }
    const statusLbl =
      sale.overrideStatus === 'FINALIZED'
        ? 'FINAL'
        : sale.overrideStatus === 'DRAFT'
          ? 'DRAFT'
          : 'COMPUTED';
    const statusC =
      sale.overrideStatus === 'FINALIZED'
        ? green
        : sale.overrideStatus === 'DRAFT'
          ? rgb(0.6, 0.42, 0.05)
          : light;
    drawText(statusLbl, PW - M - 50, 8.5, fontBold, statusC);
    y -= 24;

    // Line items
    function lineRow(label: string, amt: number, opts: { sub?: string; muted?: boolean } = {}) {
      need(13);
      drawText(label, M + 6, 9, font, opts.muted ? light : dark);
      if (opts.sub) drawText(opts.sub, M + 280, 8, font, light);
      drawText(`$${centsToDisplay(amt)}`, PW - M - 90, 9, font, dark);
      y -= 12;
    }

    drawText('Patient gross', M + 6, 9, fontBold);
    drawText(`$${centsToDisplay(sale.payload.patientGrossCents)}`, PW - M - 90, 9, fontBold);
    y -= 14;

    if (sale.payload.meds.length === 0) {
      lineRow('Medications', 0, { muted: true });
    } else {
      for (const m of sale.payload.meds) {
        const sub = `${m.strength}${m.vialSize ? ' · ' + m.vialSize : ''} · qty ${m.quantity} @ $${centsToDisplay(m.unitPriceCents)}${m.source === 'custom' ? ' (custom)' : ''}`;
        lineRow(`Med — ${m.name}`, m.lineTotalCents, { sub });
      }
    }
    lineRow('Shipping', sale.payload.shippingCents);
    lineRow('TRT telehealth', sale.payload.trtTelehealthCents);
    lineRow('Doctor consult', sale.payload.doctorRxFeeCents);
    lineRow('Fulfillment fees', sale.payload.fulfillmentFeesCents);
    for (const c of sale.payload.customLineItems) {
      lineRow(`Custom — ${c.description}`, c.amountCents);
    }
    /**
     * Always show the assigned rep on the row, even when the commission is
     * $0 (e.g. computed-only rows where no rate is applied yet). Admins
     * need to see the rep name on every sale to verify attribution
     * end-to-end.
     */
    if (sale.payload.salesRepName) {
      lineRow(`Sales rep — ${sale.payload.salesRepName}`, sale.totals.salesRepCommissionCents);
    } else {
      lineRow('Sales rep — (none assigned)', 0, { muted: true });
    }
    /** Platform fees — visible on every sale row so admins see why net ≠ gross. */
    if (sale.totals.merchantProcessingFeeCents > 0) {
      lineRow('Merchant processing (4%)', sale.totals.merchantProcessingFeeCents);
    }
    if (sale.totals.eonproFeeCents > 0) {
      lineRow('EONPro fee (5%)', sale.totals.eonproFeeCents);
    }
    if (sale.totals.managerOverrideCents > 0 && sale.totals.managerOverrideManagerName) {
      lineRow(
        `Manager override — ${sale.totals.managerOverrideManagerName} (1%)`,
        sale.totals.managerOverrideCents
      );
    }

    // Totals bar
    need(22);
    page.drawLine({
      start: { x: M, y: y + 6 },
      end: { x: PW - M, y: y + 6 },
      thickness: 0.4,
      color: rgb(0.88, 0.88, 0.88),
    });
    y -= 2;
    drawText('Total deductions', M + 6, 9.5, fontBold);
    drawText(`$${centsToDisplay(sale.totals.totalDeductionsCents)}`, PW - M - 90, 9.5, fontBold);
    y -= 14;
    const saleNetColor = sale.totals.netToOtClinicCents < 0 ? rose : green;
    drawText('Net to OT clinic', M + 6, 10, fontBold, saleNetColor);
    drawText(
      `$${centsToDisplay(sale.totals.netToOtClinicCents)}`,
      PW - M - 90,
      10,
      fontBold,
      saleNetColor
    );
    y -= 16;

    if (sale.payload.notes) {
      need(20);
      drawText('Notes:', M + 6, 7.5, fontBold, mid);
      const noteText =
        sale.payload.notes.length > 220
          ? sale.payload.notes.slice(0, 217) + '...'
          : sale.payload.notes;
      drawText(noteText, M + 36, 7.5, font, mid);
      y -= 14;
    }
    y -= 6;
  }

  // ---- NON-RX ALLOCATIONS SECTION ----------------------------------------
  // Rendered as a secondary section after Rx so the Rx layout stays first
  // (most reviewers focus on Rx); contributes to the same grand total which
  // is already summed in `reconciliation.totals`. Each row is tagged with
  // its chargeKind in the header band.
  // -----------------------------------------------------------------------
  const nonRxLines = reconciliation.nonRxLines ?? [];
  if (nonRxLines.length > 0) {
    need(28);
    y -= 6;
    drawText('NON-RX ALLOCATIONS', M, 10, fontBold, green);
    y -= 16;
    for (const sale of nonRxLines) {
      const lineCount = sale.payload.meds.length + sale.payload.customLineItems.length + 4;
      const notesH = sale.payload.notes ? 22 : 0;
      const blockH = 24 + 13 * (lineCount + 2) + 28 + notesH + 8;
      need(blockH);

      const statusBg =
        sale.overrideStatus === 'FINALIZED'
          ? finalizedBg
          : sale.overrideStatus === 'DRAFT'
            ? draftBg
            : greenBg;
      page.drawRectangle({ x: M, y: y - 18, width: TW, height: 22, color: statusBg });
      drawText(sale.patientName, M + 6, 10, fontBold);
      const paidLbl = sale.paidAt
        ? new Date(sale.paidAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York',
          })
        : '—';
      drawText(paidLbl, M + 200, 8.5, font, mid);
      const kindLabel =
        sale.chargeKind === 'bloodwork'
          ? 'Bloodwork / labs'
          : sale.chargeKind === 'consult'
            ? 'Consult / visit'
            : 'Other';
      drawText(`${kindLabel} · ${sale.dispositionKey}`, M + 360, 8.5, font, mid);
      if (sale.productDescription) {
        y -= 12;
        drawText(`Paid for: ${sale.productDescription}`, M + 6, 8, font, mid);
      }
      const statusLbl =
        sale.overrideStatus === 'FINALIZED'
          ? 'FINAL'
          : sale.overrideStatus === 'DRAFT'
            ? 'DRAFT'
            : 'COMPUTED';
      const statusC =
        sale.overrideStatus === 'FINALIZED'
          ? green
          : sale.overrideStatus === 'DRAFT'
            ? rgb(0.6, 0.42, 0.05)
            : light;
      drawText(statusLbl, PW - M - 50, 8.5, fontBold, statusC);
      y -= 24;

      function lineRow(label: string, amt: number, opts: { sub?: string; muted?: boolean } = {}) {
        need(13);
        drawText(label, M + 6, 9, font, opts.muted ? light : dark);
        if (opts.sub) drawText(opts.sub, M + 280, 8, font, light);
        drawText(`$${centsToDisplay(amt)}`, PW - M - 90, 9, font, dark);
        y -= 12;
      }

      drawText('Patient gross', M + 6, 9, fontBold);
      drawText(`$${centsToDisplay(sale.payload.patientGrossCents)}`, PW - M - 90, 9, fontBold);
      y -= 14;

      if (sale.payload.meds.length === 0) {
        lineRow('Service / cost lines', 0, { muted: true });
      } else {
        for (const m of sale.payload.meds) {
          const sub = `qty ${m.quantity} @ $${centsToDisplay(m.unitPriceCents)}${m.source === 'custom' ? ' (custom)' : ''}`;
          lineRow(`Service — ${m.name}`, m.lineTotalCents, { sub });
        }
      }
      lineRow('Shipping', sale.payload.shippingCents);
      lineRow('TRT telehealth', sale.payload.trtTelehealthCents);
      lineRow('Doctor consult', sale.payload.doctorRxFeeCents);
      lineRow('Fulfillment fees', sale.payload.fulfillmentFeesCents);
      for (const c of sale.payload.customLineItems) {
        lineRow(`Custom — ${c.description}`, c.amountCents);
      }
      if (sale.payload.salesRepName) {
        lineRow(`Sales rep — ${sale.payload.salesRepName}`, sale.totals.salesRepCommissionCents);
      } else {
        lineRow('Sales rep — (none assigned)', 0, { muted: true });
      }
      if (sale.totals.merchantProcessingFeeCents > 0) {
        lineRow('Merchant processing (4%)', sale.totals.merchantProcessingFeeCents);
      }
      if (sale.totals.eonproFeeCents > 0) {
        lineRow('EONPro fee (5%)', sale.totals.eonproFeeCents);
      }
      if (sale.totals.managerOverrideCents > 0 && sale.totals.managerOverrideManagerName) {
        lineRow(
          `Manager override — ${sale.totals.managerOverrideManagerName} (1%)`,
          sale.totals.managerOverrideCents
        );
      }

      need(22);
      page.drawLine({
        start: { x: M, y: y + 6 },
        end: { x: PW - M, y: y + 6 },
        thickness: 0.4,
        color: rgb(0.88, 0.88, 0.88),
      });
      y -= 2;
      drawText('Total deductions', M + 6, 9.5, fontBold);
      drawText(`$${centsToDisplay(sale.totals.totalDeductionsCents)}`, PW - M - 90, 9.5, fontBold);
      y -= 14;
      const saleNetColor = sale.totals.netToOtClinicCents < 0 ? rose : green;
      drawText('Net to OT clinic', M + 6, 10, fontBold, saleNetColor);
      drawText(
        `$${centsToDisplay(sale.totals.netToOtClinicCents)}`,
        PW - M - 90,
        10,
        fontBold,
        saleNetColor
      );
      y -= 16;

      if (sale.payload.notes) {
        need(20);
        drawText('Notes:', M + 6, 7.5, fontBold, mid);
        const noteText =
          sale.payload.notes.length > 220
            ? sale.payload.notes.slice(0, 217) + '...'
            : sale.payload.notes;
        drawText(noteText, M + 36, 7.5, font, mid);
        y -= 14;
      }
      y -= 6;
    }
  }

  // -------------------------------------------------------------------------
  // REP PAYROLL BREAKDOWN
  // -------------------------------------------------------------------------
  // Per-rep aggregation across both Rx + non-Rx sales for the period.
  // Each rep's row shows:
  //   - assigned commission tier (8% / 9% / 10% / 11% / 12%) based on their
  //     period new-sale gross
  //   - new vs rebill split (sale count + commission $ for each)
  //   - total commission $ to pay the rep
  //   - distance to next tier (when applicable) so admin sees how close
  //     they came to the next bonus
  // Sorted by commission desc so the largest payouts are on top.
  // -------------------------------------------------------------------------
  interface RepPayrollRow {
    repName: string;
    newSaleCount: number;
    rebillSaleCount: number;
    newSaleGrossCents: number;
    rebillGrossCents: number;
    newSaleCommissionCents: number;
    rebillCommissionCents: number;
    /**
     * Manager override commission earned BY this rep (when they're the
     * named manager on a rule). Sums across every sale where this rep's
     * name is the row's `managerOverrideManagerName`.
     */
    managerOverrideEarnedCents: number;
    /** How many sales this rep earned an override on. */
    managerOverrideSaleCount: number;
    /** Total commission across new + rebill + manager override; the actual payout. */
    totalCommissionCents: number;
    /** Resolved tier rate in basis points (800 / 900 / 1000 / 1100 / 1200). */
    tierRateBps: number;
  }
  const payrollByRep = new Map<string, RepPayrollRow>();
  const ensurePayrollRow = (repName: string): RepPayrollRow => {
    const existing = payrollByRep.get(repName);
    if (existing) return existing;
    const created: RepPayrollRow = {
      repName,
      newSaleCount: 0,
      rebillSaleCount: 0,
      newSaleGrossCents: 0,
      rebillGrossCents: 0,
      newSaleCommissionCents: 0,
      rebillCommissionCents: 0,
      managerOverrideEarnedCents: 0,
      managerOverrideSaleCount: 0,
      totalCommissionCents: 0,
      tierRateBps: 800,
    };
    payrollByRep.set(repName, created);
    return created;
  };
  let unassignedSaleCount = 0;
  let unassignedGrossCents = 0;
  let unassignedCommissionCents = 0;
  for (const sale of [...reconciliation.lines, ...nonRxLines]) {
    const repName = sale.payload.salesRepName?.trim() ?? '';
    if (!repName) {
      unassignedSaleCount += 1;
      unassignedGrossCents += sale.payload.patientGrossCents;
      unassignedCommissionCents += sale.totals.salesRepCommissionCents;
    } else {
      const cur = ensurePayrollRow(repName);
      const isRebillRow = sale.payload.commissionRateBps === 100;
      if (isRebillRow) {
        cur.rebillSaleCount += 1;
        cur.rebillGrossCents += sale.payload.patientGrossCents;
        cur.rebillCommissionCents += sale.totals.salesRepCommissionCents;
      } else {
        cur.newSaleCount += 1;
        cur.newSaleGrossCents += sale.payload.patientGrossCents;
        cur.newSaleCommissionCents += sale.totals.salesRepCommissionCents;
      }
      cur.totalCommissionCents += sale.totals.salesRepCommissionCents;
    }
    /**
     * Auto manager override: credit the named manager (e.g. Antonio
     * Escobar) for the override commission earned on this sale. The
     * manager appears in the payroll table even if they had zero direct
     * sales of their own — so a pure-manager rep still gets paid.
     */
    if (sale.totals.managerOverrideCents > 0 && sale.totals.managerOverrideManagerName) {
      const manager = ensurePayrollRow(sale.totals.managerOverrideManagerName);
      manager.managerOverrideEarnedCents += sale.totals.managerOverrideCents;
      manager.managerOverrideSaleCount += 1;
      manager.totalCommissionCents += sale.totals.managerOverrideCents;
    }
  }
  /** Resolve tier rate per rep once aggregation is complete. */
  for (const [, r] of payrollByRep) {
    r.tierRateBps = getOtTieredNewSaleRateBps(r.newSaleGrossCents);
  }
  const payrollRows = [...payrollByRep.values()].sort(
    (a, b) => b.totalCommissionCents - a.totalCommissionCents
  );

  /** Tier reference used in the legend + "next tier" hints below. */
  const tierThresholdsLowToHigh: Array<{ thresholdCents: number; rateBps: number }> = [
    { thresholdCents: 0, rateBps: 800 },
    { thresholdCents: 1_730_000, rateBps: 900 },
    { thresholdCents: 2_300_000, rateBps: 1000 },
    { thresholdCents: 2_900_000, rateBps: 1100 },
    { thresholdCents: 3_500_000, rateBps: 1200 },
  ];
  const formatTierLabel = (bps: number): string => {
    const decimals = bps % 100 === 0 ? 0 : 1;
    return `${(bps / 100).toFixed(decimals)}%`;
  };
  const nextTierGap = (currentNewSaleGrossCents: number, currentTierBps: number): string | null => {
    /** Find the lowest tier whose threshold exceeds the rep's current gross. */
    for (const t of tierThresholdsLowToHigh) {
      if (t.rateBps <= currentTierBps) continue;
      const gap = t.thresholdCents - currentNewSaleGrossCents;
      if (gap > 0) {
        return `$${centsToDisplay(gap)} away from ${formatTierLabel(t.rateBps)}`;
      }
    }
    return null; // top tier or no further tiers
  };

  /** Page break BEFORE the payroll section starts so it always begins fresh. */
  if (y < 200) {
    page = doc.addPage([PW, PH]);
    y = PH - M;
  }

  /** Bold green section divider. */
  page.drawRectangle({
    x: M,
    y: y - 6,
    width: PW - 2 * M,
    height: 2,
    color: green,
    opacity: 1,
  });
  y -= 18;
  drawText('REP PAYROLL BREAKDOWN', M, 13, fontBold, green);
  drawText(
    `${payrollRows.length} ${payrollRows.length === 1 ? 'rep' : 'reps'} · ${reconciliation.totals.saleCount} ${reconciliation.totals.saleCount === 1 ? 'sale' : 'sales'} · period commissions to be paid`,
    M,
    8,
    font,
    mid
  );
  y -= 12;
  drawText('NEW = first-time product purchase (8% base) · REBILL = repeat (1%)', M, 7, font, light);
  y -= 8;
  drawText(
    'Volume tiers: 8% base · $17,300+ → 9% · $23,000+ → 10% · $29,000+ → 11% · $35,000+ → 12% (NEW sales only)',
    M,
    7,
    font,
    light
  );
  y -= 16;

  /** Column geometry — wider rep column, sub-columns for new / rebill / total. */
  const colRepName = M + 4;
  const colTier = M + 152;
  const colNew = M + 200;
  const colRebill = M + 320;
  const colTotal = PW - M - 100;
  const numCol = (x: number) => x;

  /** Header band. */
  page.drawRectangle({
    x: M,
    y: y - 4,
    width: PW - 2 * M,
    height: 26,
    color: rgb(0.95, 0.97, 0.96),
    opacity: 1,
  });
  drawText('REP / TIER', colRepName, 7, fontBold, mid);
  drawText('NEW SALES', colNew, 7, fontBold, mid);
  drawText('REBILLS', colRebill, 7, fontBold, mid);
  drawText('PAYOUT', numCol(colTotal), 7, fontBold, mid);
  y -= 11;
  drawText('count · gross · commission', colNew, 6.5, font, light);
  drawText('count · gross · commission', colRebill, 6.5, font, light);
  drawText('total commission $', numCol(colTotal), 6.5, font, light);
  y -= 16;

  if (payrollRows.length === 0 && unassignedSaleCount === 0) {
    need(14);
    drawText('No sales in this period.', M + 4, 8, font, mid);
    y -= 14;
  } else {
    for (let i = 0; i < payrollRows.length; i += 1) {
      const r = payrollRows[i];
      need(34);
      /** Alternating row band for readability. */
      if (i % 2 === 0) {
        page.drawRectangle({
          x: M,
          y: y - 22,
          width: PW - 2 * M,
          height: 26,
          color: rgb(0.985, 0.99, 0.985),
          opacity: 1,
        });
      }
      /** Line 1: rep name + tier badge. */
      drawText(r.repName, colRepName, 9, fontBold, dark);
      const tierLabel = formatTierLabel(r.tierRateBps);
      const tierBadgeColor =
        r.tierRateBps >= 1100
          ? rgb(0.06, 0.45, 0.31) // green for top tiers
          : r.tierRateBps >= 900
            ? rgb(0.16, 0.5, 0.72) // blue for tier 9-10
            : rgb(0.45, 0.45, 0.45); // gray for base
      drawText(`Tier ${tierLabel}`, colTier, 8, fontBold, tierBadgeColor);

      /** Line 2: new sales + rebills + payout columns. */
      const yLine2 = y - 11;
      drawText(
        `${r.newSaleCount}  $${centsToDisplay(r.newSaleGrossCents)}  →  $${centsToDisplay(r.newSaleCommissionCents)}`,
        colNew,
        8,
        font,
        dark,
        yLine2
      );
      drawText(
        `${r.rebillSaleCount}  $${centsToDisplay(r.rebillGrossCents)}  →  $${centsToDisplay(r.rebillCommissionCents)}`,
        colRebill,
        8,
        font,
        dark,
        yLine2
      );
      drawText(
        `$${centsToDisplay(r.totalCommissionCents)}`,
        numCol(colTotal),
        10,
        fontBold,
        green,
        yLine2
      );

      /** Line 3: tier progress hint (only when not at top tier). */
      const hint = nextTierGap(r.newSaleGrossCents, r.tierRateBps);
      if (hint) {
        drawText(hint, colTier, 6.5, font, light, y - 21);
      } else if (r.tierRateBps === 1200) {
        drawText('Top tier — 12% achieved', colTier, 6.5, font, light, y - 21);
      }
      /** Manager override line — only when this rep earned override on others' sales. */
      if (r.managerOverrideEarnedCents > 0) {
        const overrideLabel = `+ Manager override on ${r.managerOverrideSaleCount} ${r.managerOverrideSaleCount === 1 ? 'sale' : 'sales'} = $${centsToDisplay(r.managerOverrideEarnedCents)}`;
        drawText(overrideLabel, colNew, 7, fontBold, rgb(0.16, 0.5, 0.72), y - 21);
      }
      y -= 28;
    }
    /**
     * Unassigned row — sales with no rep attached. Shown so the totals
     * reconcile against the period summary at the top.
     */
    if (unassignedSaleCount > 0) {
      need(20);
      drawText('(unassigned — no rep on row)', colRepName, 8.5, font, mid);
      drawText(
        `${unassignedSaleCount} sales · $${centsToDisplay(unassignedGrossCents)} gross`,
        colNew,
        8.5,
        font,
        mid
      );
      drawText(`$${centsToDisplay(unassignedCommissionCents)}`, numCol(colTotal), 9, font, mid);
      y -= 18;
    }
  }

  /** Bottom totals bar. */
  y -= 4;
  page.drawLine({
    start: { x: M, y: y + 2 },
    end: { x: PW - M, y: y + 2 },
    thickness: 1,
    color: green,
  });
  y -= 16;
  const totalSaleCount =
    payrollRows.reduce((s, r) => s + r.newSaleCount + r.rebillSaleCount, 0) + unassignedSaleCount;
  const totalGross =
    payrollRows.reduce((s, r) => s + r.newSaleGrossCents + r.rebillGrossCents, 0) +
    unassignedGrossCents;
  const totalNewSaleGross = payrollRows.reduce((s, r) => s + r.newSaleGrossCents, 0);
  const totalRebillGross = payrollRows.reduce((s, r) => s + r.rebillGrossCents, 0);
  const totalNewSaleCommission = payrollRows.reduce((s, r) => s + r.newSaleCommissionCents, 0);
  const totalRebillCommission = payrollRows.reduce((s, r) => s + r.rebillCommissionCents, 0);
  const totalCommission =
    payrollRows.reduce((s, r) => s + r.totalCommissionCents, 0) + unassignedCommissionCents;
  drawText('PERIOD TOTAL', colRepName, 10, fontBold, dark);
  drawText(`${totalSaleCount} sales`, colTier, 8, font, dark);
  drawText(
    `$${centsToDisplay(totalNewSaleGross)} → $${centsToDisplay(totalNewSaleCommission)}`,
    colNew,
    8,
    fontBold,
    dark
  );
  drawText(
    `$${centsToDisplay(totalRebillGross)} → $${centsToDisplay(totalRebillCommission)}`,
    colRebill,
    8,
    fontBold,
    dark
  );
  drawText(`$${centsToDisplay(totalCommission)}`, numCol(colTotal), 12, fontBold, green);
  y -= 16;
  drawText(
    `Combined gross $${centsToDisplay(totalGross)} · combined commission $${centsToDisplay(totalCommission)}`,
    M,
    7,
    font,
    light
  );
  y -= 14;

  /** Per-rep payout caption + tier explainer. */
  if (payrollRows.length > 0) {
    drawText(
      'PAY EACH REP THE PAYOUT COLUMN ABOVE. Tier rates auto-applied based on rep\u2019s NEW-sale gross for the period.',
      M,
      7.5,
      fontBold,
      mid
    );
    y -= 12;
  }

  // -------------------------------------------------------------------------
  // DOCTOR PAYOUTS
  // -------------------------------------------------------------------------
  // Info-only section — paid by EONPro out of margin, NOT deducted from
  // clinic net. Aggregates the auto doctor-payout rule (Sergio Naccarato's
  // $35 per TRT visit + $10 per Rx) across both Rx and non-Rx sales.
  // -------------------------------------------------------------------------
  interface DoctorPayoutRow {
    doctorName: string;
    trtVisitCount: number;
    trtPayoutCents: number;
    prescriptionCount: number;
    prescriptionPayoutCents: number;
    totalCents: number;
  }
  const doctorPayouts = new Map<string, DoctorPayoutRow>();
  for (const sale of [...reconciliation.lines, ...nonRxLines]) {
    if (sale.totals.doctorPayoutCents <= 0) continue;
    if (!sale.totals.doctorPayoutDoctorName) continue;
    const isTrt = sale.payload.trtTelehealthCents > 0;
    const cur = doctorPayouts.get(sale.totals.doctorPayoutDoctorName) ?? {
      doctorName: sale.totals.doctorPayoutDoctorName,
      trtVisitCount: 0,
      trtPayoutCents: 0,
      prescriptionCount: 0,
      prescriptionPayoutCents: 0,
      totalCents: 0,
    };
    if (isTrt) {
      cur.trtVisitCount += 1;
      cur.trtPayoutCents += sale.totals.doctorPayoutCents;
    } else {
      cur.prescriptionCount += 1;
      cur.prescriptionPayoutCents += sale.totals.doctorPayoutCents;
    }
    cur.totalCents += sale.totals.doctorPayoutCents;
    doctorPayouts.set(sale.totals.doctorPayoutDoctorName, cur);
  }
  const doctorPayoutRows = [...doctorPayouts.values()].sort(
    (a, b) => b.totalCents - a.totalCents
  );

  if (doctorPayoutRows.length > 0) {
    /** Page break BEFORE the doctor payouts section if we're near the bottom. */
    if (y < 180) {
      page = doc.addPage([PW, PH]);
      y = PH - M;
    }
    /** Section divider. */
    page.drawRectangle({
      x: M,
      y: y - 6,
      width: PW - 2 * M,
      height: 2,
      color: rgb(0.16, 0.5, 0.72), // blue divider distinguishes from rep payroll's green
      opacity: 1,
    });
    y -= 18;
    drawText('DOCTOR PAYOUTS', M, 13, fontBold, rgb(0.16, 0.5, 0.72));
    drawText(
      `${doctorPayoutRows.length} ${doctorPayoutRows.length === 1 ? 'doctor' : 'doctors'} · paid by EONPro (info only — does not affect clinic net)`,
      M,
      8,
      font,
      mid
    );
    y -= 12;
    drawText(
      'Rule: $35 per TRT telehealth visit · $10 per prescription written (when no TRT visit on the sale)',
      M,
      7,
      font,
      light
    );
    y -= 16;

    /** Column geometry for the doctor table. */
    const dColDoctor = M + 4;
    const dColTrt = M + 200;
    const dColRx = M + 340;
    const dColTotal = PW - M - 100;

    /** Header band. */
    page.drawRectangle({
      x: M,
      y: y - 4,
      width: PW - 2 * M,
      height: 26,
      color: rgb(0.94, 0.97, 1.0),
      opacity: 1,
    });
    drawText('DOCTOR', dColDoctor, 7, fontBold, mid);
    drawText('TRT TELEHEALTH', dColTrt, 7, fontBold, mid);
    drawText('PRESCRIPTIONS', dColRx, 7, fontBold, mid);
    drawText('PAYOUT', dColTotal, 7, fontBold, mid);
    y -= 11;
    drawText('count × $35', dColTrt, 6.5, font, light);
    drawText('count × $10', dColRx, 6.5, font, light);
    drawText('total $', dColTotal, 6.5, font, light);
    y -= 16;

    for (let i = 0; i < doctorPayoutRows.length; i += 1) {
      const r = doctorPayoutRows[i];
      need(20);
      if (i % 2 === 0) {
        page.drawRectangle({
          x: M,
          y: y - 16,
          width: PW - 2 * M,
          height: 20,
          color: rgb(0.985, 0.99, 1.0),
          opacity: 1,
        });
      }
      drawText(r.doctorName, dColDoctor, 9, fontBold, dark);
      drawText(
        `${r.trtVisitCount} × $35 = $${centsToDisplay(r.trtPayoutCents)}`,
        dColTrt,
        8,
        font,
        dark
      );
      drawText(
        `${r.prescriptionCount} × $10 = $${centsToDisplay(r.prescriptionPayoutCents)}`,
        dColRx,
        8,
        font,
        dark
      );
      drawText(
        `$${centsToDisplay(r.totalCents)}`,
        dColTotal,
        10,
        fontBold,
        rgb(0.16, 0.5, 0.72)
      );
      y -= 22;
    }

    /** Bottom totals bar. */
    y -= 4;
    page.drawLine({
      start: { x: M, y: y + 2 },
      end: { x: PW - M, y: y + 2 },
      thickness: 1,
      color: rgb(0.16, 0.5, 0.72),
    });
    y -= 16;
    const totalTrtCount = doctorPayoutRows.reduce((s, r) => s + r.trtVisitCount, 0);
    const totalTrtPayout = doctorPayoutRows.reduce((s, r) => s + r.trtPayoutCents, 0);
    const totalRxCount = doctorPayoutRows.reduce((s, r) => s + r.prescriptionCount, 0);
    const totalRxPayout = doctorPayoutRows.reduce((s, r) => s + r.prescriptionPayoutCents, 0);
    const totalDoctorPayout = doctorPayoutRows.reduce((s, r) => s + r.totalCents, 0);
    drawText('PERIOD TOTAL', dColDoctor, 10, fontBold, dark);
    drawText(
      `${totalTrtCount} visits · $${centsToDisplay(totalTrtPayout)}`,
      dColTrt,
      8,
      fontBold,
      dark
    );
    drawText(
      `${totalRxCount} Rxs · $${centsToDisplay(totalRxPayout)}`,
      dColRx,
      8,
      fontBold,
      dark
    );
    drawText(
      `$${centsToDisplay(totalDoctorPayout)}`,
      dColTotal,
      12,
      fontBold,
      rgb(0.16, 0.5, 0.72)
    );
    y -= 16;
    drawText(
      'PAY EACH DOCTOR THE PAYOUT COLUMN ABOVE. EONPro covers this fee out of margin.',
      M,
      7.5,
      fontBold,
      mid
    );
    y -= 12;
  }

  footer();
  return doc.save();
}
