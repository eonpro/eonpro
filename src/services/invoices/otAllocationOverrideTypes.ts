/**
 * OT Manual Reconciliation — allocation override payload contract
 *
 * Single source of truth for the per-Order override blob stored in
 * `OtSaleAllocationOverride.overridePayload`. Used by:
 *   - super-admin UI (editable per-sale rows)
 *   - GET/POST `/api/super-admin/ot-overrides` (Zod validation + types)
 *   - `generateOtCustomReconciliationPDF` (renders these fields)
 *
 * Stored as a FULL SNAPSHOT (not sparse) so a draft from last week reads back
 * identically even if `OT_PRODUCT_PRICES` changes in between.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const cents = z.number().int().min(0).max(10_000_000); // <= $100k per line, sanity cap

export const otAllocationOverrideMedLineSchema = z.object({
  /** Set when picked from OT_PRODUCT_PRICES; null for free-form custom meds. */
  medicationKey: z.string().min(1).max(64).nullable(),
  name: z.string().trim().min(1).max(120),
  strength: z.string().trim().max(80).default(''),
  vialSize: z.string().trim().max(80).default(''),
  quantity: z.number().int().min(1).max(1000),
  unitPriceCents: cents,
  lineTotalCents: cents,
  source: z.enum(['catalog', 'custom']),
  /**
   * Optional per-line sales-rep commission rate in basis points (8% = 800).
   * When set, contributes `lineTotalCents * commissionRateBps / 10000` to the
   * sale's commission. Null = no rate set on this line. Capped at 5000 bps (50%)
   * for sanity.
   */
  commissionRateBps: z.number().int().min(0).max(5000).nullable().default(null),
});

export const otAllocationOverrideCustomLineSchema = z.object({
  description: z.string().trim().min(1).max(160),
  amountCents: cents,
});

/**
 * Snapshot of the classified non-pharmacy charge kind at edit time. Mirrors
 * the `OtNonRxChargeKind` enum on `OtNonRxAllocationOverride`. Always `null`
 * for Rx overrides (`OtSaleAllocationOverride`) — the field is optional and
 * defaults to null to keep existing Rx payloads byte-compatible after parse.
 */
export const otNonRxChargeKindSchema = z.enum(['bloodwork', 'consult', 'other']);

export const otAllocationOverridePayloadSchema = z.object({
  meds: z.array(otAllocationOverrideMedLineSchema).max(20),
  shippingCents: cents,
  trtTelehealthCents: cents,
  doctorRxFeeCents: cents,
  fulfillmentFeesCents: cents,
  customLineItems: z.array(otAllocationOverrideCustomLineSchema).max(20),
  /**
   * Notes are admin-typed reconciliation context; capped to discourage PHI.
   * Logged by id only — never log this field.
   */
  notes: z.string().trim().max(1000).nullable(),
  /**
   * Snapshot of patient gross at edit time so the PDF reproduces the same math
   * even if the underlying Payment row is later refunded/edited.
   */
  patientGrossCents: cents,
  /**
   * Sales rep manually assigned to this sale by super-admin.
   * Null = no manual override; the sale's auto-assigned rep (from the commission
   * ledger) is used instead. Setting this overrides whatever the ledger says.
   */
  salesRepId: z.number().int().positive().nullable().default(null),
  /** Display-name snapshot for the assigned rep (so the saved row is self-describing). */
  salesRepName: z.string().trim().max(120).nullable().default(null),
  /**
   * Manual override for the rep's commission cents. When null, total commission
   * is computed by `computeOtSalesRepCommissionCents` (see precedence below).
   * When set, this replaces every other rule.
   */
  salesRepCommissionCentsOverride: cents.nullable().default(null),
  /**
   * Payload-level commission rate in basis points (e.g. 800 = 8%). Applied
   * against `max(0, patientGrossCents − Σ med.lineTotalCents)` (gross minus
   * medications COGS). Set automatically by `buildDefaultOverridePayload`:
   * 800 for new sales, 100 for rebills (≤30 days since prior paid Rx).
   * Optional + nullable + default-null for back-compat with overrides saved
   * before this field shipped — those continue to compute commission from
   * the legacy per-`meds[]`-line rate.
   */
  commissionRateBps: z.number().int().min(0).max(5000).nullable().optional().default(null),
  /**
   * Non-Rx classification: `'bloodwork' | 'consult' | 'other'` for non-Rx
   * disposition rows; `null` for Rx rows. Optional + nullable + default-null
   * so existing Rx payloads written before this field shipped continue to
   * round-trip with `chargeKind === null`.
   */
  chargeKind: otNonRxChargeKindSchema.nullable().optional().default(null),
});

export const otAllocationOverrideStatusSchema = z.enum(['DRAFT', 'FINALIZED']);

export const otAllocationOverrideUpsertSchema = z.object({
  orderId: z.number().int().positive(),
  payload: otAllocationOverridePayloadSchema,
  status: otAllocationOverrideStatusSchema,
});

// ---------------------------------------------------------------------------
// Inferred types — import these everywhere instead of redeclaring shapes.
// ---------------------------------------------------------------------------

export type OtAllocationOverrideMedLine = z.infer<typeof otAllocationOverrideMedLineSchema>;
export type OtAllocationOverrideCustomLine = z.infer<typeof otAllocationOverrideCustomLineSchema>;
export type OtAllocationOverridePayload = z.infer<typeof otAllocationOverridePayloadSchema>;
export type OtAllocationOverrideStatus = z.infer<typeof otAllocationOverrideStatusSchema>;
export type OtAllocationOverrideUpsertInput = z.infer<typeof otAllocationOverrideUpsertSchema>;
export type OtNonRxChargeKind = z.infer<typeof otNonRxChargeKindSchema>;

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — safe to import in client components for live recompute).
// ---------------------------------------------------------------------------

export interface OtAllocationOverrideTotals {
  medicationsCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  doctorRxFeeCents: number;
  fulfillmentFeesCents: number;
  customLineItemsCents: number;
  /** Sales rep commission, computed from per-line rates or from the manual override. */
  salesRepCommissionCents: number;
  /**
   * EONPro 5% fee on patient gross — auto-deducted from every transaction.
   * Always set to `round(patientGrossCents × 5%)`; not a separate input field
   * (the rate is fixed at the platform level).
   */
  eonproFeeCents: number;
  /**
   * Stripe / merchant processing 4% on patient gross — also auto-deducted
   * from every transaction. Computed as `round(patientGrossCents × 4%)`.
   * Per-row visibility into what the card processor took, so the row's
   * "Net to OT clinic" reflects the actual payout.
   */
  merchantProcessingFeeCents: number;
  /**
   * Auto-applied manager override (e.g. Antonio Escobar's 1% on every
   * applicable sale). Cents are computed via `getOtAutoManagerOverrideForSale`
   * and deducted from clinic net the same way sales rep commission is.
   * Zero when no rule applies (manager's own sales, excluded reps, etc.).
   */
  managerOverrideCents: number;
  /** Manager who earns `managerOverrideCents` for this sale; null when none. */
  managerOverrideManagerName: string | null;
  /** Sum of everything billable to the OT clinic. */
  totalDeductionsCents: number;
  /** patientGrossCents - totalDeductionsCents (may be negative if admin over-allocates). */
  netToOtClinicCents: number;
}

/**
 * EONPro per-transaction fee rate in basis points (500 = 5%). Single source
 * of truth for the editor's Live Totals — server-side
 * `OtPerSaleReconciliationLine.platformCompensationCents` uses the same
 * rate via `OT_EONPRO_FEE_BPS` in `ot-pricing.ts`.
 */
export const OT_EONPRO_FEE_BPS = 500;

/**
 * Volume-tiered NEW-sale commission rate (per stakeholder direction
 * 2026-05-02). For the rep's selected-period total NEW-sale gross:
 *
 *   $0+        → 8%   (base)
 *   $17,300+   → 9%   (+1% volume bonus)
 *   $23,000+   → 10%  (+2%)
 *   $29,000+   → 11%  (+3%)
 *   $35,000+   → 12%  (+4%)
 *
 * Rebills (1%) DO NOT tier — only the NEW-sale base rate gets the bump.
 * Tiers apply against the rep's combined Rx + non-Rx new-sale gross in
 * whatever period the admin generated the report for.
 */
export const OT_REP_COMMISSION_TIERS: ReadonlyArray<{
  thresholdCents: number;
  rateBps: number;
}> = [
  { thresholdCents: 3_500_000, rateBps: 1200 }, // $35,000+ → 12%
  { thresholdCents: 2_900_000, rateBps: 1100 }, // $29,000+ → 11%
  { thresholdCents: 2_300_000, rateBps: 1000 }, // $23,000+ → 10%
  { thresholdCents: 1_730_000, rateBps: 900 }, // $17,300+ → 9%
  { thresholdCents: 0, rateBps: 800 }, // $0+ → 8% (base)
];

/**
 * Resolve the effective NEW-sale commission rate for a rep given their
 * total period new-sale gross. Returns the highest-tier rate whose
 * threshold is met. Returns 800 (8%) for the base tier.
 */
export function getOtTieredNewSaleRateBps(repTotalNewSaleGrossCents: number): number {
  for (const tier of OT_REP_COMMISSION_TIERS) {
    if (repTotalNewSaleGrossCents >= tier.thresholdCents) return tier.rateBps;
  }
  return 800;
}

/**
 * Build a Map<salesRepId, effectiveNewSaleRateBps> from a list of rows so
 * the editor / PDF can look up each rep's volume-tier rate without
 * re-summing on every render.
 *
 * Aggregation rules:
 *   - Row contributes to its rep's total when `commissionRateBps === 800`
 *     (the base NEW-sale rate). Rebill rows (100), manually overridden
 *     rates, and rows with no rep are excluded.
 *   - Sum is `patientGrossCents` per row — the same basis the rate
 *     applies against.
 *
 * The returned map is keyed by `salesRepId`; pass that to
 * `getOtTieredNewSaleRateBps(map.get(repId) ?? 0)` to get the rate.
 */
export function buildOtRepNewSaleGrossTotals(
  rows: ReadonlyArray<{
    payload: Pick<OtAllocationOverridePayload, 'salesRepId' | 'commissionRateBps' | 'patientGrossCents'>;
  }>
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const r of rows) {
    const repId = r.payload.salesRepId;
    if (repId == null) continue;
    if (r.payload.commissionRateBps !== 800) continue;
    totals.set(repId, (totals.get(repId) ?? 0) + r.payload.patientGrossCents);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Auto manager-override config
// ---------------------------------------------------------------------------

/**
 * Auto-applied manager override commission rules. Each rule grants the
 * named manager a percentage of every applicable sale's patient gross
 * (in addition to whatever direct rep commission the seller earns).
 *
 * Rules per stakeholder direction (2026-05-02):
 *   • Antonio Escobar — 1% on every sale EXCEPT:
 *       - his own (he already earns the rep commission on those)
 *       - sales by Max Putrello (different reporting line)
 *       - sales by Jay Reeves (different reporting line)
 *
 * The override is deducted from the clinic's net (standard manager
 * override pattern) AND credited to the manager in the payroll breakdown.
 *
 * Names are matched case-insensitively against `salesRepName` (which the
 * editor stores as "Last, First" — see `loadOtSalesRepCommissionLookup`
 * → `repLabelById.set(u.id, ${u.lastName}, ${u.firstName})`).
 */
export interface OtAutoManagerOverrideRule {
  managerName: string;
  rateBps: number;
  excludedRepNames: ReadonlyArray<string>;
}

export const OT_AUTO_MANAGER_OVERRIDES: ReadonlyArray<OtAutoManagerOverrideRule> = [
  {
    managerName: 'Escobar, Antonio',
    rateBps: 100,
    excludedRepNames: ['Putrello, Max', 'Reeves, Jay'],
  },
];

/** Case- and whitespace-insensitive name normalizer. */
function normalizeRepName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve the auto-applied manager override for a sale given the sale's
 * rep name. Returns `null` when no rule applies. Excludes the manager's
 * own sales and any rep in the rule's excluded list.
 */
export function getOtAutoManagerOverrideForSale(
  saleRepName: string | null | undefined,
  patientGrossCents: number
): { managerName: string; rateBps: number; amountCents: number } | null {
  const repNorm = normalizeRepName(saleRepName);
  if (!repNorm) return null;
  for (const rule of OT_AUTO_MANAGER_OVERRIDES) {
    const managerNorm = normalizeRepName(rule.managerName);
    /** Manager doesn't override their own sales. */
    if (repNorm === managerNorm) continue;
    /** Rule-specific excluded reps (different reporting lines). */
    const excludedNorm = rule.excludedRepNames.map(normalizeRepName);
    if (excludedNorm.includes(repNorm)) continue;
    return {
      managerName: rule.managerName,
      rateBps: rule.rateBps,
      amountCents: Math.round((patientGrossCents * rule.rateBps) / 10_000),
    };
  }
  return null;
}

/**
 * Merchant / Stripe processing fee rate in basis points (400 = 4%). Mirrors
 * `OT_MERCHANT_PROCESSING_BPS` in `ot-pricing.ts`. Re-exported here so the
 * editor's Live Totals doesn't have to import from the broader server-side
 * pricing module.
 */
export const OT_MERCHANT_PROCESSING_FEE_BPS = 400;

/**
 * Computes the sales-rep commission for a sale.
 *
 * Precedence (highest → lowest):
 *   1. No rep assigned (`salesRepId == null`) → 0
 *   2. `salesRepCommissionCentsOverride` (admin manually typed a $ amount) → use as-is
 *   3. Payload-level `commissionRateBps` (auto rule: 8% new / 1% rebill) →
 *      `patientGrossCents × bps / 10_000`
 *      Basis is **patient gross** per stakeholder direction (2026-05-02);
 *      the prior "gross minus COGS" basis was simplified to plain gross
 *      because it's easier for reps to understand at a glance.
 *   4. Legacy per-line `meds[].commissionRateBps` → sum of
 *      `lineTotalCents × bps / 10_000` per row
 *   5. 0
 */
export function computeOtSalesRepCommissionCents(
  payload: OtAllocationOverridePayload,
  /**
   * Optional effective-rate override applied AFTER the base
   * `commissionRateBps` check. Used by the volume-tier system: when the
   * rep's period NEW-sale gross crosses a threshold, the editor passes
   * the bumped rate (e.g. 1000 = 10%) here so the row's commission
   * reflects the volume bonus without mutating saved payloads.
   *
   * Manual `salesRepCommissionCentsOverride` still wins over this.
   */
  effectiveRateBps?: number
): number {
  if (payload.salesRepId == null) return 0;
  if (payload.salesRepCommissionCentsOverride != null) {
    return payload.salesRepCommissionCentsOverride;
  }
  const baseRateBps = payload.commissionRateBps ?? null;
  const rateBps =
    effectiveRateBps !== undefined && effectiveRateBps > 0 ? effectiveRateBps : baseRateBps;
  if (rateBps !== null && rateBps !== undefined && rateBps > 0) {
    return Math.round((payload.patientGrossCents * rateBps) / 10_000);
  }
  let total = 0;
  for (const m of payload.meds) {
    if (m.commissionRateBps != null && m.commissionRateBps > 0) {
      total += Math.round((m.lineTotalCents * m.commissionRateBps) / 10_000);
    }
  }
  return total;
}

export function computeOtAllocationOverrideTotals(
  payload: OtAllocationOverridePayload,
  /**
   * Optional effective NEW-sale rate (basis points) applied when the
   * rep's period sales cross a volume tier. Rebill rows (1%) ignore
   * this. See `getOtTieredNewSaleRateBps`.
   */
  effectiveRateBps?: number
): OtAllocationOverrideTotals {
  const medicationsCents = payload.meds.reduce((s, m) => s + m.lineTotalCents, 0);
  const customLineItemsCents = payload.customLineItems.reduce((s, c) => s + c.amountCents, 0);
  const salesRepCommissionCents = computeOtSalesRepCommissionCents(payload, effectiveRateBps);
  const eonproFeeCents = Math.round((payload.patientGrossCents * OT_EONPRO_FEE_BPS) / 10_000);
  const merchantProcessingFeeCents = Math.round(
    (payload.patientGrossCents * OT_MERCHANT_PROCESSING_FEE_BPS) / 10_000
  );
  /**
   * Auto-applied manager override: when the row's rep matches a configured
   * rule (and isn't an excluded rep / the manager themselves), credit the
   * manager 1% (or whatever rate the rule specifies). Deducted from the
   * clinic's net the same way the rep commission is.
   */
  const autoOverride = getOtAutoManagerOverrideForSale(
    payload.salesRepName,
    payload.patientGrossCents
  );
  const managerOverrideCents = autoOverride?.amountCents ?? 0;
  const managerOverrideManagerName = autoOverride?.managerName ?? null;
  const totalDeductionsCents =
    medicationsCents +
    payload.shippingCents +
    payload.trtTelehealthCents +
    payload.doctorRxFeeCents +
    payload.fulfillmentFeesCents +
    customLineItemsCents +
    salesRepCommissionCents +
    eonproFeeCents +
    merchantProcessingFeeCents +
    managerOverrideCents;
  return {
    medicationsCents,
    shippingCents: payload.shippingCents,
    trtTelehealthCents: payload.trtTelehealthCents,
    doctorRxFeeCents: payload.doctorRxFeeCents,
    fulfillmentFeesCents: payload.fulfillmentFeesCents,
    customLineItemsCents,
    salesRepCommissionCents,
    eonproFeeCents,
    merchantProcessingFeeCents,
    managerOverrideCents,
    managerOverrideManagerName,
    totalDeductionsCents,
    netToOtClinicCents: payload.patientGrossCents - totalDeductionsCents,
  };
}

/**
 * Recomputes lineTotalCents on each med row to keep the snapshot internally
 * consistent (defense against a frontend bug that forgot to update line total
 * after a quantity / unit change). Pure — does not mutate input.
 */
export function reconcileOtAllocationMedLineTotals(
  meds: OtAllocationOverrideMedLine[]
): OtAllocationOverrideMedLine[] {
  return meds.map((m) => ({
    ...m,
    lineTotalCents: m.unitPriceCents * m.quantity,
  }));
}
