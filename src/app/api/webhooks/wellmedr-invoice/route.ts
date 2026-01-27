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
  // Address fields
  address?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  zip_code?: string;
  country?: string;
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

  // Build address string from available fields
  const addressParts = [
    payload.address || payload.address_line1,
    payload.address_line2,
    payload.city,
    payload.state,
    payload.zip || payload.zip_code,
    payload.country,
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
          // Address info
          address: fullAddress,
          addressLine1: payload.address || payload.address_line1 || '',
          addressLine2: payload.address_line2 || '',
          city: payload.city || '',
          state: payload.state || '',
          zipCode: payload.zip || payload.zip_code || '',
          country: payload.country || '',
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
