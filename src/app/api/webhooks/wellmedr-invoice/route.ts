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
 *   "patient_name": "John Doe",
 *   "product": "Tirzepatide 5mg",
 *   "amount": 29900, // Amount in cents
 *   "method_payment_id": "pm_1StwAHDfH4PWyxxdppqIGipS",
 *   "submission_id": "d2620779-9a90-4385-a...",
 *   "order_status": "processing",
 *   "subscription_status": "active"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureSoapNoteExists } from '@/lib/soap-note-automation';
import {
  parseAddressString,
  normalizeState,
  normalizeZip,
  extractAddressFromPayload,
} from '@/lib/address';
import { scheduleFutureRefillsFromInvoice } from '@/lib/shipment-schedule';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { PHISearchService } from '@/lib/security/phi-search';
import { isDLQConfigured, queueFailedSubmission } from '@/lib/queue/deadLetterQueue';
import { generatePatientId } from '@/lib/patients';
import { buildPatientSearchIndex } from '@/lib/utils/search';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// WellMedR clinic configuration
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

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
      cleaned: cleanDate,
    });
    return new Date();
  }

  return parsed;
}

// Auth configuration - reuses the wellmedr intake webhook secret
const WEBHOOK_SECRET =
  process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET || process.env.WELLMEDR_INVOICE_WEBHOOK_SECRET;

interface WellmedrInvoicePayload {
  customer_email: string;
  customer_name?: string;
  patient_name?: string;
  cardholder_name?: string;
  product?: string;
  amount?: number;
  amount_paid?: number;
  price?: string | number;
  method_payment_id: string;
  submission_id?: string;
  order_status?: string;
  subscription_status?: string;
  // Treatment details (product = medication name, medication_type = strength/details, plan = duration)
  plan?: string;
  medication_type?: string;
  medication?: string; // Alternate: Airtable may use "Medication" instead of "Medication Type"
  treatment?: string; // Alternate: Full treatment string (e.g. "Tirzepatide 2.5mg")
  product_name?: string; // Alternate: Some bases use "Product Name" for medication
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
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (providedSecret !== WEBHOOK_SECRET) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Authentication FAILED`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.debug(`[WELLMEDR-INVOICE ${requestId}] ✓ Authenticated`);

  // STEP 2: Get WellMedR clinic
  // Use basePrisma since we haven't resolved clinic context yet
  let clinicId: number;
  try {
    const wellmedrClinic = await basePrisma.clinic.findFirst({
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
      return NextResponse.json({ error: 'Wellmedr clinic not configured' }, { status: 500 });
    }

    clinicId = wellmedrClinic.id;
    logger.info(
      `[WELLMEDR-INVOICE ${requestId}] ✓ CLINIC VERIFIED: ID=${clinicId}, Name="${wellmedrClinic.name}"`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Database error finding clinic:`, {
      error: errMsg,
    });
    return NextResponse.json({ error: 'Database error', message: errMsg }, { status: 500 });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Run remaining steps within tenant (clinic) context
  // This is REQUIRED for all clinic-isolated model operations
  // (patient, invoice, auditLog, etc.)
  // ═══════════════════════════════════════════════════════════════════
  return runWithClinicContext(clinicId, async () => {

  // STEP 3: Parse payload (read raw body for idempotency hash)
  let payload: WellmedrInvoicePayload;
  let rawBody: string;
  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody);
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
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // STEP 3b: Idempotency check — SHA-256 hash of full request body
  const idempotencyKey = `wellmedr-invoice_${createHash('sha256').update(rawBody).digest('hex')}`;

  const existingIdempotencyRecord = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  }).catch((err) => {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Idempotency lookup failed, proceeding`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });

  if (existingIdempotencyRecord) {
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Duplicate request detected, returning cached result`, {
      idempotencyKey: idempotencyKey.substring(0, 40) + '...',
      originalRequestId: existingIdempotencyRecord.response ? 'exists' : 'none',
    });
    const cachedResponse = existingIdempotencyRecord.response as Record<string, unknown> | null;
    return NextResponse.json({
      success: true,
      duplicate: true,
      message: 'Request already processed (idempotency)',
      ...(cachedResponse || {}),
    });
  }

  // STEP 4: Validate required fields
  if (!payload.customer_email) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Missing customer_email`);
    return NextResponse.json({ error: 'Missing required field: customer_email' }, { status: 400 });
  }

  // Reject header row or placeholder emails (e.g. Airtable sending the literal column name)
  const emailLower = payload.customer_email.toLowerCase().trim();
  const INVALID_EMAILS = ['customer_email', 'email', 'customer email', 'test@test.com', 'test@example.com'];
  if (INVALID_EMAILS.includes(emailLower) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Invalid/placeholder email rejected: ${emailLower}`);
    return NextResponse.json({ error: `Invalid email: "${emailLower}" looks like a column header or placeholder` }, { status: 400 });
  }

  if (!payload.method_payment_id) {
    logger.warn(`[WELLMEDR-INVOICE ${requestId}] Missing method_payment_id`);
    return NextResponse.json(
      { error: 'Missing required field: method_payment_id' },
      { status: 400 }
    );
  }

  if (!payload.method_payment_id.startsWith('pm_')) {
    logger.warn(
      `[WELLMEDR-INVOICE ${requestId}] Invalid payment method format: ${payload.method_payment_id}`
    );
    return NextResponse.json(
      { error: 'Invalid payment method format - expected pm_...' },
      { status: 400 }
    );
  }

  // STEP 5: Find patient by email (PHI-safe), then by name, then by submission_id
  // If no patient found, AUTO-CREATE a stub patient to prevent lost prescriptions
  //
  // IMPORTANT: The INTAKE form defines the patient identity, NOT the payment record.
  // The cardholder/customer name on the payment may differ from the patient
  // (e.g. a spouse or family member paying). We always match by EMAIL first
  // (which ties to the intake submission), and only use the payment name for
  // stub patient creation when no intake-based patient exists.
  const email = payload.customer_email.toLowerCase().trim();
  const paymentName =
    (payload.patient_name || payload.customer_name || payload.cardholder_name || '').trim();

  type WellMedRPatient = {
    id: number;
    patientId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  let patient: WellMedRPatient | null = null;
  let wasAutoCreated = false;

  try {
    // Strategy 1: Match by email — use PHISearchService because email is encrypted at rest
    const emailResults = await PHISearchService.searchPatients({
      baseQuery: { clinicId, profileStatus: 'ACTIVE' },
      search: email,
      searchFields: ['email'],
      pagination: { limit: 5, offset: 0 },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const candidate of emailResults.data) {
      const candEmail = safeDecrypt((candidate as { email?: string | null }).email)?.toLowerCase().trim();
      if (candEmail === email) {
        patient = candidate as WellMedRPatient;
        logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient matched by email`, {
          patientId: patient.id,
        });
        break;
      }
    }

    // Strategy 2: Match by name when email fails
    if (!patient && paymentName) {
      logger.info(
        `[WELLMEDR-INVOICE ${requestId}] Email match failed, trying name match: "${paymentName}"`
      );
      const nameResults = await PHISearchService.searchPatients({
        baseQuery: { clinicId, profileStatus: 'ACTIVE' },
        search: paymentName,
        searchFields: ['firstName', 'lastName'],
        pagination: { limit: 5, offset: 0 },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (nameResults.data.length === 1) {
        patient = nameResults.data[0] as WellMedRPatient;
        logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient matched by name`, {
          patientId: patient.id,
          matchedName: paymentName,
        });
      } else if (nameResults.data.length > 1) {
        logger.warn(
          `[WELLMEDR-INVOICE ${requestId}] Multiple patients match name "${paymentName}" — cannot disambiguate`
        );
      }
    }

    // Strategy 3: Match by submission_id stored in patient sourceMetadata
    if (!patient && payload.submission_id) {
      logger.info(
        `[WELLMEDR-INVOICE ${requestId}] Name match failed, trying submission_id: "${payload.submission_id}"`
      );
      const submissionPatient = await prisma.patient.findFirst({
        where: {
          clinicId,
          profileStatus: 'ACTIVE',
          sourceMetadata: {
            path: ['submissionId'],
            equals: payload.submission_id,
          },
        },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
      if (submissionPatient) {
        patient = submissionPatient as WellMedRPatient;
        logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient matched by submission_id`, {
          patientId: patient.id,
          submissionId: payload.submission_id,
        });
      }
    }

    // FALLBACK: Auto-create stub patient to prevent lost prescriptions
    if (!patient) {
      logger.warn(`[WELLMEDR-INVOICE ${requestId}] Patient NOT found — auto-creating stub patient`, {
        searchedEmail: email,
        searchedName: paymentName || '(not provided)',
        clinicId,
      });

      const nameParts = paymentName.split(/\s+/);
      const stubFirstName = nameParts[0] || 'Unknown';
      const stubLastName = nameParts.slice(1).join(' ') || 'Checkout';

      // Extract address from payload for stub (all fields are required in schema)
      // Use placeholder values if not provided — STEP 8 will update with real address later
      const stubAddress1 = String(
        payload.address || payload.address_line1 || payload.address_line_1 ||
        payload.addressLine1 || payload.street_address || payload.streetAddress ||
        payload.shipping_address || payload.shippingAddress || 'Pending'
      ).trim() || 'Pending';
      const stubCity = String(
        payload.city || payload.shipping_city || payload.shippingCity || 'Pending'
      ).trim() || 'Pending';
      const stubState = String(
        payload.state || payload.shipping_state || payload.shippingState || payload.province || 'NA'
      ).trim() || 'NA';
      const stubZip = String(
        payload.zip || payload.zip_code || payload.zipCode ||
        payload.postal_code || payload.postalCode || payload.shipping_zip ||
        payload.shippingZip || '00000'
      ).trim() || '00000';

      const stubPatientId = await generatePatientId(clinicId);
      const searchIndex = buildPatientSearchIndex({
        firstName: stubFirstName,
        lastName: stubLastName,
        email: email,
        patientId: stubPatientId,
      });

      const stubPatient = await prisma.patient.create({
        data: {
          patientId: stubPatientId,
          clinicId,
          firstName: stubFirstName,
          lastName: stubLastName,
          email: email,
          phone: '0000000000',
          dob: '1900-01-01',
          gender: 'm',
          address1: stubAddress1,
          city: stubCity,
          state: stubState,
          zip: stubZip,
          profileStatus: 'ACTIVE',
          source: 'webhook',
          tags: ['wellmedr', 'stub-from-invoice', 'needs-intake-merge'],
          notes: `[${new Date().toISOString()}] Auto-created from invoice webhook — intake form not yet received or matched. Payment: ${payload.method_payment_id?.substring(0, 15)}...`,
          searchIndex,
          sourceMetadata: {
            type: 'wellmedr-invoice-stub',
            submissionId: payload.submission_id || '',
            paymentMethodId: payload.method_payment_id,
            createdByInvoiceWebhook: true,
            originalEmail: email,
            originalName: paymentName,
            timestamp: new Date().toISOString(),
            clinicId,
            clinicName: 'Wellmedr',
          },
        },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      patient = stubPatient as WellMedRPatient;
      wasAutoCreated = true;

      logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Stub patient created`, {
        patientId: patient.id,
        patientIdStr: patient.patientId,
        email: email,
        tags: ['stub-from-invoice', 'needs-intake-merge'],
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Error finding/creating patient:`, { error: errMsg });

    // Queue to DLQ instead of losing the invoice
    if (isDLQConfigured()) {
      try {
        const dlqId = await queueFailedSubmission(
          payload as Record<string, unknown>,
          'wellmedr-invoice',
          `Patient lookup/creation failed: ${errMsg}`,
          {
            patientEmail: email,
            submissionId: payload.submission_id,
            treatmentType: payload.product || payload.medication_type || 'GLP-1',
          }
        );
        logger.info(`[WELLMEDR-INVOICE ${requestId}] Queued to DLQ: ${dlqId}`);
        return NextResponse.json({
          success: false,
          queued: true,
          message: `Patient lookup failed — queued for retry`,
          error: errMsg,
          dlqId,
          requestId,
        }, { status: 202 });
      } catch (dlqErr) {
        logger.error(`[WELLMEDR-INVOICE ${requestId}] DLQ queueing also failed`, {
          error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
        });
      }
    }

    return NextResponse.json(
      { error: 'Database error finding patient', message: errMsg },
      { status: 500 }
    );
  }

  const verifiedPatient = patient!;

  // Log when the payment/cardholder name differs from the patient name (from intake).
  // This is expected — a spouse or family member may pay for the patient.
  // The patient identity ALWAYS comes from the intake form, not the payment.
  const decryptedPatientName = `${safeDecrypt(verifiedPatient.firstName) || ''} ${safeDecrypt(verifiedPatient.lastName) || ''}`.trim().toLowerCase();
  const paymentNameLower = paymentName.toLowerCase();
  if (paymentName && decryptedPatientName && paymentNameLower !== decryptedPatientName) {
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Payment name differs from patient (intake) name — this is normal`, {
      paymentName,
      patientName: decryptedPatientName,
      patientId: verifiedPatient.id,
      note: 'Patient identity comes from intake, not payment. Cardholder may be a family member.',
    });
  }

  // STEP 6: Check for duplicate invoice
  try {
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        patientId: verifiedPatient.id,
        clinicId: clinicId,
        metadata: {
          path: ['stripePaymentMethodId'],
          equals: payload.method_payment_id,
        },
      },
    });

    if (existingInvoice) {
      logger.info(
        `[WELLMEDR-INVOICE ${requestId}] Invoice already exists for this payment: ${existingInvoice.id}`
      );
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'Invoice already exists for this payment',
        invoiceId: existingInvoice.id,
        patientId: verifiedPatient.id,
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
    logger.warn(
      `[WELLMEDR-INVOICE] Amount ${amountInCents} looks like dollars, converting to cents`
    );
    amountInCents = Math.round(amountInCents * 100);
  }

  // Default amount if not provided
  if (!amountInCents || amountInCents <= 0) {
    amountInCents = 29900; // Default $299.00
    logger.warn(
      `[WELLMEDR-INVOICE ${requestId}] No amount provided, using default: $${(amountInCents / 100).toFixed(2)}`
    );
  }

  // Build line item description with product, medication type, and plan
  // CRITICAL: product should be medication name (Tirzepatide, Semaglutide), NOT plan-only (1mo/3mo Injections)
  // Accept alternate Airtable field names: medication, treatment, product_name
  let product = payload.product || 'GLP-1';
  let medicationType =
    payload.medication_type ||
    payload.medication ||
    payload.treatment ||
    payload.product_name ||
    '';
  const plan = payload.plan || '';

  // If product looks like plan-only (1mo/3mo Injections) but we have medication in alternate fields, use it
  const productLower = product.toLowerCase();
  const isPlanOnly =
    !productLower.includes('tirzepatide') &&
    !productLower.includes('semaglutide') &&
    !productLower.includes('mounjaro') &&
    !productLower.includes('zepbound') &&
    !productLower.includes('ozempic') &&
    !productLower.includes('wegovy') &&
    /(\d+\s*mo|\d+\s*month|injections?)/i.test(product);
  if (isPlanOnly && medicationType) {
    // medicationType has the drug name - use it as product, keep original product as plan context
    product = medicationType;
    medicationType = '';
  } else if (isPlanOnly && (payload.medication || payload.treatment || payload.product_name)) {
    const altMed =
      payload.medication || payload.treatment || payload.product_name || '';
    if (altMed && /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(String(altMed))) {
      product = String(altMed);
      medicationType = '';
    }
  }

  // Build a descriptive product name like "Tirzepatide Injections (Monthly)"
  let productName = product.charAt(0).toUpperCase() + product.slice(1).toLowerCase();
  if (medicationType) {
    productName += ` ${medicationType.charAt(0).toUpperCase() + medicationType.slice(1).toLowerCase()}`;
  }
  if (plan) {
    productName += ` (${plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()})`;
  }

  // Decrypt patient PHI for display purposes
  const decryptedFirstName = safeDecrypt(verifiedPatient.firstName) || 'Patient';
  const decryptedLastName = safeDecrypt(verifiedPatient.lastName) || '';
  const decryptedEmail = safeDecrypt(verifiedPatient.email) || '';
  const patientDisplayName = `${decryptedFirstName} ${decryptedLastName}`.trim();

  const customerName = payload.customer_name || payload.cardholder_name || patientDisplayName;

  // Extract address from ALL possible field variations
  const rawExtractedAddress1 = String(
    payload.address ||
      payload.address_line1 ||
      payload.address_line_1 ||
      payload.addressLine1 ||
      payload.street_address ||
      payload.streetAddress ||
      payload.shipping_address ||
      payload.shippingAddress ||
      ''
  ).trim();

  const rawExtractedAddress2 = String(
    payload.address_line2 ||
      payload.address_line_2 ||
      payload.addressLine2 ||
      payload.apartment ||
      payload.apt ||
      payload.suite ||
      payload.unit ||
      ''
  ).trim();

  const rawExtractedCity = String(
    payload.city || payload.shipping_city || payload.shippingCity || ''
  ).trim();

  const rawExtractedState = String(
    payload.state || payload.shipping_state || payload.shippingState || payload.province || ''
  ).trim();

  const rawExtractedZip = String(
    payload.zip ||
      payload.zip_code ||
      payload.zipCode ||
      payload.postal_code ||
      payload.postalCode ||
      payload.shipping_zip ||
      payload.shippingZip ||
      ''
  ).trim();

  // Check if we need to parse a combined address string for metadata
  const metadataHasSeparateComponents =
    rawExtractedCity || rawExtractedState || rawExtractedZip || rawExtractedAddress2;
  const metadataLooksCombined =
    rawExtractedAddress1 && rawExtractedAddress1.includes(',') && !metadataHasSeparateComponents;

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
        patientId: verifiedPatient.id,
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

    // STEP 7b: Schedule future refills for 6-month and 12-month packages
    // Pharmacy ships 3 months at a time (90-day BUD). For longer plans, queue refills at 90, 180, 270 days.
    const planLower = (plan || '').toLowerCase();
    if (/6[\s-]*month|6month|12[\s-]*month|12month|annual|yearly|semi[\s-]*annual/.test(planLower)) {
      try {
        const medicationName =
          product && medicationType
            ? `${product} ${medicationType}`.trim()
            : product || medicationType || 'GLP-1';
        const refills = await scheduleFutureRefillsFromInvoice({
          clinicId,
          patientId: verifiedPatient.id,
          invoiceId: invoice.id,
          medicationName,
          planName: plan || productName,
          prescriptionDate: parsePaymentDate(payload.payment_date),
        });
        if (refills.length > 0) {
          logger.info(`[WELLMEDR-INVOICE ${requestId}] Scheduled ${refills.length} future refill(s)`, {
            invoiceId: invoice.id,
            plan,
            nextDates: refills.map((r) => r.nextRefillDate),
          });
        }
      } catch (refillErr) {
        const msg = refillErr instanceof Error ? refillErr.message : 'Unknown';
        logger.warn(`[WELLMEDR-INVOICE ${requestId}] Refill scheduling failed (non-fatal)`, {
          error: msg,
          invoiceId: invoice.id,
        });
      }
    }

    // STEP 8: Update patient address if provided in payload
    // Support ALL possible Airtable field name variations
    //
    // IMPORTANT: Airtable automations often send BOTH a combined address string
    // (shipping_address/billing_address) AND individual fields (city, state, zip).
    // When the address has an apartment/unit, Airtable's own naive comma split
    // puts the apartment in the city field, shifting city→state and state→zip.
    // We ALWAYS prefer parsing the combined string when available.

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

    const rawCityValue = payload.city || payload.shipping_city || payload.shippingCity;

    const rawStateValue =
      payload.state || payload.shipping_state || payload.shippingState || payload.province;

    const rawZipValue =
      payload.zip ||
      payload.zip_code ||
      payload.zipCode ||
      payload.postal_code ||
      payload.postalCode ||
      payload.shipping_zip ||
      payload.shippingZip;

    const phoneValue = payload.phone || payload.phone_number || payload.phoneNumber;

    // Look for combined address strings (shipping_address, billing_address)
    // These are the most reliable source since they contain the full address
    const combinedAddressString =
      (payload.shipping_address && typeof payload.shipping_address === 'string'
        ? String(payload.shipping_address).trim()
        : '') ||
      (payload.billing_address && typeof payload.billing_address === 'string'
        ? String(payload.billing_address).trim()
        : '') ||
      (payload.shippingAddress && typeof payload.shippingAddress === 'string'
        ? String(payload.shippingAddress).trim()
        : '');

    const combinedHasCommas = combinedAddressString.includes(',');

    // Determine final address values
    let finalAddress1 = rawAddress1Value ? String(rawAddress1Value).trim() : '';
    let finalAddress2 = rawAddress2Value ? String(rawAddress2Value).trim() : '';
    let finalCity = rawCityValue ? String(rawCityValue).trim() : '';
    let finalState = rawStateValue ? String(rawStateValue).trim() : '';
    let finalZip = rawZipValue ? String(rawZipValue).trim() : '';

    // ALWAYS prefer parsing the combined address string when available.
    // Airtable's naive comma-split creates corrupt individual fields for addresses
    // with apartment/unit numbers (e.g., "123 Main St, Apt 4B, City, State, Zip"
    // gets split as: address1="123 Main St", city="Apt 4B", state="City", zip="State")
    if (combinedHasCommas) {
      logger.info(`[WELLMEDR-INVOICE ${requestId}] Parsing combined address string (preferred source)`, {
        combinedAddress: combinedAddressString.substring(0, 80),
      });

      const parsed = parseAddressString(combinedAddressString);

      if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
        finalAddress1 = parsed.address1;
        finalAddress2 = parsed.address2;
        finalCity = parsed.city;
        finalState = parsed.state;
        finalZip = parsed.zip;

        logger.info(`[WELLMEDR-INVOICE ${requestId}] Address parsed from combined string:`, {
          address1: finalAddress1,
          address2: finalAddress2,
          city: finalCity,
          state: finalState,
          zip: finalZip,
        });
      }
    } else if (finalAddress1 && finalAddress1.includes(',')) {
      // Fallback: rawAddress1Value itself contains commas (older payload format)
      logger.info(`[WELLMEDR-INVOICE ${requestId}] Parsing combined address from address field`, {
        rawAddress: finalAddress1.substring(0, 80),
      });

      const parsed = parseAddressString(finalAddress1);

      if (parsed.address1 || parsed.city || parsed.state || parsed.zip) {
        finalAddress1 = parsed.address1;
        finalAddress2 = parsed.address2;
        finalCity = parsed.city;
        finalState = parsed.state;
        finalZip = parsed.zip;
      }
    }

    // Log all address-related fields received for debugging
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Address fields in payload:`, {
      rawAddress1: rawAddress1Value || 'NOT FOUND',
      rawAddress2: rawAddress2Value || 'NOT FOUND',
      rawCity: rawCityValue || 'NOT FOUND',
      rawState: rawStateValue || 'NOT FOUND',
      rawZip: rawZipValue || 'NOT FOUND',
      phoneValue: phoneValue || 'NOT FOUND',
      wasParsed: combinedHasCommas,
      finalValues: { finalAddress1, finalAddress2, finalCity, finalState, finalZip },
      // Log raw keys to help debug what Airtable is sending
      payloadKeys: Object.keys(payload).filter(
        (k) =>
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
            where: { id: verifiedPatient.id },
            data: addressUpdate,
          });
          logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Patient address updated`, {
            patientId: verifiedPatient.id,
            updatedFields: Object.keys(addressUpdate),
            values: addressUpdate,
          });
        }
      } catch (addrErr) {
        // Don't fail the whole request, just log the error
        logger.warn(
          `[WELLMEDR-INVOICE ${requestId}] Failed to update patient address (non-fatal):`,
          {
            error: addrErr instanceof Error ? addrErr.message : 'Unknown error',
          }
        );
      }
    } else {
      logger.warn(
        `[WELLMEDR-INVOICE ${requestId}] ⚠️ No address data found in payload - prescription shipping will fail without an address!`,
        {
          payloadKeys: Object.keys(payload),
        }
      );
    }

    // STEP 9: Extract preferred medication from intake document when invoice has plan-only product
    // This ensures the Rx Queue shows the actual medication name (Tirzepatide/Semaglutide)
    // even when Airtable sends plan-only in the product field (e.g. "6mo Injections")
    const productLowerCheck = product.toLowerCase();
    const invoiceHasPlanOnly =
      !productLowerCheck.includes('tirzepatide') &&
      !productLowerCheck.includes('semaglutide') &&
      !productLowerCheck.includes('mounjaro') &&
      !productLowerCheck.includes('zepbound') &&
      !productLowerCheck.includes('ozempic') &&
      !productLowerCheck.includes('wegovy');

    let preferredMedication: string | null = null;

    if (invoiceHasPlanOnly) {
      try {
        const intakeDoc = await prisma.patientDocument.findFirst({
          where: {
            patientId: verifiedPatient.id,
            category: 'MEDICAL_INTAKE_FORM',
          },
          orderBy: { createdAt: 'desc' },
          select: { data: true },
        });

        if (intakeDoc?.data) {
          let rawData: string;
          if (Buffer.isBuffer(intakeDoc.data)) {
            rawData = intakeDoc.data.toString('utf8');
          } else if (intakeDoc.data instanceof Uint8Array) {
            rawData = new TextDecoder().decode(intakeDoc.data);
          } else if (
            typeof intakeDoc.data === 'object' &&
            (intakeDoc.data as any).type === 'Buffer' &&
            Array.isArray((intakeDoc.data as any).data)
          ) {
            rawData = new TextDecoder().decode(new Uint8Array((intakeDoc.data as any).data));
          } else {
            rawData = String(intakeDoc.data);
          }

          const docJson = JSON.parse(rawData);

          // Check root-level fields used by WellMedR/Airtable intake forms
          const medFields = [
            'preferred-meds',
            'preferredMedication',
            'preferred_meds',
            'medication-preference',
            'medication_type',
            'medicationType',
            'glp1-medication-type',
            'glp1_last_30_medication_type',
            'glp1-last-30-medication-type',
            'product',
            'treatment',
          ];
          for (const field of medFields) {
            const val = docJson[field];
            if (val && typeof val === 'string' && val.trim()) {
              const s = val.trim();
              if (
                /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(s) &&
                s.toLowerCase() !== 'none'
              ) {
                preferredMedication = s;
                break;
              }
            }
          }

          // Also check answers array
          if (!preferredMedication && docJson.answers && Array.isArray(docJson.answers)) {
            for (const a of docJson.answers) {
              const key = String(a.question || a.field || a.id || a.label || '').toLowerCase().replace(/[-_\s]/g, '');
              const val = a.answer ?? a.value;
              if (typeof val !== 'string' || !val.trim()) continue;
              if (
                key.includes('preferred') ||
                key.includes('medication') ||
                key.includes('glp1type') ||
                key.includes('treatment')
              ) {
                if (
                  /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(val) &&
                  val.toLowerCase() !== 'none'
                ) {
                  preferredMedication = val.trim();
                  break;
                }
              }
            }
          }
        }

        // Fallback: Price-based medication derivation for WellMedR
        // WellMedR has fixed pricing: Tirzepatide is ~1.5-1.7x Semaglutide at each plan level
        if (!preferredMedication && amountInCents > 0) {
          const dollars = amountInCents / 100;
          // Parse plan months from plan string
          const planLowerForMonths = (plan || '').toLowerCase().replace(/[\s-]/g, '');
          const monthMap: Record<string, number> = {
            '1mo': 1, '1month': 1, monthly: 1,
            '3mo': 3, '3month': 3, quarterly: 3,
            '6mo': 6, '6month': 6,
            '12mo': 12, '12month': 12, annual: 12, yearly: 12,
          };
          const planMonths = monthMap[planLowerForMonths] || 0;

          // Also try to extract months from product string (e.g. "6mo Injections" → 6)
          const prodMonthMatch = product.match(/(\d+)\s*mo/i);
          const effectiveMonths = planMonths || (prodMonthMatch ? parseInt(prodMonthMatch[1], 10) : 0);

          // Thresholds: midpoint between Sema and Tirz prices at each plan level
          const thresholds: Record<number, number> = { 1: 204, 3: 581, 6: 1027, 12: 1710 };
          const threshold = thresholds[effectiveMonths];
          if (threshold) {
            preferredMedication = dollars < threshold ? 'Semaglutide' : 'Tirzepatide';
            logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Derived medication from price`, {
              preferredMedication,
              dollars,
              planMonths: effectiveMonths,
              threshold,
            });
          } else {
            // Unknown plan — try exact price matching with 10% tolerance
            const knownPrices = [
              { price: 149, med: 'Semaglutide' }, { price: 259, med: 'Tirzepatide' },
              { price: 485, med: 'Semaglutide' }, { price: 677, med: 'Tirzepatide' },
              { price: 820, med: 'Semaglutide' }, { price: 1234, med: 'Tirzepatide' },
              { price: 1290, med: 'Semaglutide' }, { price: 2130, med: 'Tirzepatide' },
            ];
            for (const kp of knownPrices) {
              if (Math.abs(dollars - kp.price) / kp.price < 0.10) {
                preferredMedication = kp.med;
                logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Derived medication from exact price match`, {
                  preferredMedication, dollars, matchedPrice: kp.price,
                });
                break;
              }
            }
          }
        }

        if (preferredMedication) {
          // Update the invoice metadata with the preferred medication
          const existingMeta = (invoice.metadata as Record<string, unknown>) || {};
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              metadata: {
                ...existingMeta,
                preferredMedication,
              },
            },
          });
          logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ Stored preferred medication in invoice metadata`, {
            preferredMedication,
            patientId: verifiedPatient.id,
            invoiceId: invoice.id,
          });
        } else {
          logger.info(`[WELLMEDR-INVOICE ${requestId}] Could not determine preferred medication`, {
            patientId: verifiedPatient.id,
            invoiceId: invoice.id,
            product,
            amountInCents,
          });
        }
      } catch (medExtractErr) {
        // Non-fatal - the queue API has its own fallback
        logger.warn(`[WELLMEDR-INVOICE ${requestId}] Medication extraction failed (non-fatal)`, {
          error: medExtractErr instanceof Error ? medExtractErr.message : String(medExtractErr),
        });
      }
    }

    // CRITICAL: Ensure SOAP note exists for paid invoices ready for prescription
    // This ensures clinical documentation is complete before providers prescribe
    let soapNoteId: number | null = null;
    let soapNoteAction: string = 'skipped';
    try {
      const soapResult = await ensureSoapNoteExists(verifiedPatient.id, invoice.id);
      soapNoteId = soapResult.soapNoteId;
      soapNoteAction = soapResult.action;
      logger.info(`[WELLMEDR-INVOICE ${requestId}] SOAP note check completed`, {
        patientId: verifiedPatient.id,
        invoiceId: invoice.id,
        soapAction: soapResult.action,
        soapNoteId: soapResult.soapNoteId,
        soapSuccess: soapResult.success,
      });
    } catch (soapError: any) {
      // Log but don't fail - SOAP note can be generated manually if needed
      logger.warn(`[WELLMEDR-INVOICE ${requestId}] SOAP note generation failed (non-fatal)`, {
        patientId: verifiedPatient.id,
        invoiceId: invoice.id,
        error: soapError.message,
      });
    }

    const duration = Date.now() - startTime;
    logger.info(`[WELLMEDR-INVOICE ${requestId}] ✓ SUCCESS in ${duration}ms`, {
      invoiceId: invoice.id,
      invoiceNumber,
      patientId: verifiedPatient.id,
      amount: amountInCents,
      product: productName,
      medicationType: medicationType,
      plan: plan,
      status: 'PAID',
      note: 'Internal EONPRO invoice only - no Stripe invoice created',
      addressUpdated: !!hasAddressData,
      wasAutoCreated,
      soapNoteId,
      soapNoteAction,
    });

    const responsePayload = {
      success: true,
      requestId,
      message: wasAutoCreated
        ? 'Invoice created with auto-generated stub patient (intake pending merge)'
        : 'Internal invoice created and marked as paid (no Stripe)',
      invoice: {
        id: invoice.id,
        invoiceNumber,
        amount: amountInCents,
        amountFormatted: `$${(amountInCents / 100).toFixed(2)}`,
        status: invoice.status,
        isPaid: true,
      },
      patient: {
        id: verifiedPatient.id,
        patientId: verifiedPatient.patientId,
        name: patientDisplayName,
        email: decryptedEmail,
        wasAutoCreated,
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
    };

    // Record idempotency so duplicate requests get the cached response
    try {
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          response: responsePayload as any,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL
        },
      });
    } catch (idemErr) {
      // Non-fatal — duplicate key (P2002) means another request beat us, which is fine
      const code = (idemErr as any)?.code;
      if (code !== 'P2002') {
        logger.warn(`[WELLMEDR-INVOICE ${requestId}] Idempotency record creation failed`, {
          error: idemErr instanceof Error ? idemErr.message : String(idemErr),
        });
      }
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[WELLMEDR-INVOICE ${requestId}] Failed to create invoice:`, { error: errMsg });

    // Queue to DLQ for retry instead of losing the prescription
    if (isDLQConfigured()) {
      try {
        const dlqId = await queueFailedSubmission(
          payload as Record<string, unknown>,
          'wellmedr-invoice',
          `Invoice creation failed: ${errMsg}`,
          {
            patientEmail: email,
            submissionId: payload.submission_id,
            treatmentType: payload.product || payload.medication_type || 'GLP-1',
          }
        );
        logger.info(`[WELLMEDR-INVOICE ${requestId}] Queued to DLQ for retry: ${dlqId}`);
        return NextResponse.json(
          {
            success: false,
            queued: true,
            message: 'Invoice creation failed — queued for retry',
            dlqId,
            requestId,
            patientId: verifiedPatient.id,
          },
          { status: 202 }
        );
      } catch (dlqErr) {
        logger.error(`[WELLMEDR-INVOICE ${requestId}] DLQ queueing also failed`, {
          error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
        });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create invoice',
        message: errMsg,
        patientId: verifiedPatient.id,
        requestId,
      },
      { status: 500 }
    );
  }
  }); // end runWithClinicContext
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
        patient_name: 'Patient name for fallback matching (optional - use when email may differ)',
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
