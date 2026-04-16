/**
 * Testosterone Cypionate Shipping Address Safeguard
 * ==================================================
 *
 * OT clinic (ot.eonpro.io) ONLY.
 *
 * When a prescription contains Testosterone Cypionate and the patient's state
 * is NOT in the list of approved direct-ship states, the shipping address
 * (and the patient address on the Rx/PDF) is automatically replaced with the
 * Lifefile Tampa facility address so the pharmacy ships there instead.
 *
 * This does NOT change the patient record in the database — only the outbound
 * Lifefile payload and the generated PDF.
 */

import { logger } from '@/lib/logger';

// ── Approved States for Direct-Ship ──────────────────────────────────────────
// Patients in these states receive testosterone cypionate at their home address.
// All others are redirected to the Tampa facility.
const APPROVED_DIRECT_SHIP_STATES = new Set([
  'AZ', // Arizona
  'CO', // Colorado
  'CT', // Connecticut
  'DE', // Delaware
  'FL', // Florida
  'GA', // Georgia
  'HI', // Hawaii
  'ID', // Idaho
  'ME', // Maine
  'MN', // Minnesota
  'MO', // Missouri
  'MT', // Montana
  'ND', // North Dakota
  'NH', // New Hampshire
  'NJ', // New Jersey
  'NM', // New Mexico
  'NY', // New York
  'OH', // Ohio
  'PA', // Pennsylvania
  'RI', // Rhode Island
  'SD', // South Dakota
  'UT', // Utah
  'DC', // Washington D.C.
  'WI', // Wisconsin
  'WY', // Wyoming
]);

// ── Redirect Address ─────────────────────────────────────────────────────────
const REDIRECT_ADDRESS = {
  addressLine1: '1801 N Morgan St',
  addressLine2: 'Unit 12',
  city: 'Tampa',
  state: 'FL',
  zip: '33602',
} as const;

// ── OT Clinic Identifier ────────────────────────────────────────────────────
const OT_SUBDOMAIN = 'ot';

/**
 * Resolve the clinic subdomain from a clinicId.
 * Uses DB lookup; returns null if clinic not found or subdomain unset.
 */
async function resolveClinicSubdomain(clinicId: number): Promise<string | null> {
  try {
    const { basePrisma } = await import('@/lib/db');
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
      select: { subdomain: true },
    });
    return clinic?.subdomain?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function isTestosteroneCypionate(medicationName: string): boolean {
  const upper = medicationName.toUpperCase();
  return upper.includes('TESTOSTERONE') && upper.includes('CYPIONATE');
}

function normalizeState(state: string | undefined | null): string {
  return (state ?? '').trim().toUpperCase();
}

// ── Public Types ─────────────────────────────────────────────────────────────

export interface AddressFields {
  address1?: string;
  addressLine1?: string;
  address2?: string | null;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  zipCode?: string;
}

export interface SafeguardResult {
  applied: boolean;
  originalState?: string;
  redirectAddress?: typeof REDIRECT_ADDRESS;
}

// ── Core Check ───────────────────────────────────────────────────────────────

/**
 * Determine whether the testosterone address safeguard should activate.
 *
 * Conditions (ALL must be true):
 *  1. Clinic is OT (subdomain === 'ot')
 *  2. At least one Rx medication name contains "testosterone cypionate"
 *  3. Patient state is NOT in the approved direct-ship list
 */
export async function shouldApplyTestosteroneSafeguard(params: {
  clinicId: number;
  patientState: string;
  medicationNames: string[];
}): Promise<boolean> {
  const { clinicId, patientState, medicationNames } = params;

  const hasTestCyp = medicationNames.some(isTestosteroneCypionate);
  if (!hasTestCyp) return false;

  const subdomain = await resolveClinicSubdomain(clinicId);
  if (subdomain !== OT_SUBDOMAIN) return false;

  const state = normalizeState(patientState);
  if (!state) return false;

  return !APPROVED_DIRECT_SHIP_STATES.has(state);
}

// ── Address Rewrite Helpers ──────────────────────────────────────────────────

/**
 * Apply the redirect to a Lifefile `order.patient` block (address1/address2/city/state/zip).
 */
export function applyRedirectToPatientAddress<T extends Record<string, any>>(patient: T): T {
  return {
    ...patient,
    address1: REDIRECT_ADDRESS.addressLine1,
    address2: REDIRECT_ADDRESS.addressLine2,
    city: REDIRECT_ADDRESS.city,
    state: REDIRECT_ADDRESS.state,
    zip: REDIRECT_ADDRESS.zip,
  };
}

/**
 * Apply the redirect to a Lifefile `order.shipping` block (addressLine1/addressLine2/city/state/zipCode).
 */
export function applyRedirectToShipping<T extends Record<string, any>>(shipping: T): T {
  return {
    ...shipping,
    addressLine1: REDIRECT_ADDRESS.addressLine1,
    addressLine2: REDIRECT_ADDRESS.addressLine2,
    city: REDIRECT_ADDRESS.city,
    state: REDIRECT_ADDRESS.state,
    zipCode: REDIRECT_ADDRESS.zip,
  };
}

/**
 * Apply the redirect to the PDF patient data (address1/address2/city/state/zip).
 */
export function applyRedirectToPdfPatient<T extends Record<string, any>>(patient: T): T {
  return {
    ...patient,
    address1: REDIRECT_ADDRESS.addressLine1,
    address2: REDIRECT_ADDRESS.addressLine2,
    city: REDIRECT_ADDRESS.city,
    state: REDIRECT_ADDRESS.state,
    zip: REDIRECT_ADDRESS.zip,
  };
}

/**
 * Apply the redirect to the PDF shipping data (addressLine1/addressLine2/city/state/zip).
 */
export function applyRedirectToPdfShipping<T extends Record<string, any>>(shipping: T): T {
  return {
    ...shipping,
    addressLine1: REDIRECT_ADDRESS.addressLine1,
    addressLine2: REDIRECT_ADDRESS.addressLine2,
    city: REDIRECT_ADDRESS.city,
    state: REDIRECT_ADDRESS.state,
    zip: REDIRECT_ADDRESS.zip,
  };
}

// ── High-Level Orchestrator ──────────────────────────────────────────────────

/**
 * One-call entry point: checks conditions, rewrites addresses if needed,
 * and logs the safeguard activation. Returns whether it was applied.
 *
 * Mutates the `orderPayload` and `pdfData` objects in place for convenience.
 */
export async function applyTestosteroneAddressSafeguard(params: {
  clinicId: number;
  patientState: string;
  medicationNames: string[];
  orderPayload: any;
  pdfData: any;
}): Promise<SafeguardResult> {
  const { clinicId, patientState, medicationNames, orderPayload, pdfData } = params;

  const shouldApply = await shouldApplyTestosteroneSafeguard({
    clinicId,
    patientState,
    medicationNames,
  });

  if (!shouldApply) {
    return { applied: false };
  }

  logger.info('[TESTOSTERONE-SAFEGUARD] Activating address redirect', {
    clinicId,
    originalState: normalizeState(patientState),
    redirectTo: `${REDIRECT_ADDRESS.addressLine1}, ${REDIRECT_ADDRESS.city}, ${REDIRECT_ADDRESS.state} ${REDIRECT_ADDRESS.zip}`,
  });

  // Rewrite Lifefile payload
  if (orderPayload?.order?.patient) {
    orderPayload.order.patient = applyRedirectToPatientAddress(orderPayload.order.patient);
  }
  if (orderPayload?.order?.shipping) {
    orderPayload.order.shipping = applyRedirectToShipping(orderPayload.order.shipping);
  }

  // Rewrite PDF data
  if (pdfData?.patient) {
    pdfData.patient = applyRedirectToPdfPatient(pdfData.patient);
  }
  if (pdfData?.shipping) {
    pdfData.shipping = applyRedirectToPdfShipping(pdfData.shipping);
  }

  return {
    applied: true,
    originalState: normalizeState(patientState),
    redirectAddress: REDIRECT_ADDRESS,
  };
}

/**
 * Lightweight variant for the approve-and-send path where only the Lifefile
 * payload is available (PDF was already generated at queue time).
 *
 * Re-generates the PDF is NOT feasible from that path, but the stored
 * `requestJson` payload is what gets sent to the pharmacy, so rewriting
 * the payload addresses is sufficient.  The PDF was already generated with
 * the redirect at queue time if the safeguard was active then.
 */
export async function applyTestosteroneSafeguardToPayload(params: {
  clinicId: number;
  payload: any;
}): Promise<SafeguardResult> {
  const { clinicId, payload } = params;

  const patientState = payload?.order?.patient?.state ?? '';
  const rxs: any[] = payload?.order?.rxs ?? [];
  const medicationNames = rxs.map((rx: any) => rx.drugName ?? '');

  const shouldApply = await shouldApplyTestosteroneSafeguard({
    clinicId,
    patientState,
    medicationNames,
  });

  if (!shouldApply) {
    return { applied: false };
  }

  logger.info('[TESTOSTERONE-SAFEGUARD] Activating address redirect (approve-and-send)', {
    clinicId,
    originalState: normalizeState(patientState),
    redirectTo: `${REDIRECT_ADDRESS.addressLine1}, ${REDIRECT_ADDRESS.city}, ${REDIRECT_ADDRESS.state} ${REDIRECT_ADDRESS.zip}`,
  });

  if (payload?.order?.patient) {
    payload.order.patient = applyRedirectToPatientAddress(payload.order.patient);
  }
  if (payload?.order?.shipping) {
    payload.order.shipping = applyRedirectToShipping(payload.order.shipping);
  }

  return {
    applied: true,
    originalState: normalizeState(patientState),
    redirectAddress: REDIRECT_ADDRESS,
  };
}
