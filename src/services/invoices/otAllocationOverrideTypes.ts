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
   * is computed as `Σ(med.lineTotalCents × med.commissionRateBps / 10000)` over
   * the meds list. When set, this replaces the per-line sum.
   */
  salesRepCommissionCentsOverride: cents.nullable().default(null),
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
  /** Sum of everything billable to the OT clinic. */
  totalDeductionsCents: number;
  /** patientGrossCents - totalDeductionsCents (may be negative if admin over-allocates). */
  netToOtClinicCents: number;
}

/**
 * Computes the sales-rep commission for a sale.
 * Priority:
 *   1. `salesRepCommissionCentsOverride` if set (admin manually typed a $ amount)
 *   2. Sum of per-medication-line `commissionRateBps × lineTotalCents`
 *   3. 0 if no rep is assigned, regardless of rates
 */
export function computeOtSalesRepCommissionCents(payload: OtAllocationOverridePayload): number {
  if (payload.salesRepId == null) return 0;
  if (payload.salesRepCommissionCentsOverride != null) {
    return payload.salesRepCommissionCentsOverride;
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
  payload: OtAllocationOverridePayload
): OtAllocationOverrideTotals {
  const medicationsCents = payload.meds.reduce((s, m) => s + m.lineTotalCents, 0);
  const customLineItemsCents = payload.customLineItems.reduce((s, c) => s + c.amountCents, 0);
  const salesRepCommissionCents = computeOtSalesRepCommissionCents(payload);
  const totalDeductionsCents =
    medicationsCents +
    payload.shippingCents +
    payload.trtTelehealthCents +
    payload.doctorRxFeeCents +
    payload.fulfillmentFeesCents +
    customLineItemsCents +
    salesRepCommissionCents;
  return {
    medicationsCents,
    shippingCents: payload.shippingCents,
    trtTelehealthCents: payload.trtTelehealthCents,
    doctorRxFeeCents: payload.doctorRxFeeCents,
    fulfillmentFeesCents: payload.fulfillmentFeesCents,
    customLineItemsCents,
    salesRepCommissionCents,
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
