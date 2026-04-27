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
  /** Sum of everything billable to the OT clinic. */
  totalDeductionsCents: number;
  /** patientGrossCents - totalDeductionsCents (may be negative if admin over-allocates). */
  netToOtClinicCents: number;
}

export function computeOtAllocationOverrideTotals(
  payload: OtAllocationOverridePayload
): OtAllocationOverrideTotals {
  const medicationsCents = payload.meds.reduce((s, m) => s + m.lineTotalCents, 0);
  const customLineItemsCents = payload.customLineItems.reduce((s, c) => s + c.amountCents, 0);
  const totalDeductionsCents =
    medicationsCents +
    payload.shippingCents +
    payload.trtTelehealthCents +
    payload.doctorRxFeeCents +
    payload.fulfillmentFeesCents +
    customLineItemsCents;
  return {
    medicationsCents,
    shippingCents: payload.shippingCents,
    trtTelehealthCents: payload.trtTelehealthCents,
    doctorRxFeeCents: payload.doctorRxFeeCents,
    fulfillmentFeesCents: payload.fulfillmentFeesCents,
    customLineItemsCents,
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
