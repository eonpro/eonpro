/**
 * WellMedR — Apply Shipping Address to Patient
 * =============================================
 * Pure helper used by `/api/webhooks/wellmedr-invoice` to apply the shipping
 * address from an Airtable Orders payload onto the patient record.
 *
 * CRITICAL: This MUST run on every code path — including duplicate-invoice
 * detection — because the Stripe Connect webhook (which fires before the
 * Airtable automation on initial checkout) creates the invoice with no
 * shipping address. If we early-return on duplicate without applying the
 * address, the patient is permanently left with empty address fields and
 * the Rx queue blocks prescribing with "Address Required" indefinitely.
 *
 * Behavior:
 *   - Prefers parsing the combined `shipping_address` string (handles
 *     apartments correctly; survives Airtable's naive comma-split).
 *   - Falls back to individual `city` / `state` / `zip` fields.
 *   - Never overwrites a real value with an empty/placeholder one.
 *   - Logs structured warnings on failure but never throws.
 *
 * Background: 2026-04-30 regression — Robin Bemson and other "NEW" tagged
 * patients showed in the Rx queue with empty addresses despite Airtable
 * having `shipping_address` populated. Root cause: the Stripe Connect
 * `payment_intent.succeeded` event fired ~seconds before the Airtable
 * automation, creating the invoice first; the Airtable webhook then
 * detected the duplicate and returned early before STEP 8.
 */
import { parseAddressString, normalizeState, normalizeZip } from '@/lib/address';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';

/**
 * The minimum payload shape we read. Accepts the broader
 * `WellmedrInvoicePayload` from the route — duck-typed so callers don't have
 * to import that interface.
 */
export interface ShippingAddressPayloadShape {
  address?: unknown;
  address_line1?: unknown;
  address_line_1?: unknown;
  addressLine1?: unknown;
  street_address?: unknown;
  streetAddress?: unknown;
  shipping_address?: unknown;
  shippingAddress?: unknown;
  billing_address?: unknown;
  address_line2?: unknown;
  address_line_2?: unknown;
  addressLine2?: unknown;
  apartment?: unknown;
  apt?: unknown;
  suite?: unknown;
  unit?: unknown;
  city?: unknown;
  shipping_city?: unknown;
  shippingCity?: unknown;
  state?: unknown;
  shipping_state?: unknown;
  shippingState?: unknown;
  province?: unknown;
  zip?: unknown;
  zip_code?: unknown;
  zipCode?: unknown;
  postal_code?: unknown;
  postalCode?: unknown;
  shipping_zip?: unknown;
  shippingZip?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  phoneNumber?: unknown;
}

export interface ParsedShippingAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

interface PatientAddressRow {
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

const PLACEHOLDER_VALUES = new Set(['pending', 'na', 'unknown', '', '0', '00000']);

export function isPlaceholderAddressValue(v: string | null | undefined): boolean {
  if (!v) return true;
  return PLACEHOLDER_VALUES.has(v.toLowerCase().trim());
}

function pickFirstNonEmpty(values: readonly unknown[]): string {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface RawAddressFields {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  combined: string;
  phone: string;
}

function extractRawFields(payload: ShippingAddressPayloadShape): RawAddressFields {
  const address1 = pickFirstNonEmpty([
    payload.address,
    payload.address_line1,
    payload.address_line_1,
    payload.addressLine1,
    payload.street_address,
    payload.streetAddress,
    payload.shipping_address,
    payload.shippingAddress,
  ]);
  const address2 = pickFirstNonEmpty([
    payload.address_line2,
    payload.address_line_2,
    payload.addressLine2,
    payload.apartment,
    payload.apt,
    payload.suite,
    payload.unit,
  ]);
  const city = pickFirstNonEmpty([payload.city, payload.shipping_city, payload.shippingCity]);
  const state = pickFirstNonEmpty([
    payload.state,
    payload.shipping_state,
    payload.shippingState,
    payload.province,
  ]);
  const zip = pickFirstNonEmpty([
    payload.zip,
    payload.zip_code,
    payload.zipCode,
    payload.postal_code,
    payload.postalCode,
    payload.shipping_zip,
    payload.shippingZip,
  ]);
  const combined = pickFirstNonEmpty([
    payload.shipping_address,
    payload.billing_address,
    payload.shippingAddress,
  ]);
  const phoneRaw = pickFirstNonEmpty([
    payload.phone,
    payload.phone_number,
    payload.phoneNumber,
  ]);
  const phoneDigits = phoneRaw ? phoneRaw.replace(/\D/g, '').slice(-10) : '';
  const phone = phoneDigits.length === 10 ? phoneDigits : '';

  return { address1, address2, city, state, zip, combined, phone };
}

function applyParsedOverlay(
  base: RawAddressFields,
  parsed: ReturnType<typeof parseAddressString>
): RawAddressFields {
  if (!parsed.address1 && !parsed.city && !parsed.state && !parsed.zip) return base;
  return {
    ...base,
    address1: parsed.address1 || base.address1,
    address2: parsed.address2 || base.address2,
    city: parsed.city || base.city,
    state: parsed.state || base.state,
    zip: parsed.zip || base.zip,
  };
}

/**
 * Pure parsing — no DB calls. Extracted for unit testing.
 *
 * Combined-string parsing is preferred because Airtable's naive comma-split
 * corrupts addresses with apartments
 * (e.g. "123 Main St, Apt 4B, City, State, Zip" → city="Apt 4B", state="City").
 */
export function parseShippingAddressFromPayload(
  payload: ShippingAddressPayloadShape
): ParsedShippingAddress {
  let raw = extractRawFields(payload);

  if (raw.combined.includes(',')) {
    raw = applyParsedOverlay(raw, parseAddressString(raw.combined));
  } else if (raw.address1.includes(',')) {
    raw = applyParsedOverlay(raw, parseAddressString(raw.address1));
  }

  return {
    address1: isPlaceholderAddressValue(raw.address1) ? '' : raw.address1,
    address2: isPlaceholderAddressValue(raw.address2) ? '' : raw.address2,
    city: isPlaceholderAddressValue(raw.city) ? '' : raw.city,
    state: isPlaceholderAddressValue(raw.state) ? '' : normalizeState(raw.state),
    zip: isPlaceholderAddressValue(raw.zip) ? '' : normalizeZip(raw.zip),
    phone: raw.phone,
  };
}

function buildCandidate(parsed: ParsedShippingAddress): Partial<PatientAddressRow> {
  const candidate: Partial<PatientAddressRow> = {};
  if (parsed.address1) candidate.address1 = parsed.address1;
  if (parsed.address2) candidate.address2 = parsed.address2;
  if (parsed.city) candidate.city = parsed.city;
  if (parsed.state) candidate.state = parsed.state;
  if (parsed.zip) candidate.zip = parsed.zip;
  if (parsed.phone) candidate.phone = parsed.phone;
  return candidate;
}

function decryptIfNeeded(value: string): string {
  try {
    return decryptPHI(value) ?? value;
  } catch {
    return value;
  }
}

function getCurrentValue(field: keyof PatientAddressRow, current: PatientAddressRow): string {
  const raw = (current[field] ?? '').trim();
  if (!raw) return '';
  if (field === 'phone') return decryptIfNeeded(raw);
  return raw;
}

function pickFieldsToFill(
  candidate: Partial<PatientAddressRow>,
  current: PatientAddressRow
): Record<string, string> {
  const filtered: Record<string, string> = {};
  const fields: Array<keyof PatientAddressRow> = [
    'address1',
    'address2',
    'city',
    'state',
    'zip',
    'phone',
  ];
  for (const key of fields) {
    const newValue = candidate[key];
    if (!newValue) continue;
    const currentValue = getCurrentValue(key, current);
    if (!currentValue || isPlaceholderAddressValue(currentValue)) {
      filtered[key] = newValue;
    }
  }
  return filtered;
}

/**
 * Read the patient row, then write only the fields where:
 *   (a) the parsed payload has a real value, AND
 *   (b) the current patient field is empty or a known placeholder.
 *
 * This guarantees we never overwrite a real address with stub data and never
 * leave a stub address in place when we have a real one.
 */
export async function applyShippingAddressToPatient(
  payload: ShippingAddressPayloadShape,
  patientId: number,
  requestId: string
): Promise<{ updated: boolean; fields: string[] }> {
  try {
    const parsed = parseShippingAddressFromPayload(payload);
    const candidate = buildCandidate(parsed);

    if (Object.keys(candidate).length === 0) {
      return { updated: false, fields: [] };
    }

    const current = (await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        address1: true,
        address2: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
      },
    })) as PatientAddressRow | null;

    if (!current) {
      logger.warn(
        `[WELLMEDR-INVOICE ${requestId}] applyShippingAddressToPatient: patient ${patientId} not found`
      );
      return { updated: false, fields: [] };
    }

    const filtered = pickFieldsToFill(candidate, current);
    const fields = Object.keys(filtered);

    if (fields.length === 0) {
      return { updated: false, fields: [] };
    }

    await prisma.patient.update({
      where: { id: patientId },
      data: filtered,
    });

    logger.info(
      `[WELLMEDR-INVOICE ${requestId}] ✓ Patient address backfilled (${fields.join(', ')})`,
      { patientId, fields }
    );

    return { updated: true, fields };
  } catch (err) {
    logger.warn(
      `[WELLMEDR-INVOICE ${requestId}] applyShippingAddressToPatient failed (non-fatal)`,
      {
        patientId,
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return { updated: false, fields: [] };
  }
}

function safeDecryptEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) ?? value;
  } catch {
    return value;
  }
}

/**
 * Best-effort patient lookup by customer email — used on duplicate-detection
 * paths so we can still apply the shipping address from this Airtable webhook
 * even when invoice creation is skipped. Returns null if no match.
 */
export async function findPatientByEmailForAddressUpdate(
  email: string,
  clinicId: number,
  requestId: string
): Promise<number | null> {
  const lower = email.toLowerCase().trim();
  if (!lower) return null;

  try {
    const direct = await prisma.patient.findFirst({
      where: {
        clinicId,
        profileStatus: 'ACTIVE',
        searchIndex: { contains: lower, mode: 'insensitive' },
      },
      select: { id: true, email: true },
      orderBy: { createdAt: 'desc' },
    });
    if (direct) {
      const decEmail = safeDecryptEmail(direct.email)?.toLowerCase().trim();
      if (decEmail === lower) return direct.id;
    }

    const candidates = await prisma.patient.findMany({
      where: { clinicId, profileStatus: 'ACTIVE' },
      select: { id: true, email: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const c of candidates) {
      const decEmail = safeDecryptEmail(c.email)?.toLowerCase().trim();
      if (decEmail === lower) return c.id;
    }
    return null;
  } catch (err) {
    logger.warn(
      `[WELLMEDR-INVOICE ${requestId}] findPatientByEmailForAddressUpdate failed (non-fatal)`,
      { error: err instanceof Error ? err.message : String(err) }
    );
    return null;
  }
}
