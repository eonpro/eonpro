/**
 * WELLMEDR INVOICE WEBHOOK
 * ========================
 * Creates invoices for WellMedR patients when payment is detected in Airtable
 *
 * Trigger: Airtable automation when `method_payment_id` field is populated
 *
 * POST /api/webhooks/wellmedr-invoice
 *
 * Expected payload:
 * {
 *   "customer_email": "patient@example.com",
 *   "customer_name": "John Doe",
 *   "product": "Tirzepatide 5mg",
 *   "amount": 29900, // Amount in cents
 *   "method_payment_id": "pm_1StwAHDfH4PWyxxdppqIGipS",
 *   "submission_id": "d2620779-9a90-4385-a...",
 *   "order_status": "processing",
 *   "subscription_status": "active"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureSoapNoteExists } from '@/lib/soap-note-automation';

// WellMedR clinic configuration
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

// State name to code mapping for normalization
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'virgin islands': 'VI', 'guam': 'GU',
  // Also add 2-letter codes as keys
  'al': 'AL', 'ak': 'AK', 'az': 'AZ', 'ar': 'AR', 'ca': 'CA', 'co': 'CO',
  'ct': 'CT', 'de': 'DE', 'fl': 'FL', 'ga': 'GA', 'hi': 'HI', 'id': 'ID',
  'il': 'IL', 'in': 'IN', 'ia': 'IA', 'ks': 'KS', 'ky': 'KY', 'la': 'LA',
  'me': 'ME', 'md': 'MD', 'ma': 'MA', 'mi': 'MI', 'mn': 'MN', 'ms': 'MS',
  'mo': 'MO', 'mt': 'MT', 'ne': 'NE', 'nv': 'NV', 'nh': 'NH', 'nj': 'NJ',
  'nm': 'NM', 'ny': 'NY', 'nc': 'NC', 'nd': 'ND', 'oh': 'OH', 'ok': 'OK',
  'or': 'OR', 'pa': 'PA', 'ri': 'RI', 'sc': 'SC', 'sd': 'SD', 'tn': 'TN',
  'tx': 'TX', 'ut': 'UT', 'vt': 'VT', 'va': 'VA', 'wa': 'WA', 'wv': 'WV',
  'wi': 'WI', 'wy': 'WY', 'dc': 'DC', 'pr': 'PR', 'vi': 'VI', 'gu': 'GU',
};

// Valid state codes set for quick lookup
const VALID_STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

// Apartment/Unit pattern detection
const APT_PATTERNS = [
  /^APT\.?\s*/i,
  /^APARTMENT\s*/i,
  /^UNIT\s*/i,
  /^STE\.?\s*/i,
  /^SUITE\s*/i,
  /^#\s*/,
  /^BLDG\.?\s*/i,
  /^BUILDING\s*/i,
  /^FLOOR\s*/i,
  /^FL\.?\s*/i,
  /^RM\.?\s*/i,
  /^ROOM\s*/i,
];

/**
 * Check if a string looks like an apartment/unit number
 */
function isApartmentString(str: string): boolean {
  const trimmed = str.trim();
  // Check prefixed patterns (APT, UNIT, etc.)
  if (APT_PATTERNS.some(pattern => pattern.test(trimmed))) return true;
  // Also treat bare numbers (1-5 digits, optionally with a letter) as apartment numbers
  // e.g., "130", "4B", "12A", "1234"
  if (/^\d{1,5}[A-Za-z]?$/.test(trimmed)) return true;
  return false;
}

/**
 * Check if a string is a valid US state name or code
 */
function isStateName(str: string): boolean {
  const normalized = str.trim().toLowerCase();
  return STATE_NAME_TO_CODE[normalized] !== undefined;
}

/**
 * Check if a string is a valid US ZIP code (5 digits or 5+4 format)
 */
function isZipCode(str: string): boolean {
  const trimmed = str.trim();
  return /^\d{5}(-\d{4})?$/.test(trimmed);
}

/**
 * Extract state from a "City State" or "City STATE" string
 * e.g., "HO Texas" -> { city: "HO", state: "TX" }
 * e.g., "Houston TX" -> { city: "Houston", state: "TX" }
 */
function extractCityState(str: string): { city: string; state: string } | null {
  const trimmed = str.trim();
  // Try to match "CITY STATE_NAME" pattern (state name at end)
  for (const [stateName, stateCode] of Object.entries(STATE_NAME_TO_CODE)) {
    // Only check full state names and 2-letter codes
    if (stateName.length < 2) continue;
    const regex = new RegExp(`^(.+?)\\s+(${stateName})$`, 'i');
    const match = trimmed.match(regex);
    if (match) {
      return { city: match[1].trim(), state: stateCode };
    }
  }
  return null;
}

interface ParsedAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Parse a combined address string into components.
 * Handles formats like:
 * - "201 ELBRIDGE AVE, APT F, Cloverdale, California, 95425"
 * - "2900 W Dallas St, 130, HO Texas" (bare apt number, city+state combined)
 * - "123 Main St, Apt 4B, New York, NY, 10001"
 */
function parseAddressString(addressString: string): ParsedAddress {
  const result: ParsedAddress = {
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
  };

  if (!addressString || typeof addressString !== 'string') {
    return result;
  }

  // Split by comma
  const parts = addressString.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return result;
  }

  // Single part - just return as address1
  if (parts.length === 1) {
    result.address1 = parts[0];
    return result;
  }

  // Work backwards to identify zip, state, city
  const remainingParts = [...parts];

  // Check last part for ZIP code
  let lastPart = remainingParts[remainingParts.length - 1];
  if (isZipCode(lastPart)) {
    result.zip = lastPart;
    remainingParts.pop();
    lastPart = remainingParts[remainingParts.length - 1] || '';
  } else {
    // Check if last part contains "STATE ZIP" pattern (e.g., "CA 90001" or "California 95425")
    const stateZipMatch = lastPart.match(/^(.+?)\s+(\d{5}(-\d{4})?)$/);
    if (stateZipMatch) {
      const possibleState = stateZipMatch[1].trim();
      if (isStateName(possibleState)) {
        result.state = normalizeState(possibleState);
        result.zip = stateZipMatch[2];
        remainingParts.pop();
        lastPart = remainingParts[remainingParts.length - 1] || '';
      }
    }
  }

  // Check for standalone state or "City State" pattern
  if (!result.state && remainingParts.length > 0) {
    lastPart = remainingParts[remainingParts.length - 1];
    if (isStateName(lastPart)) {
      result.state = normalizeState(lastPart);
      remainingParts.pop();
    } else {
      // Check for "City State" pattern in last part (e.g., "HO Texas", "Houston TX")
      const cityState = extractCityState(lastPart);
      if (cityState) {
        result.city = cityState.city;
        result.state = cityState.state;
        remainingParts.pop();
      }
    }
  }

  // Now parse remaining parts for address1, address2, and city (if not found)
  if (remainingParts.length === 0) {
    // Nothing left
  } else if (remainingParts.length === 1) {
    result.address1 = remainingParts[0];
  } else if (remainingParts.length === 2) {
    result.address1 = remainingParts[0];
    const second = remainingParts[1];
    if (isApartmentString(second)) {
      result.address2 = second;
    } else if (!result.city) {
      result.city = second;
    } else {
      // City already set, this might be extra address info
      result.address2 = second;
    }
  } else {
    // 3+ parts remaining
    result.address1 = remainingParts[0];

    // Find apartment (could be at index 1 or elsewhere)
    let aptIndex = -1;
    for (let i = 1; i < remainingParts.length; i++) {
      if (isApartmentString(remainingParts[i])) {
        aptIndex = i;
        break;
      }
    }

    if (aptIndex > 0) {
      result.address2 = remainingParts[aptIndex];
      // City is what comes after apt, or before if nothing after
      const afterApt = remainingParts.slice(aptIndex + 1);
      const beforeApt = remainingParts.slice(1, aptIndex);
      if (!result.city) {
        result.city = afterApt.join(', ') || beforeApt.join(', ');
      }
    } else {
      // No apt found - last part is likely city (if not already set)
      if (!result.city) {
        result.city = remainingParts[remainingParts.length - 1];
      }
      // If more than 2 parts and no apt, middle parts are address continuation
      if (remainingParts.length > 2) {
        result.address1 = remainingParts.slice(0, -1).join(', ');
      }
    }
  }

  return result;
}

// Helper to normalize state input to 2-letter code
function normalizeState(state: string): string {
  if (!state) return '';
  const normalized = state.trim().toLowerCase();
  return STATE_NAME_TO_CODE[normalized] || state.toUpperCase().slice(0, 2);
}

// Helper to safely parse payment date from various formats
function parsePaymentDate(dateValue: string | undefined): Date {
  if (!dateValue) {
    return new Date();
  }

  // Clean up the date string - sometimes Airtable sends "created_at2026-01-26..."
  // instead of just the date
  let cleanDate = dateValue;

  // Remove any field name prefix (e.g., "created_at" prefix)
  const isoMatch = cleanDate.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
  if (isoMatch) {
    cleanDate = isoMatch[1];
  }

  // Try to parse
  const parsed = new Date(cleanDate);

  // If invalid, return current date
  if (isNaN(parsed.getTime())) {
    logger.warn('[WELLMEDR-INVOICE] Could not parse payment date, using current date', {
      original: dateValue,
      cleaned: cleanDate
    });
    return new Date();
  }

  return parsed;
}

// Auth configuration - reuses the wellmedr intake webhook secret
const WEBHOOK_SECRET = process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET || process.env.WELLMEDR_INVOICE_WEBHOOK_SECRET;

interface WellmedrInvoicePayload {
  customer_email: string;
  customer_name?: string;
  cardholder_name?: string;
  product?: string;
  amount?: number;
  amount_paid?: number;
  price?: string | number;
  method_payment_id: string;
  submission_id?: string;
  order_status?: string;
  subscription_status?: string;
  // Treatment details
  plan?: string;
  medication_type?: string;
  stripe_price_id?: string;
  // Address fields - support ALL possible Airtable field name variations
  address?: string;
  address_line1?: string;
  address_line_1?: string;
  addressLine1?: string;
  street_address?: string;
  streetAddress?: string;
  shipping_address?: string;
  shippingAddress?: string;
  address_line2?: string;
  address_line_2?: string;
  addressLine2?: string;
  apartment?: string;
  apt?: string;
  suite?: string;
  unit?: string;
  city?: string;
  shipping_city?: string;
  shippingCity?: string;
  state?: string;
  shipping_state?: string;
  shippingState?: string;
  province?: string;
  zip?: string;
  zip_code?: string;
  zipCode?: string;
  postal_code?: string;
  postalCode?: string;
  shipping_zip?: string;
  shippingZip?: string;
  country?: string;
  shipping_country?: string;
  // Phone (for address completeness)
  phone?: string;
  phone_number?: string;
  phoneNumber?: string;
  // Payment date
  payment_date?: string;
  // Additional fields that might be sent
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const requestId = `wellmedr-inv-${Date.now()}`;
  const startTime = Date.now();

  logger.info(`[WELLMEDR-INVOICE ${requestId}] Webhook received`);

  // STEP 1: Authenticate
  const providedSecret =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!WEBHOOK_SECRET) {
    logger.error(`[WELLMEDR-INVOICE ${requestId}] CRITICAL: No webhook secret configured!`);
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  if (providedSecret !== WEBHOOK_SECRET) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Authentication FAILED`);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  logger.debug(`[WELLMEDR-INVOICE ${requestId}] ✓ Authenticated`);

  // STEP 2: Get WellMedR clinic
  let clinicId: number;
  try {
    const wellmedrClinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: WELLMEDR_CLINIC_SUBDOMAIN },
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, subdomain: true },
    });

    if (!wellmedrClinic) {
      logger.error(`[WELLMEDR-INVOICE ${requestId}] CRITICAL: Wellmedr clinic not found!`);
      return NextResponse.json(
        { error: 'Wellmedr clinic not configured' },
        { status: 500 }
      );
    }

    clinicId = wellmedrClinic.id;
    logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ CLINIC VERIFIED: ID=${clinicId}, Name="${wellmedrClinic.name}"`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Database error finding clinic:`, { error: errMsg });
    return NextResponse.json(
      { error: 'Database error', message: errMsg },
      { status: 500 }
    );
  }

  // STEP 3: Parse payload
  let payload: WellmedrInvoicePayload;
  try {
    payload = await req.json();
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Payload:`, {
      customer_email: payload.customer_email,
      product: payload.product,
      amount: payload.amount,
      method_payment_id: payload.method_payment_id?.substring(0, 10) + '...',
      submission_id: payload.submission_id,
      hasAddress: !!(payload.address || payload.address_line1 || payload.city),
    });
  } catch (err) {
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Failed to parse JSON payload`);
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // STEP 4: Validate required fields
  if (!payload.customer_email) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Missing customer_email`);
    return NextResponse.json(
      { error: 'Missing required field: customer_email' },
      { status: 400 }
    );
  }

  if (!payload.method_payment_id) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Missing method_payment_id`);
    return NextResponse.json(
      { error: 'Missing required field: method_payment_id' },
      { status: 400 }
    );
  }

  // Validate payment method format (starts with pm_)
  if (!payload.method_payment_id.startsWith('pm_')) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Invalid payment method format: ${payload.method_payment_id}`);
    return NextResponse.json(
      { error: 'Invalid payment method format - expected pm_...' },
      { status: 400 }
    );
  }

  // STEP 5: Find patient by email
  const email = payload.customer_email.toLowerCase().trim();
  let patient;
  try {
    patient = await prisma.patient.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        clinicId: clinicId,
      },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!patient) {
      logger.warn(`[WELLMEDR-INVOICE ${requestId}] Patient not found for email: ${email}`);
      return NextResponse.json({
        success: false,
        error: 'Patient not found',
        message: `No patient found with email ${email} in WellMedR clinic. Please ensure the patient is registered first.`,
        searchedEmail: email,
        clinicId,
      }, { status: 404 });
    }

    logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient found: ID=${patient.id}, Name="${patient.firstName} ${patient.lastName}"`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Error finding patient:`, { error: errMsg });
    return NextResponse.json(
      { error: 'Database error finding patient', message: errMsg },
      { status: 500 }
    );
  }

  // STEP 6: Check for duplicate invoice
  try {
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        patientId: patient.id,
        clinicId: clinicId,
        metadata: {
          path: ['stripePaymentMethodId'],
          equals: payload.method_payment_id,
        },
      },
    });

    if (existingInvoice) {
      logger.info(`[WELLMEDR-INVOICE ${requestId}] Invoice already exists for this payment: ${existingInvoice.id}`);
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'Invoice already exists for this payment',
        invoiceId: existingInvoice.id,
        patientId: patient.id,
      });
    }
  } catch (err) {
    // Non-fatal - continue with invoice creation
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Error checking for duplicate:`, { error: err });
  }

  // STEP 7: Create internal EONPRO invoice (NO Stripe for WellMedR)
  // WellMedR collects payments via their own Stripe account through Airtable
  // We only need to record the invoice internally for tracking

  // Determine amount - use provided amount or price or default
  // The `amount` and `amount_paid` fields are expected in CENTS (per API doc)
  // The `price` field is expected in DOLLARS (from Airtable) and must be converted
  let amountInCents = payload.amount || payload.amount_paid || 0;

  // Try to parse price if amount not provided
  // IMPORTANT: price field from Airtable is ALWAYS in dollars (e.g., "$1,134.00" or 1134)
  if (!amountInCents && payload.price) {
    if (typeof payload.price === 'number') {
      // Price is in dollars - always convert to cents
      // This fixes the bug where $1,134.00 (sent as 1134) was stored as 1134 cents ($11.34)
      amountInCents = Math.round(payload.price * 100);
    } else if (typeof payload.price === 'string') {
      const cleanedPrice = payload.price.replace(/[$,]/g, '').trim();
      const parsedPrice = parseFloat(cleanedPrice);
      if (!isNaN(parsedPrice)) {
        // Price is in dollars - convert to cents
        amountInCents = Math.round(parsedPrice * 100);
      }
    }
  }

  // Safety check: if amount/amount_paid was provided but looks like dollars (reasonable range for this platform)
  // Values 100-5000 are ambiguous, but values like 29900 (=$299) are clearly cents
  // We only auto-correct obvious dollar values (< 100, which would be < $1 in cents - unrealistic)
  // Note: This is a last-resort fallback - callers should send amount in cents as documented
  if (amountInCents > 0 && amountInCents < 100) {
    logger.warn(`[WELLMEDR-INVOICE] Amount ${amountInCents} looks like dollars, converting to cents`);
    amountInCents = Math.round(amountInCents * 100);
  }

  // Default amount if not provided
  if (!amountInCents || amountInCents <= 0) {
    amountInCents = 29900; // Default $299.00
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] No amount provided, using default: $${(amountInCents / 100).toFixed(2)}`);
  }

  // Build line item description with product, medication type, and plan
  const product = payload.product || 'GLP-1';
  const medicationType = payload.medication_type || '';
  const plan = payload.plan || '';

  // Build a descriptive product name like "Tirzepatide Injections (Monthly)"
  let productName = product.charAt(0).toUpperCase() + product.slice(1).toLowerCase();
  if (medicationType) {
    productName += ` ${medicationType.charAt(0).toUpperCase() + medicationType.slice(1).toLowerCase()}`;
  }
  if (plan) {
    productName += ` (${plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()})`;
  }

  const customerName = payload.customer_name || payload.cardholder_name || `${patient.firstName} ${patient.lastName}`;

  // Extract address from ALL possible field variations
  const rawExtractedAddress1 = String(
    payload.address ||
    payload.address_line1 ||
    payload.address_line_1 ||
    payload.addressLine1 ||
    payload.street_address ||
    payload.streetAddress ||
    payload.shipping_address ||
    payload.shippingAddress || ''
  ).trim();

  const rawExtractedAddress2 = String(
    payload.address_line2 ||
    payload.address_line_2 ||
    payload.addressLine2 ||
    payload.apartment ||
    payload.apt ||
    payload.suite ||
    payload.unit || ''
  ).trim();

  const rawExtractedCity = String(
    payload.city ||
    payload.shipping_city ||
    payload.shippingCity || ''
  ).trim();

  const rawExtractedState = String(
    payload.state ||
    payload.shipping_state ||
    payload.shippingState ||
    payload.province || ''
  ).trim();

  const rawExtractedZip = String(
    payload.zip ||
    payload.zip_code ||
    payload.zipCode ||
    payload.postal_code ||
    payload.postalCode ||
    payload.shipping_zip ||
    payload.shippingZip || ''
  ).trim();

  // Check if we need to parse a combined address string for metadata
  const metadataHasSeparateComponents = rawExtractedCity || rawExtractedState || rawExtractedZip || rawExtractedAddress2;
  const metadataLooksCombined = rawExtractedAddress1 && rawExtractedAddress1.includes(',') && !metadataHasSeparateComponents;

  let extractedAddress1 = rawExtractedAddress1;
  let extractedAddress2 = rawExtractedAddress2;
  let extractedCity = rawExtractedCity;
  let extractedState = rawExtractedState;
  let extractedZip = rawExtractedZip;

  if (metadataLooksCombined) {
    const parsedMeta = parseAddressString(rawExtractedAddress1);
    extractedAddress1 = parsedMeta.address1;
    extractedAddress2 = parsedMeta.address2;
    extractedCity = parsedMeta.city;
    extractedState = parsedMeta.state;
    extractedZip = parsedMeta.zip;
  }

  // Build address string from available fields
  const addressParts = [
    extractedAddress1,
    extractedAddress2,
    extractedCity,
    extractedState,
    extractedZip,
    payload.country || payload.shipping_country,
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ') || '';

  try {
    // Generate a unique invoice number for WellMedR
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const invoiceCount = await prisma.invoice.count({
      where: {
        clinicId: clinicId,
        createdAt: { gte: new Date(year, new Date().getMonth(), 1) },
      },
    });
    const invoiceNumber = `WM-${year}${month}-${String(invoiceCount + 1).padStart(4, '0')}`;

    // Create internal EONPRO invoice (NO Stripe - WellMedR doesn't have Stripe configured)
    const invoice = await prisma.invoice.create({
      data: {
        patientId: patient.id,
        clinicId: clinicId,
        // NO Stripe IDs - this is an internal invoice only
        stripeInvoiceId: null,
        stripeInvoiceNumber: null,
        stripeInvoiceUrl: null,
        stripePdfUrl: null,
        // Amounts
        amount: amountInCents,
        amountDue: 0, // Already paid
        amountPaid: amountInCents,
        currency: 'usd',
        // Status - mark as PAID since payment already collected via Airtable/Stripe
        status: 'PAID',
        paidAt: parsePaymentDate(payload.payment_date),
        // Details
        description: `${productName} - Payment received`,
        dueDate: new Date(),
        // Store line items and all metadata
        lineItems: [
          {
            description: productName,
            quantity: 1,
            unitPrice: amountInCents,
            product: product,
            medicationType: medicationType,
            plan: plan,
          },
        ],
        metadata: {
          invoiceNumber,
          source: 'wellmedr-airtable',
          stripePaymentMethodId: payload.method_payment_id,
          stripePriceId: payload.stripe_price_id || '',
          submissionId: payload.submission_id || '',
          orderStatus: payload.order_status || '',
          subscriptionStatus: payload.subscription_status || '',
          customerName: customerName,
          // Treatment details
          product: product,
          medicationType: medicationType,
          plan: plan,
          // Address info (extracted from all possible field variations)
          address: fullAddress,
          addressLine1: extractedAddress1,
          addressLine2: extractedAddress2,
          city: extractedCity,
          state: extractedState ? normalizeState(String(extractedState)) : '',
          zipCode: extractedZip,
          country: payload.country || payload.shipping_country || '',
          // Payment info
          paymentDate: parsePaymentDate(payload.payment_date).toISOString(),
          paymentMethod: 'stripe-airtable',
          processedAt: new Date().toISOString(),
          // Summary
          summary: {
            subtotal: amountInCents,
            discountAmount: 0,
            taxAmount: 0,
            total: amountInCents,
            amountPaid: amountInCents,
            amountDue: 0,
          },
        },
      },
      include: {
        patient: true,
        clinic: true,
      },
    });

    // STEP 8: Update patient address if provided in payload
    // Support ALL possible Airtable field name variations
    const rawAddress1Value =
      payload.address ||
      payload.address_line1 ||
      payload.address_line_1 ||
      payload.addressLine1 ||
      payload.street_address ||
      payload.streetAddress ||
      payload.shipping_address ||
      payload.shippingAddress;

    const rawAddress2Value =
      payload.address_line2 ||
      payload.address_line_2 ||
      payload.addressLine2 ||
      payload.apartment ||
      payload.apt ||
      payload.suite ||
      payload.unit;

    const rawCityValue =
      payload.city ||
      payload.shipping_city ||
      payload.shippingCity;

    const rawStateValue =
      payload.state ||
      payload.shipping_state ||
      payload.shippingState ||
      payload.province;

    const rawZipValue =
      payload.zip ||
      payload.zip_code ||
      payload.zipCode ||
      payload.postal_code ||
      payload.postalCode ||
      payload.shipping_zip ||
      payload.shippingZip;

    const phoneValue =
      payload.phone ||
      payload.phone_number ||
      payload.phoneNumber;

    // Determine final address values - may need to parse combined string
    let finalAddress1 = rawAddress1Value ? String(rawAddress1Value).trim() : '';
    let finalAddress2 = rawAddress2Value ? String(rawAddress2Value).trim() : '';
    let finalCity = rawCityValue ? String(rawCityValue).trim() : '';
    let finalState = rawStateValue ? String(rawStateValue).trim() : '';
    let finalZip = rawZipValue ? String(rawZipValue).trim() : '';

    // Check if we have a combined address string that needs parsing
    // This happens when Airtable sends "201 ELBRIDGE AVE, APT F, Cloverdale, California, 95425"
    // in the address field without separate city/state/zip fields
    const hasSeparateAddressComponents = rawCityValue || rawStateValue || rawZipValue || rawAddress2Value;
    const looksLikeCombinedAddress = finalAddress1 &&
      finalAddress1.includes(',') &&
      !hasSeparateAddressComponents;

    if (looksLikeCombinedAddress) {
      logger.info(`[WELLMEDR-INVOICE ${requestId}] Detected combined address string, parsing...`, {
        rawAddress: finalAddress1,
      });

      const parsed = parseAddressString(finalAddress1);

      // Use parsed values
      finalAddress1 = parsed.address1;
      finalAddress2 = parsed.address2;
      finalCity = parsed.city;
      finalState = parsed.state;
      finalZip = parsed.zip;

      logger.info(`[WELLMEDR-INVOICE ${requestId}] Parsed address components:`, {
        address1: finalAddress1,
        address2: finalAddress2,
        city: finalCity,
        state: finalState,
        zip: finalZip,
      });
    }

    // Log all address-related fields received for debugging
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Address fields in payload:`, {
      rawAddress1: rawAddress1Value || 'NOT FOUND',
      rawAddress2: rawAddress2Value || 'NOT FOUND',
      rawCity: rawCityValue || 'NOT FOUND',
      rawState: rawStateValue || 'NOT FOUND',
      rawZip: rawZipValue || 'NOT FOUND',
      phoneValue: phoneValue || 'NOT FOUND',
      wasParsed: looksLikeCombinedAddress,
      finalValues: { finalAddress1, finalAddress2, finalCity, finalState, finalZip },
      // Log raw keys to help debug what Airtable is sending
      payloadKeys: Object.keys(payload).filter(k =>
        k.toLowerCase().includes('address') ||
        k.toLowerCase().includes('city') ||
        k.toLowerCase().includes('state') ||
        k.toLowerCase().includes('zip') ||
        k.toLowerCase().includes('postal') ||
        k.toLowerCase().includes('street') ||
        k.toLowerCase().includes('shipping') ||
        k.toLowerCase().includes('phone')
      ),
    });

    const hasAddressData = finalAddress1 || finalCity || finalState || finalZip;
    if (hasAddressData) {
      try {
        const addressUpdate: Record<string, string> = {};

        if (finalAddress1) {
          addressUpdate.address1 = finalAddress1;
        }
        if (finalAddress2) {
          addressUpdate.address2 = finalAddress2;
        }
        if (finalCity) {
          addressUpdate.city = finalCity;
        }
        if (finalState) {
          // Normalize state to 2-letter code
          addressUpdate.state = normalizeState(finalState);
        }
        if (finalZip) {
          addressUpdate.zip = finalZip;
        }
        if (phoneValue) {
          addressUpdate.phone = String(phoneValue).replace(/\D/g, '').slice(-10);
        }

        if (Object.keys(addressUpdate).length > 0) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: addressUpdate,
          });
          logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient address updated`, {
            patientId: patient.id,
            updatedFields: Object.keys(addressUpdate),
            values: addressUpdate,
          });
        }
      } catch (addrErr) {
        // Don't fail the whole request, just log the error
        logger.warn(`[WELLMEDR-INVOICE ${requestId}] Failed to update patient address (non-fatal):`, {
          error: addrErr instanceof Error ? addrErr.message : 'Unknown error',
        });
      }
    } else {
      logger.warn(`[WELLMEDR-INVOICE ${requestId}] ⚠️ No address data found in payload - prescription shipping will fail without an address!`, {
        payloadKeys: Object.keys(payload),
      });
    }

    // CRITICAL: Ensure SOAP note exists for paid invoices ready for prescription
    // This ensures clinical documentation is complete before providers prescribe
    let soapNoteId: number | null = null;
    let soapNoteAction: string = 'skipped';
    try {
      const soapResult = await ensureSoapNoteExists(patient.id, invoice.id);
      soapNoteId = soapResult.soapNoteId;
      soapNoteAction = soapResult.action;
      logger.info(`[WELLMEDR-INVOICE ${requestId}] SOAP note check completed`, {
        patientId: patient.id,
        invoiceId: invoice.id,
        soapAction: soapResult.action,
        soapNoteId: soapResult.soapNoteId,
        soapSuccess: soapResult.success,
      });
    } catch (soapError: any) {
      // Log but don't fail - SOAP note can be generated manually if needed
      logger.warn(`[WELLMEDR-INVOICE ${requestId}] SOAP note generation failed (non-fatal)`, {
        patientId: patient.id,
        invoiceId: invoice.id,
        error: soapError.message,
      });
    }

    const duration = Date.now() - startTime;
    logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ SUCCESS in ${duration}ms`, {
      invoiceId: invoice.id,
      invoiceNumber,
      patientId: patient.id,
      amount: amountInCents,
      product: productName,
      medicationType: medicationType,
      plan: plan,
      status: 'PAID',
      note: 'Internal EONPRO invoice only - no Stripe invoice created',
      addressUpdated: !!hasAddressData,
      soapNoteId,
      soapNoteAction,
    });

    return NextResponse.json({
      success: true,
      requestId,
      message: 'Internal invoice created and marked as paid (no Stripe)',
      invoice: {
        id: invoice.id,
        invoiceNumber,
        amount: amountInCents,
        amountFormatted: `$${(amountInCents / 100).toFixed(2)}`,
        status: invoice.status,
        isPaid: true,
      },
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
      },
      product: productName,
      medicationType: medicationType,
      plan: plan,
      paymentMethodId: payload.method_payment_id,
      processingTime: `${duration}ms`,
      soapNote: {
        id: soapNoteId,
        action: soapNoteAction,
      },
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Failed to create invoice:`, { error: errMsg });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create invoice',
        message: errMsg,
        patientId: patient.id,
        requestId,
      },
      { status: 500 }
    );
  }
}

// GET - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/wellmedr-invoice',
    clinic: 'Wellmedr',
    description: 'Creates invoices for WellMedR patients when payment is detected',
    configured: !!WEBHOOK_SECRET,
    usage: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'YOUR_SECRET',
      },
      body: {
        customer_email: 'patient@example.com (required)',
        method_payment_id: 'pm_... (required)',
        product: 'tirzepatide, semaglutide (optional)',
        medication_type: 'injections, tablets (optional)',
        plan: 'monthly, quarterly, 6-month (optional)',
        price: '$299.99 or amount in cents (optional)',
        customer_name: 'Customer name (optional)',
        submission_id: 'Airtable submission ID (optional)',
        stripe_price_id: 'price_... (optional)',
        address: 'Street address (optional)',
        address_line2: 'Apartment, suite, etc. (optional)',
        city: 'City (optional)',
        state: 'State (optional)',
        zip: 'ZIP code (optional)',
        country: 'Country (optional)',
        payment_date: 'ISO date string (optional)',
      },
    },
  });
}
