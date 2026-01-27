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
  // Amount should be in cents
  let amountInCents = payload.amount || payload.amount_paid || 0;
  
  // Try to parse price if amount not provided (price might be "$299.99" format)
  if (!amountInCents && payload.price) {
    if (typeof payload.price === 'number') {
      amountInCents = payload.price < 1000 ? Math.round(payload.price * 100) : payload.price;
    } else if (typeof payload.price === 'string') {
      const cleanedPrice = payload.price.replace(/[$,]/g, '').trim();
      const parsedPrice = parseFloat(cleanedPrice);
      if (!isNaN(parsedPrice)) {
        amountInCents = Math.round(parsedPrice * 100);
      }
    }
  }
  
  // If amount looks like dollars (less than 1000), convert to cents
  if (amountInCents > 0 && amountInCents < 1000) {
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
  const extractedAddress1 = 
    payload.address || 
    payload.address_line1 || 
    payload.address_line_1 ||
    payload.addressLine1 ||
    payload.street_address ||
    payload.streetAddress ||
    payload.shipping_address ||
    payload.shippingAddress || '';
  
  const extractedAddress2 = 
    payload.address_line2 ||
    payload.address_line_2 ||
    payload.addressLine2 ||
    payload.apartment ||
    payload.apt ||
    payload.suite ||
    payload.unit || '';
  
  const extractedCity = 
    payload.city ||
    payload.shipping_city ||
    payload.shippingCity || '';
  
  const extractedState = 
    payload.state ||
    payload.shipping_state ||
    payload.shippingState ||
    payload.province || '';
  
  const extractedZip = 
    payload.zip ||
    payload.zip_code ||
    payload.zipCode ||
    payload.postal_code ||
    payload.postalCode ||
    payload.shipping_zip ||
    payload.shippingZip || '';
  
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
    const address1Value = 
      payload.address || 
      payload.address_line1 || 
      payload.address_line_1 ||
      payload.addressLine1 ||
      payload.street_address ||
      payload.streetAddress ||
      payload.shipping_address ||
      payload.shippingAddress;
    
    const address2Value = 
      payload.address_line2 ||
      payload.address_line_2 ||
      payload.addressLine2 ||
      payload.apartment ||
      payload.apt ||
      payload.suite ||
      payload.unit;
    
    const cityValue = 
      payload.city ||
      payload.shipping_city ||
      payload.shippingCity;
    
    const stateValue = 
      payload.state ||
      payload.shipping_state ||
      payload.shippingState ||
      payload.province;
    
    const zipValue = 
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
    
    // Log all address-related fields received for debugging
    logger.info(`[WELLMEDR-INVOICE ${requestId}] Address fields in payload:`, {
      address1Value: address1Value || 'NOT FOUND',
      address2Value: address2Value || 'NOT FOUND',
      cityValue: cityValue || 'NOT FOUND',
      stateValue: stateValue || 'NOT FOUND',
      zipValue: zipValue || 'NOT FOUND',
      phoneValue: phoneValue || 'NOT FOUND',
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

    const hasAddressData = address1Value || cityValue || stateValue || zipValue;
    if (hasAddressData) {
      try {
        const addressUpdate: Record<string, string> = {};

        if (address1Value) {
          addressUpdate.address1 = String(address1Value);
        }
        if (address2Value) {
          addressUpdate.address2 = String(address2Value);
        }
        if (cityValue) {
          addressUpdate.city = String(cityValue);
        }
        if (stateValue) {
          // Normalize state to 2-letter code
          addressUpdate.state = normalizeState(String(stateValue));
        }
        if (zipValue) {
          addressUpdate.zip = String(zipValue);
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
