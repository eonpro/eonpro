/**
 * OT Reconciliation — Non-Rx Disposition Builder
 *
 * Pure-function module that turns the non-pharmacy charges already discovered
 * by `generateOtDailyInvoices` into one editable reconciliation row per
 * disposition unit, mirroring the Rx-side `OtPerSaleReconciliationLine`.
 *
 * A "disposition unit" is:
 *   - a non-Rx Stripe Invoice (when an `invoiceId` is present on its payments)
 *   - or a single standalone Payment row (when `invoiceId` is null)
 *
 * Refund handling:
 *   - **Fully refunded** payments are excluded entirely (no row produced).
 *   - **Partially refunded** payments are included; their contribution to the
 *     row's gross is the `netCollectedCents` (after the partial refund), so the
 *     row reconciles to actual cash collected.
 *
 * No I/O. Safe to import in tests, server-only services, or client code that
 * needs to recompute defaults locally.
 */

import {
  OT_BLOODWORK_DOCTOR_FEE_CENTS,
  OT_MERCHANT_PROCESSING_BPS,
  OT_PLATFORM_COMPENSATION_BPS,
  classifyOtNonPharmacyChargeLine,
} from '@/lib/invoices/ot-pricing';
import type { OtNonRxChargeKind } from '@/services/invoices/otAllocationOverrideTypes';
import type {
  OtNonRxChargeLineItem,
  OtPaymentCollectionRow,
} from '@/services/invoices/otInvoiceGenerationService';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * One editable disposition row for a non-Rx charge. Shape parallels
 * `OtPerSaleReconciliationLine` so the editor can render either kind through a
 * unified seed type.
 */
export interface OtNonRxReconciliationLine {
  /** `'inv:<invoiceId>'` or `'pay:<paymentId>'` — upsert key for the override. */
  dispositionKey: string;
  dispositionType: 'invoice' | 'payment';
  invoiceDbId: number | null;
  paymentId: number | null;
  chargeKind: OtNonRxChargeKind;
  paidAt: string | null;
  patientId: number;
  patientName: string;
  /** Joined invoice line descriptions, or the payment description. */
  productDescription: string;
  /**
   * Cash actually collected for this row in the period — sum of
   * `netCollectedCents` across the row's contributing payments.
   * Partially-refunded payments reduce this; fully-refunded payments are
   * excluded before grouping so they never contribute.
   */
  patientGrossCents: number;
  /** Default 0 — admin types in the lab/consult cost in the editor. */
  medicationsCostCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  /** medicationsCostCents + shippingCents + trtTelehealthCents (parity with Rx). */
  pharmacyTotalCents: number;
  doctorApprovalCents: number;
  fulfillmentFeesCents: number;
  /** 4% of patientGrossCents, rounded. */
  merchantProcessingCents: number;
  /** 10% of patientGrossCents, rounded. */
  platformCompensationCents: number;
  /** Defaults to 0; populated from commission ledger lookup at upstream wiring. */
  salesRepCommissionCents: number;
  salesRepId: number | null;
  salesRepName: string | null;
  managerOverrideTotalCents: number;
  managerOverrideSummary: string | null;
  totalDeductionsCents: number;
  clinicNetPayoutCents: number;
  /**
   * True when the patient had any prior paid Rx invoice at this clinic within
   * the last 30 days before this row's `paidAt`. Drives the auto commission
   * rate (1% rebill / 8% new) on the non-Rx editor.
   */
  isRebill: boolean;
}

export interface BuildOtNonRxReconciliationArgs {
  /** Source-of-truth payment list from `generateOtDailyInvoices`. */
  paymentCollections: OtPaymentCollectionRow[];
  /**
   * Pre-classified non-Rx invoice lines from `generateOtDailyInvoices`.
   * Used to pick the row's `chargeKind` and product description when the row
   * is keyed off an invoice.
   */
  nonRxChargeLineItems: OtNonRxChargeLineItem[];
  /**
   * Set of invoice ids whose payments were already attributed to pharmacy
   * COGS — those rows belong on the Rx side, not here.
   */
  invoiceDbIdsUsedForCogs: Set<number>;
  /**
   * Optional: for each patientId, the list of paid Rx invoice timestamps at
   * this clinic. Used to flag a non-Rx row as a rebill when the patient had
   * any paid Rx within 30 days before the row's `paidAt`. Omit / pass an
   * empty map to treat all rows as new sales (legacy behavior).
   *
   * @deprecated Use `isRebillForRow` for product-aware rebill detection.
   */
  paidRxHistoryByPatient?: Map<number, ReadonlyArray<{ paidAt: Date }>>;
  /**
   * Optional: predicate that returns true when a non-Rx row is a rebill,
   * given the row's patientId, paidAt, and chargeKind. Lets the caller use
   * a richer per-product detector (e.g. matching by chargeKind across the
   * patient's full purchase history) instead of the legacy 30-day window.
   *
   * If both this and `paidRxHistoryByPatient` are passed, this predicate
   * wins (the legacy field is ignored).
   */
  isRebillForRow?: (args: {
    patientId: number;
    paidAt: Date | null;
    chargeKind: OtNonRxChargeKind;
    invoiceId: number | null;
    paymentId: number | null;
  }) => boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Builds a row from one or more contributing payments. Sums net cash, derives
 * fees, and seeds editable fields to defaults. The disposition key is the
 * caller's responsibility (so it can encode either invoice or payment).
 */
const REBILL_LOOKBACK_DAYS = 30;
const REBILL_LOOKBACK_MS = REBILL_LOOKBACK_DAYS * 86_400_000;

/**
 * Returns true when the patient has any paid Rx invoice within the last
 * `REBILL_LOOKBACK_DAYS` days before `paidAt`. `null` paidAt → false (we
 * can't determine recency without a reference time, so default to "new").
 */
function patientHadRecentPaidRx(
  patientId: number,
  paidAt: Date | null,
  history: Map<number, ReadonlyArray<{ paidAt: Date }>> | undefined
): boolean {
  if (!history || !paidAt) return false;
  const list = history.get(patientId);
  if (!list || list.length === 0) return false;
  const refMs = paidAt.getTime();
  for (const inv of list) {
    const t = inv.paidAt.getTime();
    if (t < refMs && refMs - t <= REBILL_LOOKBACK_MS) return true;
  }
  return false;
}

function buildLineFromPayments(
  dispositionKey: string,
  dispositionType: 'invoice' | 'payment',
  invoiceDbId: number | null,
  paymentId: number | null,
  payments: OtPaymentCollectionRow[],
  chargeKind: OtNonRxChargeKind,
  productDescription: string,
  isRebill: boolean
): OtNonRxReconciliationLine {
  const patientGrossCents = payments.reduce((s, p) => s + p.netCollectedCents, 0);
  /**
   * Use the earliest paidAt (if any) so the row sorts to when the patient
   * first transacted, matching how Rx sales sort by `paidAt`.
   */
  const earliestPaidAt = payments.reduce<string | null>((acc, p) => {
    if (!p.paidAt) return acc;
    if (!acc) return p.paidAt;
    return new Date(p.paidAt).getTime() < new Date(acc).getTime() ? p.paidAt : acc;
  }, null);
  const merchantProcessingCents = Math.round(
    (patientGrossCents * OT_MERCHANT_PROCESSING_BPS) / 10_000
  );
  const platformCompensationCents = Math.round(
    (patientGrossCents * OT_PLATFORM_COMPENSATION_BPS) / 10_000
  );
  /**
   * Bloodwork sales default to a $10 doctor / Rx review fee per stakeholder
   * direction (2026-05-02). Consult and 'other' rows still default to $0
   * — admins type the appropriate fee in the editor.
   */
  const doctorApprovalCents = chargeKind === 'bloodwork' ? OT_BLOODWORK_DOCTOR_FEE_CENTS : 0;
  /**
   * Shipping defaults per stakeholder direction (2026-05-02):
   *   - bloodwork → $0 (specimens go straight to Quest/Labcorp)
   *   - consult   → $0 (telehealth visits — nothing physical ships)
   *   - other     → $20 (non-Rx product that physically ships to the patient)
   * Admin can override per row.
   */
  const shippingCents = chargeKind === 'other' ? 2000 : 0;
  const totalDeductionsCents =
    merchantProcessingCents + platformCompensationCents + doctorApprovalCents + shippingCents;
  return {
    dispositionKey,
    dispositionType,
    invoiceDbId,
    paymentId,
    chargeKind,
    paidAt: earliestPaidAt,
    patientId: payments[0].patientId,
    patientName: payments[0].patientName,
    productDescription,
    patientGrossCents,
    medicationsCostCents: 0,
    shippingCents,
    trtTelehealthCents: 0,
    pharmacyTotalCents: 0,
    doctorApprovalCents,
    fulfillmentFeesCents: 0,
    merchantProcessingCents,
    platformCompensationCents,
    salesRepCommissionCents: 0,
    salesRepId: null,
    salesRepName: null,
    managerOverrideTotalCents: 0,
    managerOverrideSummary: null,
    totalDeductionsCents,
    clinicNetPayoutCents: patientGrossCents - totalDeductionsCents,
    isRebill,
  };
}

/** Picks a chargeKind for an invoice-keyed row from its line items, with a sensible fallback. */
function inferInvoiceChargeKind(
  invoiceDbId: number,
  nonRxChargeLineItems: OtNonRxChargeLineItem[]
): { chargeKind: OtNonRxChargeKind; productDescription: string } {
  const lines = nonRxChargeLineItems.filter((l) => l.invoiceDbId === invoiceDbId);
  if (lines.length === 0) {
    return { chargeKind: 'other', productDescription: '' };
  }
  /**
   * If any line is bloodwork → bloodwork; else if any is consult → consult;
   * else 'other'. Bloodwork is the most actionable label and we prefer to
   * surface it even when the invoice mixes bloodwork + consult.
   */
  const kinds = new Set(lines.map((l) => l.chargeKind));
  const chargeKind: OtNonRxChargeKind = kinds.has('bloodwork')
    ? 'bloodwork'
    : kinds.has('consult')
      ? 'consult'
      : 'other';
  /** Joined description trimmed to a sensible UI length. */
  const productDescription = lines
    .map((l) => l.description)
    .filter((s) => s && s.trim())
    .join(' · ')
    .slice(0, 200);
  return { chargeKind, productDescription };
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the non-Rx reconciliation rows for a period. Pure function — caller
 * supplies all upstream data.
 */
export function buildOtNonRxReconciliation(
  args: BuildOtNonRxReconciliationArgs
): OtNonRxReconciliationLine[] {
  const { paymentCollections, nonRxChargeLineItems, invoiceDbIdsUsedForCogs } = args;
  const paidRxHistoryByPatient = args.paidRxHistoryByPatient;

  /** Step 1: filter out fully-refunded payments and Rx-attributed payments. */
  const candidates = paymentCollections.filter((p) => {
    if (p.isFullyRefunded) return false;
    if (p.invoiceId != null && invoiceDbIdsUsedForCogs.has(p.invoiceId)) return false;
    return true;
  });

  /** Step 2: bucket by invoiceId when present, else key by paymentId. */
  const byInvoice = new Map<number, OtPaymentCollectionRow[]>();
  const standalone: OtPaymentCollectionRow[] = [];
  for (const p of candidates) {
    if (p.invoiceId != null) {
      const bucket = byInvoice.get(p.invoiceId) ?? [];
      bucket.push(p);
      byInvoice.set(p.invoiceId, bucket);
    } else {
      standalone.push(p);
    }
  }

  const rows: OtNonRxReconciliationLine[] = [];

  /** Step 3a: invoice-keyed rows. */
  for (const [invoiceDbId, payments] of byInvoice.entries()) {
    const { chargeKind, productDescription } = inferInvoiceChargeKind(
      invoiceDbId,
      nonRxChargeLineItems
    );
    /** Use earliest paidAt across the row's payments as the rebill reference. */
    const earliestPaidAtMs = payments.reduce<number | null>((acc, p) => {
      if (!p.paidAt) return acc;
      const t = new Date(p.paidAt).getTime();
      if (acc === null) return t;
      return t < acc ? t : acc;
    }, null);
    const earliestPaidAt = earliestPaidAtMs !== null ? new Date(earliestPaidAtMs) : null;
    const isRebill = args.isRebillForRow
      ? args.isRebillForRow({
          patientId: payments[0].patientId,
          paidAt: earliestPaidAt,
          chargeKind,
          invoiceId: invoiceDbId,
          paymentId: null,
        })
      : patientHadRecentPaidRx(payments[0].patientId, earliestPaidAt, paidRxHistoryByPatient);
    rows.push(
      buildLineFromPayments(
        `inv:${invoiceDbId}`,
        'invoice',
        invoiceDbId,
        null,
        payments,
        chargeKind,
        productDescription,
        isRebill
      )
    );
  }

  /** Step 3b: standalone (invoice-less) payment rows. */
  for (const p of standalone) {
    /** Classify from the payment description — invoice-less rows have no line items. */
    const chargeKind = classifyOtNonPharmacyChargeLine(p.description ?? '', p.amountCents);
    const paidAtDate = p.paidAt ? new Date(p.paidAt) : null;
    const isRebill = args.isRebillForRow
      ? args.isRebillForRow({
          patientId: p.patientId,
          paidAt: paidAtDate,
          chargeKind,
          invoiceId: null,
          paymentId: p.paymentId,
        })
      : patientHadRecentPaidRx(p.patientId, paidAtDate, paidRxHistoryByPatient);
    rows.push(
      buildLineFromPayments(
        `pay:${p.paymentId}`,
        'payment',
        null,
        p.paymentId,
        [p],
        chargeKind,
        p.description ?? '',
        isRebill
      )
    );
  }

  /** Step 4: stable order by paidAt asc → dispositionKey asc to break ties. */
  rows.sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.dispositionKey.localeCompare(b.dispositionKey);
  });

  return rows;
}
