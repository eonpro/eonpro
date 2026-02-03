/**
 * Payment Matching Service
 * ========================
 *
 * Matches incoming Stripe payments to patients and creates internal invoices.
 * Handles patient creation when no match is found.
 *
 * KEY ENHANCEMENT: When billing_details is incomplete, this service fetches
 * the full Stripe Customer object to get complete customer data (name, email, phone).
 * This ensures patients created from payments have maximum available information.
 *
 * Matching priority:
 * 1. stripeCustomerId (exact match - already linked)
 * 2. Email (case-insensitive)
 * 3. Phone (normalized)
 * 4. Full name match (firstName + lastName)
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generatePatientId } from '@/lib/patients';
import Stripe from 'stripe';
import type { Patient, Invoice, InvoiceStatus } from '@prisma/client';

// ProfileStatus enum - will be available after running migration and prisma generate
// For now, we use string literals: 'ACTIVE' | 'PENDING_COMPLETION' | 'MERGED' | 'ARCHIVED'

// ============================================================================
// Types
// ============================================================================

export interface StripePaymentData {
  /** Stripe customer ID */
  customerId: string | null;
  /** Customer email */
  email: string | null;
  /** Customer name (full name) */
  name: string | null;
  /** Customer phone */
  phone: string | null;
  /** Payment amount in cents */
  amount: number;
  /** Currency (default: usd) */
  currency: string;
  /** Payment description */
  description: string | null;
  /** Stripe payment intent ID */
  paymentIntentId: string | null;
  /** Stripe charge ID */
  chargeId: string | null;
  /** Stripe invoice ID (if from invoice payment) */
  stripeInvoiceId: string | null;
  /** Payment metadata from Stripe */
  metadata: Record<string, string>;
  /** Timestamp of payment */
  paidAt: Date;
  /** Customer address from Stripe */
  address?: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
}

// ============================================================================
// Stripe Client for fetching Customer data
// ============================================================================

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe | null {
  if (!stripeClient) {
    const secretKey = process.env.OT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      logger.warn('[PaymentMatching] No Stripe secret key configured');
      return null;
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }
  return stripeClient;
}

/**
 * Fetch complete customer data from Stripe Customer object
 * This is used when billing_details is incomplete
 *
 * Extracts data from multiple Stripe Customer fields:
 * - email: Primary email
 * - name: Customer name (if set)
 * - description: Often contains the customer's full name
 * - phone: Phone number
 * - address: Full address object
 * - metadata: Custom fields that might contain name/info
 */
export async function fetchStripeCustomerData(customerId: string): Promise<{
  email: string | null;
  name: string | null;
  phone: string | null;
  address: StripePaymentData['address'] | null;
}> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { email: null, name: null, phone: null, address: null };
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      logger.warn('[PaymentMatching] Stripe customer is deleted', { customerId });
      return { email: null, name: null, phone: null, address: null };
    }

    const stripeCustomer = customer as Stripe.Customer;

    // Try to get name from multiple sources (in priority order):
    // 1. customer.name - explicit name field
    // 2. customer.description - often contains full name
    // 3. customer.metadata.name or customer.metadata.customer_name
    let customerName: string | null = stripeCustomer.name || null;

    if (!customerName && stripeCustomer.description) {
      // Description often contains just the name like "Heath Horchem"
      // Only use if it looks like a name (has letters, reasonable length)
      const desc = stripeCustomer.description.trim();
      if (desc.length > 2 && desc.length < 100 && /^[A-Za-z\s\-']+$/.test(desc)) {
        customerName = desc;
        logger.debug('[PaymentMatching] Using customer description as name', {
          customerId,
          description: desc,
        });
      }
    }

    if (!customerName && stripeCustomer.metadata) {
      // Check common metadata fields for name
      customerName = stripeCustomer.metadata.name ||
                    stripeCustomer.metadata.customer_name ||
                    stripeCustomer.metadata.full_name ||
                    stripeCustomer.metadata.fullName ||
                    null;
    }

    // Also check metadata for phone if not set
    let customerPhone: string | null = stripeCustomer.phone || null;
    if (!customerPhone && stripeCustomer.metadata) {
      customerPhone = stripeCustomer.metadata.phone ||
                     stripeCustomer.metadata.phone_number ||
                     null;
    }

    logger.debug('[PaymentMatching] Fetched Stripe customer data', {
      customerId,
      hasName: !!customerName,
      hasEmail: !!stripeCustomer.email,
      hasPhone: !!customerPhone,
      hasAddress: !!stripeCustomer.address,
      nameSource: stripeCustomer.name ? 'name' :
                 stripeCustomer.description ? 'description' :
                 stripeCustomer.metadata?.name ? 'metadata' : 'none',
    });

    return {
      email: stripeCustomer.email,
      name: customerName,
      phone: customerPhone,
      address: stripeCustomer.address ? {
        line1: stripeCustomer.address.line1,
        line2: stripeCustomer.address.line2,
        city: stripeCustomer.address.city,
        state: stripeCustomer.address.state,
        postal_code: stripeCustomer.address.postal_code,
        country: stripeCustomer.address.country,
      } : null,
    };
  } catch (error) {
    logger.warn('[PaymentMatching] Failed to fetch Stripe customer', {
      customerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { email: null, name: null, phone: null, address: null };
  }
}

/**
 * Extract customer name from invoice/payment description
 * Common formats:
 * - "Invoice 1819 (Heath Horchem)"
 * - "Payment for John Smith"
 * - "Order #123 - Jane Doe"
 */
function extractNameFromDescription(description: string | null): string | null {
  if (!description) return null;

  // Pattern 1: "Invoice XXXX (Name)" or "Payment (Name)"
  const parenMatch = description.match(/\(([^)]+)\)\s*$/);
  if (parenMatch && parenMatch[1]) {
    const name = parenMatch[1].trim();
    // Make sure it looks like a name (has at least one letter, not just numbers)
    if (/[a-zA-Z]/.test(name) && name.length > 2) {
      return name;
    }
  }

  // Pattern 2: "Payment for Name" or "Invoice for Name"
  const forMatch = description.match(/(?:payment|invoice|order)\s+for\s+([^-–]+)/i);
  if (forMatch && forMatch[1]) {
    const name = forMatch[1].trim();
    if (/[a-zA-Z]/.test(name) && name.length > 2) {
      return name;
    }
  }

  // Pattern 3: "Name - Description" at the start
  const dashMatch = description.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*[-–]/);
  if (dashMatch && dashMatch[1]) {
    return dashMatch[1].trim();
  }

  return null;
}

/**
 * Enhance payment data with full customer information from Stripe
 * Called when billing_details is incomplete
 *
 * Data sources (in priority order):
 * 1. billing_details from payment (already in paymentData)
 * 2. Stripe Customer object
 * 3. Name extracted from description (e.g., "Invoice 1819 (Heath Horchem)")
 */
export async function enhancePaymentDataWithCustomerInfo(
  paymentData: StripePaymentData
): Promise<StripePaymentData> {
  let enhanced = { ...paymentData };

  // Try to extract name from description as fallback
  const descriptionName = extractNameFromDescription(paymentData.description);
  if (descriptionName) {
    logger.debug('[PaymentMatching] Found name in description', {
      description: paymentData.description,
      extractedName: descriptionName,
    });
  }

  // Helper to check if a name is valid (not empty/whitespace/placeholder)
  const isValidName = (name: string | null): boolean => {
    if (!name) return false;
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    // Check for placeholder names
    const lowerName = trimmed.toLowerCase();
    if (lowerName === 'unknown' || lowerName === 'unknown customer' || lowerName === 'customer') {
      return false;
    }
    return true;
  };

  // If we already have complete data with a VALID name, we can return early
  // But if the name is empty/placeholder, we should still try to fetch better data
  if (paymentData.email && isValidName(paymentData.name)) {
    return enhanced;
  }

  // Fetch from Stripe Customer if we have customer ID
  if (paymentData.customerId) {
    logger.debug('[PaymentMatching] Fetching full customer data from Stripe', {
      customerId: paymentData.customerId,
      hasEmail: !!paymentData.email,
      hasName: !!paymentData.name,
    });

    const customerData = await fetchStripeCustomerData(paymentData.customerId);

    // Merge customer data (valid payment data takes priority)
    // Use helper to check for valid names (not empty/placeholder)
    enhanced = {
      ...enhanced,
      email: enhanced.email || customerData.email,
      name: isValidName(enhanced.name) ? enhanced.name : (customerData.name || enhanced.name),
      phone: enhanced.phone || customerData.phone,
      address: enhanced.address || customerData.address,
    };

    if (customerData.email || customerData.name || customerData.phone) {
      logger.info('[PaymentMatching] Enhanced payment data with Stripe customer info', {
        customerId: paymentData.customerId,
        addedEmail: !paymentData.email && !!customerData.email,
        addedName: !paymentData.name && !!customerData.name,
        addedPhone: !paymentData.phone && !!customerData.phone,
        addedAddress: !paymentData.address && !!customerData.address,
      });
    }
  }

  // If still no name, use the one from description
  if (!enhanced.name && descriptionName) {
    enhanced.name = descriptionName;
    logger.info('[PaymentMatching] Using name extracted from description', {
      name: descriptionName,
      description: paymentData.description,
    });
  }

  return enhanced;
}

export interface PatientMatchResult {
  patient: Patient | null;
  matchedBy: 'stripeCustomerId' | 'email' | 'phone' | 'name' | null;
  confidence: 'exact' | 'high' | 'medium' | 'low' | null;
}

export interface PaymentProcessingResult {
  success: boolean;
  patient: Patient | null;
  invoice: Invoice | null;
  matchResult: PatientMatchResult;
  patientCreated: boolean;
  error?: string;
}

// ============================================================================
// Patient Matching Functions
// ============================================================================

/**
 * Find a patient by Stripe customer ID
 *
 * CRITICAL: When clinicId is provided, this function filters by clinic to prevent
 * cross-clinic data leakage. The stripeCustomerId is globally unique, but we still
 * enforce clinic isolation as a defense-in-depth measure.
 *
 * @param customerId - Stripe customer ID (cus_xxx)
 * @param clinicId - Optional clinic ID to enforce multi-tenant isolation
 */
export async function findPatientByStripeCustomerId(
  customerId: string,
  clinicId?: number
): Promise<Patient | null> {
  // First, find by stripeCustomerId (which is unique)
  const patient = await prisma.patient.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!patient) {
    return null;
  }

  // CRITICAL: Validate clinic isolation when clinicId is provided
  // This prevents cross-clinic data leakage even if stripeCustomerId somehow matches
  if (clinicId && patient.clinicId !== clinicId) {
    logger.warn('[PaymentMatching] SECURITY: Patient found by stripeCustomerId belongs to different clinic', {
      stripeCustomerId: customerId,
      patientId: patient.id,
      patientClinicId: patient.clinicId,
      requestedClinicId: clinicId,
    });
    // Return null to prevent cross-clinic match
    return null;
  }

  return patient;
}

/**
 * Find a patient by email (case-insensitive)
 */
export async function findPatientByEmail(
  email: string,
  clinicId?: number
): Promise<Patient | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const where: { email: { equals: string; mode: 'insensitive' }; clinicId?: number } = {
    email: {
      equals: normalizedEmail,
      mode: 'insensitive',
    },
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  // Return most recently created patient if multiple matches
  return prisma.patient.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Find a patient by phone number (normalized)
 */
export async function findPatientByPhone(
  phone: string,
  clinicId?: number
): Promise<Patient | null> {
  // Normalize phone: remove all non-digits
  const normalizedPhone = phone.replace(/\D/g, '');

  // Also try with common formats
  const phoneVariants = [
    normalizedPhone,
    // If 10 digits, try with +1 prefix
    normalizedPhone.length === 10 ? `1${normalizedPhone}` : null,
    // If 11 digits starting with 1, try without
    normalizedPhone.length === 11 && normalizedPhone.startsWith('1')
      ? normalizedPhone.slice(1)
      : null,
  ].filter(Boolean) as string[];

  const where: { OR: { phone: { contains: string } }[]; clinicId?: number } = {
    OR: phoneVariants.map(p => ({
      phone: { contains: p },
    })),
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  return prisma.patient.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Find a patient by name (first + last)
 */
export async function findPatientByName(
  firstName: string,
  lastName: string,
  clinicId?: number
): Promise<Patient | null> {
  const where: {
    firstName: { equals: string; mode: 'insensitive' };
    lastName: { equals: string; mode: 'insensitive' };
    clinicId?: number;
  } = {
    firstName: {
      equals: firstName.trim(),
      mode: 'insensitive',
    },
    lastName: {
      equals: lastName.trim(),
      mode: 'insensitive',
    },
  };

  if (clinicId) {
    where.clinicId = clinicId;
  }

  return prisma.patient.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Split a full name into first and last name
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // Last part is last name, everything else is first name
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');

  return { firstName, lastName };
}

// ============================================================================
// Main Matching Logic
// ============================================================================

/**
 * Match a Stripe payment to a patient using multiple strategies
 */
export async function matchPatientFromPayment(
  paymentData: StripePaymentData,
  clinicId?: number
): Promise<PatientMatchResult> {
  // Priority 1: Match by Stripe customer ID (most reliable)
  // CRITICAL: Pass clinicId to enforce multi-tenant isolation
  if (paymentData.customerId) {
    const patient = await findPatientByStripeCustomerId(paymentData.customerId, clinicId);
    if (patient) {
      logger.debug('[PaymentMatching] Matched by stripeCustomerId', {
        customerId: paymentData.customerId,
        patientId: patient.id,
        clinicId: patient.clinicId,
      });
      return {
        patient,
        matchedBy: 'stripeCustomerId',
        confidence: 'exact',
      };
    }
  }

  // Priority 2: Match by email (high confidence)
  if (paymentData.email) {
    const patient = await findPatientByEmail(paymentData.email, clinicId);
    if (patient) {
      logger.debug('[PaymentMatching] Matched by email', {
        email: paymentData.email,
        patientId: patient.id,
      });
      return {
        patient,
        matchedBy: 'email',
        confidence: 'high',
      };
    }
  }

  // Priority 3: Match by phone (medium confidence)
  if (paymentData.phone) {
    const patient = await findPatientByPhone(paymentData.phone, clinicId);
    if (patient) {
      logger.debug('[PaymentMatching] Matched by phone', {
        phone: paymentData.phone,
        patientId: patient.id,
      });
      return {
        patient,
        matchedBy: 'phone',
        confidence: 'medium',
      };
    }
  }

  // Priority 4: Match by name (low confidence - only if we have full name)
  if (paymentData.name) {
    const { firstName, lastName } = splitName(paymentData.name);
    if (firstName && lastName) {
      const patient = await findPatientByName(firstName, lastName, clinicId);
      if (patient) {
        logger.debug('[PaymentMatching] Matched by name', {
          name: paymentData.name,
          patientId: patient.id,
        });
        return {
          patient,
          matchedBy: 'name',
          confidence: 'low',
        };
      }
    }
  }

  // No match found
  logger.debug('[PaymentMatching] No patient match found', {
    customerId: paymentData.customerId,
    email: paymentData.email,
    phone: paymentData.phone,
    name: paymentData.name,
  });

  return {
    patient: null,
    matchedBy: null,
    confidence: null,
  };
}

// ============================================================================
// Patient Creation
// ============================================================================

/**
 * Create a new patient from Stripe customer data
 * Uses a transaction to ensure atomicity of counter increment and patient creation
 *
 * PROFILE STATUS:
 * - PENDING_COMPLETION: Created from payment with incomplete info (placeholder email/name)
 * - ACTIVE: Has real email and name from Stripe
 */
export async function createPatientFromStripePayment(
  paymentData: StripePaymentData,
  clinicId: number
): Promise<Patient> {
  // Validate name - must be non-empty and not a placeholder
  const rawName = paymentData.name?.trim();
  const hasValidName = rawName &&
    rawName.length > 0 &&
    rawName.toLowerCase() !== 'unknown' &&
    rawName.toLowerCase() !== 'unknown customer' &&
    rawName.toLowerCase() !== 'customer';

  const { firstName, lastName } = hasValidName
    ? splitName(rawName!)
    : { firstName: 'Unknown', lastName: 'Customer' };

  // Log when we're creating with placeholder name for debugging
  if (!hasValidName) {
    logger.warn('[PaymentMatching] Creating patient with placeholder name - no valid name found', {
      customerId: paymentData.customerId,
      email: paymentData.email,
      phone: paymentData.phone,
      description: paymentData.description,
      rawName: paymentData.name,
      hasDescription: !!paymentData.description,
    });
  }

  // Determine if this is a placeholder/incomplete profile
  const hasRealEmail = paymentData.email && !paymentData.email.includes('@placeholder.local');
  const hasRealName = paymentData.name && !paymentData.name.toLowerCase().includes('unknown');
  const isIncompleteProfile = !hasRealEmail || !hasRealName;

  // Generate patient ID using the shared utility (handles clinic prefixes like EON-123, WEL-456)
  const patientId = await generatePatientId(clinicId);

  // Use address from Stripe if available
  const address = paymentData.address;

  // Create the patient record
  const patient = await prisma.patient.create({
    data: {
      patientId,
      clinicId,
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Customer',
      email: paymentData.email || `stripe-${paymentData.customerId || Date.now()}@placeholder.local`,
      phone: paymentData.phone || '',
      dob: '1900-01-01', // Placeholder - to be updated
      gender: 'unknown',
      address1: address?.line1 || '',
      address2: address?.line2 || null,
      city: address?.city || '',
      state: address?.state || '',
      zip: address?.postal_code || '',
      stripeCustomerId: paymentData.customerId,
      source: 'stripe',
      profileStatus: isIncompleteProfile ? 'PENDING_COMPLETION' : 'ACTIVE',
      sourceMetadata: {
        stripeCustomerId: paymentData.customerId,
        firstPaymentId: paymentData.paymentIntentId || paymentData.chargeId,
        createdFrom: 'payment_webhook',
        timestamp: new Date().toISOString(),
        originalData: {
          email: paymentData.email,
          name: paymentData.name,
          phone: paymentData.phone,
          address: paymentData.address,
        },
        requiresCompletion: isIncompleteProfile,
      },
      notes: isIncompleteProfile
        ? `⚠️ PENDING COMPLETION: Auto-created from Stripe payment (${paymentData.paymentIntentId || paymentData.chargeId}). Missing ${!hasRealEmail ? 'email' : ''}${!hasRealEmail && !hasRealName ? ', ' : ''}${!hasRealName ? 'name' : ''}. Please update patient details or merge with existing profile.`
        : `Auto-created from Stripe payment on ${new Date().toLocaleDateString()}.`,
    },
  });

  logger.info('[PaymentMatching] Created new patient from Stripe payment', {
    patientId: patient.id,
    stripeCustomerId: paymentData.customerId,
    email: paymentData.email,
    profileStatus: isIncompleteProfile ? 'PENDING_COMPLETION' : 'ACTIVE',
    isIncompleteProfile,
  });

  return patient;
}

// ============================================================================
// Invoice Creation
// ============================================================================

/**
 * Create a paid invoice from a Stripe payment
 * Uses a transaction to ensure invoice and payment records are created atomically
 */
export async function createPaidInvoiceFromStripe(
  patient: Patient,
  paymentData: StripePaymentData
): Promise<Invoice> {
  // Check if invoice already exists for this payment
  if (paymentData.stripeInvoiceId) {
    const existing = await prisma.invoice.findUnique({
      where: { stripeInvoiceId: paymentData.stripeInvoiceId },
    });
    if (existing) {
      logger.debug('[PaymentMatching] Invoice already exists for Stripe invoice', {
        stripeInvoiceId: paymentData.stripeInvoiceId,
        invoiceId: existing.id,
      });
      return existing;
    }
  }

  // Check if invoice already exists for this payment intent
  if (paymentData.paymentIntentId) {
    const existingPayment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentData.paymentIntentId },
      include: { invoice: true },
    });
    if (existingPayment?.invoice) {
      logger.debug('[PaymentMatching] Invoice already exists for payment intent', {
        paymentIntentId: paymentData.paymentIntentId,
        invoiceId: existingPayment.invoice.id,
      });
      return existingPayment.invoice;
    }
  }

  // Create line item description
  const description = paymentData.description || 'Payment received via Stripe';

  // Wrap invoice and payment creation in a transaction for atomicity
  const invoice = await prisma.$transaction(async (tx: typeof prisma) => {
    // Create the invoice as PAID
    const newInvoice = await tx.invoice.create({
      data: {
        patientId: patient.id,
        clinicId: patient.clinicId,
        stripeInvoiceId: paymentData.stripeInvoiceId,
        description,
        amount: paymentData.amount,
        amountDue: 0, // Already paid
        amountPaid: paymentData.amount,
        currency: paymentData.currency || 'usd',
        status: 'PAID' as InvoiceStatus,
        paidAt: paymentData.paidAt,
        lineItems: [{
          description,
          amount: paymentData.amount,
          quantity: 1,
        }],
        metadata: {
          source: 'stripe_webhook',
          paymentIntentId: paymentData.paymentIntentId,
          chargeId: paymentData.chargeId,
          stripeMetadata: paymentData.metadata,
        },
      },
    });

    // Create associated payment record
    await tx.payment.create({
      data: {
        patientId: patient.id,
        clinicId: patient.clinicId,
        invoiceId: newInvoice.id,
        stripePaymentIntentId: paymentData.paymentIntentId,
        stripeChargeId: paymentData.chargeId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'usd',
        status: 'SUCCEEDED',
        paidAt: paymentData.paidAt,
      },
    });

    return newInvoice;
  });

  logger.info('[PaymentMatching] Created paid invoice from Stripe payment', {
    invoiceId: invoice.id,
    patientId: patient.id,
    amount: paymentData.amount,
    paymentIntentId: paymentData.paymentIntentId,
  });

  return invoice;
}

// ============================================================================
// Data Extraction from Stripe Objects
// ============================================================================

/**
 * Extract payment data from a Stripe Charge object
 *
 * Data sources (in priority order):
 * 1. billing_details - Card holder info submitted at checkout
 * 2. receipt_email - Email to send receipt to
 * 3. metadata - Custom fields that might contain customer info
 * 4. description - Often contains customer name in format "Invoice XXX (Name)"
 */
export function extractPaymentDataFromCharge(charge: Stripe.Charge): StripePaymentData {
  const billing = charge.billing_details;
  // Access invoice field - exists on Charge at runtime but not in type definitions
  const chargeWithInvoice = charge as Stripe.Charge & { invoice?: string | Stripe.Invoice | null };
  const chargeInvoice = chargeWithInvoice.invoice;

  // Try to get email from multiple sources
  const email = billing?.email ||
                charge.receipt_email ||
                (charge.metadata?.email as string) ||
                (charge.metadata?.customer_email as string) ||
                null;

  // Try to get name from multiple sources
  let name = billing?.name ||
             (charge.metadata?.name as string) ||
             (charge.metadata?.customer_name as string) ||
             (charge.metadata?.full_name as string) ||
             null;

  // If still no name, try to extract from description
  if (!name && charge.description) {
    const nameMatch = charge.description.match(/\(([^)]+)\)\s*$/);
    if (nameMatch && nameMatch[1] && /[a-zA-Z]/.test(nameMatch[1])) {
      name = nameMatch[1].trim();
    }
  }

  // Try to get phone from multiple sources
  const phone = billing?.phone ||
                (charge.metadata?.phone as string) ||
                (charge.metadata?.phone_number as string) ||
                null;

  // Try to get address from billing details
  const address = billing?.address ? {
    line1: billing.address.line1,
    line2: billing.address.line2,
    city: billing.address.city,
    state: billing.address.state,
    postal_code: billing.address.postal_code,
    country: billing.address.country,
  } : null;

  logger.debug('[PaymentMatching] Extracted charge data', {
    chargeId: charge.id,
    hasEmail: !!email,
    hasName: !!name,
    hasPhone: !!phone,
    emailSource: billing?.email ? 'billing' : charge.receipt_email ? 'receipt' : charge.metadata?.email ? 'metadata' : 'none',
    nameSource: billing?.name ? 'billing' : charge.metadata?.name ? 'metadata' : charge.description ? 'description' : 'none',
  });

  return {
    customerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
    email,
    name,
    phone,
    amount: charge.amount,
    currency: charge.currency,
    description: charge.description || null,
    paymentIntentId: typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id || null,
    chargeId: charge.id,
    stripeInvoiceId: typeof chargeInvoice === 'string'
      ? chargeInvoice
      : (chargeInvoice && typeof chargeInvoice === 'object') ? chargeInvoice.id : null,
    metadata: charge.metadata || {},
    paidAt: new Date(charge.created * 1000),
    address,
  };
}

/**
 * Extract payment data from a Stripe PaymentIntent object
 *
 * Data sources (in priority order):
 * 1. latest_charge.billing_details - Card holder info
 * 2. receipt_email from charge - Email for receipt
 * 3. metadata - Custom fields
 * 4. description - Often contains customer name
 */
export function extractPaymentDataFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent
): StripePaymentData {
  // Get billing details from the first successful charge
  const charge = paymentIntent.latest_charge;
  const chargeObj = typeof charge === 'object' ? charge as Stripe.Charge : null;
  const billing = chargeObj?.billing_details;
  // Access invoice field from PaymentIntent - exists at runtime but not in type definitions
  const piWithInvoice = paymentIntent as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null };
  const piInvoice = piWithInvoice.invoice;

  // Try to get email from multiple sources
  const email = billing?.email ||
                chargeObj?.receipt_email ||
                (paymentIntent.metadata?.email as string) ||
                (paymentIntent.metadata?.customer_email as string) ||
                null;

  // Try to get name from multiple sources
  let name = billing?.name ||
             (paymentIntent.metadata?.name as string) ||
             (paymentIntent.metadata?.customer_name as string) ||
             (paymentIntent.metadata?.full_name as string) ||
             null;

  // If still no name, try to extract from description
  const description = paymentIntent.description || chargeObj?.description || null;
  if (!name && description) {
    const nameMatch = description.match(/\(([^)]+)\)\s*$/);
    if (nameMatch && nameMatch[1] && /[a-zA-Z]/.test(nameMatch[1])) {
      name = nameMatch[1].trim();
    }
  }

  // Try to get phone from multiple sources
  const phone = billing?.phone ||
                (paymentIntent.metadata?.phone as string) ||
                (paymentIntent.metadata?.phone_number as string) ||
                null;

  // Try to get address from billing details
  const address = billing?.address ? {
    line1: billing.address.line1,
    line2: billing.address.line2,
    city: billing.address.city,
    state: billing.address.state,
    postal_code: billing.address.postal_code,
    country: billing.address.country,
  } : null;

  logger.debug('[PaymentMatching] Extracted payment intent data', {
    paymentIntentId: paymentIntent.id,
    hasEmail: !!email,
    hasName: !!name,
    hasPhone: !!phone,
    emailSource: billing?.email ? 'billing' : chargeObj?.receipt_email ? 'receipt' : 'metadata',
    nameSource: billing?.name ? 'billing' : paymentIntent.metadata?.name ? 'metadata' : description ? 'description' : 'none',
  });

  return {
    customerId: typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : paymentIntent.customer?.id || null,
    email,
    name,
    phone,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    description,
    paymentIntentId: paymentIntent.id,
    chargeId: typeof charge === 'string' ? charge : chargeObj?.id || null,
    stripeInvoiceId: typeof piInvoice === 'string'
      ? piInvoice
      : (piInvoice && typeof piInvoice === 'object') ? piInvoice.id : null,
    metadata: paymentIntent.metadata || {},
    paidAt: new Date(paymentIntent.created * 1000),
    address,
  };
}

/**
 * Extract payment data from a Stripe Invoice object
 *
 * Data sources:
 * 1. customer_name, customer_email - Customer info on invoice
 * 2. description - Often contains "(Customer Name)" pattern
 * 3. metadata - Custom fields on the invoice
 * 4. lines.data - Line items may have customer info
 */
export function extractPaymentDataFromInvoice(
  invoice: Stripe.Invoice
): StripePaymentData {
  // Try to get email from multiple sources
  const email = invoice.customer_email ||
                (invoice.metadata?.email as string) ||
                (invoice.metadata?.customer_email as string) ||
                null;

  // Try to get name from multiple sources
  let name = invoice.customer_name ||
             (invoice.metadata?.name as string) ||
             (invoice.metadata?.customer_name as string) ||
             (invoice.metadata?.full_name as string) ||
             null;

  // Try to extract from description (e.g., "Invoice 1832 (Jaylan Martin)")
  const description = invoice.description || null;
  if (!name && description) {
    const nameMatch = description.match(/\(([^)]+)\)\s*$/);
    if (nameMatch && nameMatch[1] && /[a-zA-Z]/.test(nameMatch[1])) {
      name = nameMatch[1].trim();
    }
  }

  // Try to get phone from metadata
  const phone = (invoice.metadata?.phone as string) ||
                (invoice.metadata?.phone_number as string) ||
                null;

  // Get address from customer shipping or billing (if expanded)
  let address: StripePaymentData['address'] | null = null;
  if (invoice.customer_shipping?.address) {
    const addr = invoice.customer_shipping.address;
    address = {
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
    };
  }

  logger.debug('[PaymentMatching] Extracted invoice data', {
    invoiceId: invoice.id,
    hasEmail: !!email,
    hasName: !!name,
    hasPhone: !!phone,
    emailSource: invoice.customer_email ? 'customer_email' : invoice.metadata?.email ? 'metadata' : 'none',
    nameSource: invoice.customer_name ? 'customer_name' : invoice.metadata?.name ? 'metadata' : description ? 'description' : 'none',
  });

  // Type assertion for invoice properties that exist at runtime but may not be in type definitions
  const invoiceWithPayment = invoice as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
    charge?: string | Stripe.Charge | null;
  };

  return {
    customerId: typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id || null,
    email,
    name,
    phone,
    amount: invoice.amount_paid || invoice.amount_due || 0,
    currency: invoice.currency || 'usd',
    description,
    paymentIntentId: typeof invoiceWithPayment.payment_intent === 'string'
      ? invoiceWithPayment.payment_intent
      : invoiceWithPayment.payment_intent?.id || null,
    chargeId: typeof invoiceWithPayment.charge === 'string'
      ? invoiceWithPayment.charge
      : (invoiceWithPayment.charge as Stripe.Charge | null)?.id || null,
    stripeInvoiceId: invoice.id,
    metadata: invoice.metadata || {},
    paidAt: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date(invoice.created * 1000),
    address,
  };
}

/**
 * Extract payment data from a Stripe Checkout Session object
 *
 * Data sources:
 * 1. customer_details - Customer info from checkout form
 * 2. metadata - Custom fields passed to checkout
 * 3. customer_email - Email provided at session creation
 */
export function extractPaymentDataFromCheckoutSession(
  session: Stripe.Checkout.Session
): StripePaymentData {
  const customerDetails = session.customer_details;

  // Try to get email from multiple sources
  const email = customerDetails?.email ||
                session.customer_email ||
                (session.metadata?.email as string) ||
                (session.metadata?.customer_email as string) ||
                null;

  // Try to get name from multiple sources
  let name = customerDetails?.name ||
             (session.metadata?.name as string) ||
             (session.metadata?.customer_name as string) ||
             (session.metadata?.full_name as string) ||
             null;

  // Try to extract name from description if present
  const description = session.metadata?.description || 'Checkout payment';
  if (!name && description) {
    const nameMatch = description.match(/\(([^)]+)\)\s*$/);
    if (nameMatch && nameMatch[1] && /[a-zA-Z]/.test(nameMatch[1])) {
      name = nameMatch[1].trim();
    }
  }

  // Try to get phone from multiple sources
  const phone = customerDetails?.phone ||
                (session.metadata?.phone as string) ||
                (session.metadata?.phone_number as string) ||
                null;

  // Get address from customer_details
  const address = customerDetails?.address ? {
    line1: customerDetails.address.line1,
    line2: customerDetails.address.line2,
    city: customerDetails.address.city,
    state: customerDetails.address.state,
    postal_code: customerDetails.address.postal_code,
    country: customerDetails.address.country,
  } : null;

  logger.debug('[PaymentMatching] Extracted checkout session data', {
    sessionId: session.id,
    hasEmail: !!email,
    hasName: !!name,
    hasPhone: !!phone,
    emailSource: customerDetails?.email ? 'customer_details' : session.customer_email ? 'session' : 'metadata',
    nameSource: customerDetails?.name ? 'customer_details' : session.metadata?.name ? 'metadata' : 'none',
  });

  return {
    customerId: typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id || null,
    email,
    name,
    phone,
    amount: session.amount_total || 0,
    currency: session.currency || 'usd',
    description,
    paymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null,
    chargeId: null, // Not directly available from session
    stripeInvoiceId: typeof session.invoice === 'string'
      ? session.invoice
      : session.invoice?.id || null,
    metadata: session.metadata || {},
    paidAt: new Date(session.created * 1000),
    address,
  };
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a Stripe payment and create/match patient + invoice
 */
export async function processStripePayment(
  paymentData: StripePaymentData,
  stripeEventId?: string,
  stripeEventType?: string
): Promise<PaymentProcessingResult> {
  try {
    // Check if already processed (prevent duplicates)
    if (stripeEventId) {
      const existing = await prisma.paymentReconciliation.findUnique({
        where: { stripeEventId },
      });
      if (existing) {
        logger.debug('[PaymentMatching] Event already processed', { stripeEventId });
        return {
          success: true,
          patient: existing.patientId ? await prisma.patient.findUnique({ where: { id: existing.patientId } }) : null,
          invoice: existing.invoiceId ? await prisma.invoice.findUnique({ where: { id: existing.invoiceId } }) : null,
          matchResult: {
            patient: null,
            matchedBy: existing.matchedBy as PatientMatchResult['matchedBy'],
            confidence: existing.matchConfidence as PatientMatchResult['confidence']
          },
          patientCreated: existing.patientCreated,
        };
      }
    }

    // CRITICAL: Enhance payment data with full Stripe Customer info if billing_details is incomplete
    // This ensures we have the best possible customer data before matching or creating patients
    const enhancedPaymentData = await enhancePaymentDataWithCustomerInfo(paymentData);

    // Determine clinic ID from metadata or default
    let clinicId: number | undefined;
    if (enhancedPaymentData.metadata.clinicId) {
      clinicId = parseInt(enhancedPaymentData.metadata.clinicId, 10);
    }

    // Try to match existing patient using enhanced data
    const matchResult = await matchPatientFromPayment(enhancedPaymentData, clinicId);

    let patient = matchResult.patient;
    let patientCreated = false;

    // If no match, create new patient
    if (!patient) {
      // Determine clinic for new patient
      const targetClinicId = clinicId || parseInt(process.env.DEFAULT_CLINIC_ID || '0', 10);

      if (!targetClinicId) {
        // Log failed reconciliation
        await createReconciliationRecord(enhancedPaymentData, stripeEventId, stripeEventType, {
          status: 'FAILED',
          errorMessage: 'No clinic ID available for patient creation',
        });

        logger.error('[PaymentMatching] Cannot create patient: no clinic ID available', {
          paymentIntentId: enhancedPaymentData.paymentIntentId,
        });
        return {
          success: false,
          patient: null,
          invoice: null,
          matchResult,
          patientCreated: false,
          error: 'No clinic ID available for patient creation',
        };
      }

      patient = await createPatientFromStripePayment(enhancedPaymentData, targetClinicId);
      patientCreated = true;
    } else {
      // Update stripeCustomerId if not set and we have one
      if (!patient.stripeCustomerId && enhancedPaymentData.customerId) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { stripeCustomerId: enhancedPaymentData.customerId },
        });
        logger.debug('[PaymentMatching] Linked stripeCustomerId to existing patient', {
          patientId: patient.id,
          stripeCustomerId: enhancedPaymentData.customerId,
        });
      }
    }

    // Create paid invoice
    const invoice = await createPaidInvoiceFromStripe(patient, enhancedPaymentData);

    // Log successful reconciliation
    await createReconciliationRecord(enhancedPaymentData, stripeEventId, stripeEventType, {
      status: patientCreated ? 'CREATED' : 'MATCHED',
      matchedBy: matchResult.matchedBy,
      matchConfidence: matchResult.confidence,
      patientId: patient.id,
      invoiceId: invoice.id,
      patientCreated,
      clinicId: patient.clinicId,
    });

    return {
      success: true,
      patient,
      invoice,
      matchResult,
      patientCreated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed reconciliation (use original paymentData since enhancedPaymentData may not exist if error occurred during enhancement)
    await createReconciliationRecord(paymentData, stripeEventId, stripeEventType, {
      status: 'FAILED',
      errorMessage,
    });

    logger.error('[PaymentMatching] Error processing payment', {
      error: errorMessage,
      paymentIntentId: paymentData.paymentIntentId,
      chargeId: paymentData.chargeId,
    });

    return {
      success: false,
      patient: null,
      invoice: null,
      matchResult: { patient: null, matchedBy: null, confidence: null },
      patientCreated: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Reconciliation Record Creation
// ============================================================================

interface ReconciliationData {
  status: 'PENDING' | 'MATCHED' | 'CREATED' | 'FAILED' | 'SKIPPED';
  matchedBy?: string | null;
  matchConfidence?: string | null;
  patientId?: number;
  invoiceId?: number;
  patientCreated?: boolean;
  clinicId?: number;
  errorMessage?: string;
}

async function createReconciliationRecord(
  paymentData: StripePaymentData,
  stripeEventId: string | undefined,
  stripeEventType: string | undefined,
  data: ReconciliationData
): Promise<void> {
  try {
    await prisma.paymentReconciliation.create({
      data: {
        stripeEventId: stripeEventId || `manual_${Date.now()}`,
        stripeEventType: stripeEventType || 'manual_processing',
        stripePaymentIntentId: paymentData.paymentIntentId,
        stripeChargeId: paymentData.chargeId,
        stripeInvoiceId: paymentData.stripeInvoiceId,
        stripeCustomerId: paymentData.customerId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        description: paymentData.description,
        customerEmail: paymentData.email,
        customerName: paymentData.name,
        customerPhone: paymentData.phone,
        status: data.status,
        matchedBy: data.matchedBy,
        matchConfidence: data.matchConfidence,
        patientId: data.patientId,
        invoiceId: data.invoiceId,
        patientCreated: data.patientCreated || false,
        clinicId: data.clinicId,
        processedAt: new Date(),
        errorMessage: data.errorMessage,
        metadata: paymentData.metadata,
      },
    });
  } catch (error) {
    // Don't fail the main process if reconciliation logging fails
    logger.error('[PaymentMatching] Failed to create reconciliation record', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentIntentId: paymentData.paymentIntentId,
    });
  }
}

// ============================================================================
// Refund Handling
// ============================================================================

export interface RefundData {
  chargeId: string;
  paymentIntentId?: string | null;
  refundId: string;
  amount: number;
  reason?: string | null;
  status: string;
  refundedAt: Date;
}

/**
 * Handle a refund event and update associated invoice/payment status
 */
export async function handleStripeRefund(
  refundData: RefundData,
  stripeEventId?: string
): Promise<{ success: boolean; invoiceId?: number; error?: string }> {
  try {
    // Find payment by charge ID or payment intent ID
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { stripeChargeId: refundData.chargeId },
          ...(refundData.paymentIntentId
            ? [{ stripePaymentIntentId: refundData.paymentIntentId }]
            : []),
        ],
      },
      include: { invoice: true },
    });

    if (!payment) {
      logger.warn('[PaymentMatching] No payment found for refund', {
        chargeId: refundData.chargeId,
        paymentIntentId: refundData.paymentIntentId,
      });
      return { success: false, error: 'No payment found for refund' };
    }

    // Determine if this is a full or partial refund
    const isFullRefund = refundData.amount >= payment.amount;
    const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        metadata: {
          ...(payment.metadata as Record<string, unknown> || {}),
          refund: {
            refundId: refundData.refundId,
            amount: refundData.amount,
            reason: refundData.reason,
            refundedAt: refundData.refundedAt.toISOString(),
            stripeEventId,
          },
        },
      },
    });

    // Update invoice status if exists
    if (payment.invoice) {
      const invoiceNewStatus = isFullRefund ? 'VOID' : 'PAID'; // Partial refunds keep invoice as PAID
      const newAmountPaid = payment.invoice.amountPaid - refundData.amount;

      await prisma.invoice.update({
        where: { id: payment.invoice.id },
        data: {
          status: invoiceNewStatus as InvoiceStatus,
          amountPaid: Math.max(0, newAmountPaid),
          amountDue: isFullRefund ? payment.invoice.amount || 0 : 0,
          metadata: {
            ...(payment.invoice.metadata as Record<string, unknown> || {}),
            refund: {
              refundId: refundData.refundId,
              amount: refundData.amount,
              reason: refundData.reason,
              refundedAt: refundData.refundedAt.toISOString(),
              isFullRefund,
              stripeEventId,
            },
          },
        },
      });

      logger.info('[PaymentMatching] Updated invoice status after refund', {
        invoiceId: payment.invoice.id,
        paymentId: payment.id,
        refundAmount: refundData.amount,
        isFullRefund,
        newStatus: invoiceNewStatus,
      });

      return { success: true, invoiceId: payment.invoice.id };
    }

    logger.info('[PaymentMatching] Updated payment status after refund (no invoice)', {
      paymentId: payment.id,
      refundAmount: refundData.amount,
      isFullRefund,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PaymentMatching] Error handling refund', {
      error: errorMessage,
      chargeId: refundData.chargeId,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Extract refund data from a Stripe Charge object (after refund)
 */
export function extractRefundDataFromCharge(charge: Stripe.Charge): RefundData | null {
  if (!charge.refunded && !charge.amount_refunded) {
    return null;
  }

  const latestRefund = charge.refunds?.data?.[0];

  return {
    chargeId: charge.id,
    paymentIntentId: typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id || null,
    refundId: latestRefund?.id || `refund_${charge.id}`,
    amount: charge.amount_refunded,
    reason: latestRefund?.reason || null,
    status: charge.refunded ? 'refunded' : 'partially_refunded',
    refundedAt: latestRefund?.created
      ? new Date(latestRefund.created * 1000)
      : new Date(),
  };
}

// ============================================================================
// Invoice Sync from Stripe
// ============================================================================

export interface InvoiceSyncResult {
  success: boolean;
  updated: boolean;
  changes?: {
    statusChanged?: boolean;
    amountChanged?: boolean;
    customerUpdated?: boolean;
  };
  error?: string;
}

/**
 * Sync an invoice's status and data from Stripe
 * Fetches the latest data from Stripe and updates our local record
 */
export async function syncInvoiceFromStripe(
  invoiceId: number
): Promise<InvoiceSyncResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { success: false, updated: false, error: 'Stripe not configured' };
  }

  try {
    // Get our invoice with payment info
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: true,
        patient: true,
      },
    });

    if (!invoice) {
      return { success: false, updated: false, error: 'Invoice not found' };
    }

    const changes: InvoiceSyncResult['changes'] = {};
    const updates: {
      status?: InvoiceStatus;
      amountPaid?: number;
      amountDue?: number;
      metadata?: Record<string, unknown>;
    } = {};

    // Get charge/payment intent from our payment record
    const payment = invoice.payments[0];
    if (!payment?.stripeChargeId && !payment?.stripePaymentIntentId) {
      return { success: false, updated: false, error: 'No Stripe payment reference found' };
    }

    // Fetch charge from Stripe to get latest status
    let stripeCharge: Stripe.Charge | null = null;

    if (payment.stripeChargeId) {
      try {
        stripeCharge = await stripe.charges.retrieve(payment.stripeChargeId, {
          expand: ['refunds'],
        });
      } catch {
        // Charge might not exist, try payment intent
      }
    }

    if (!stripeCharge && payment.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {
        expand: ['latest_charge.refunds'],
      });
      if (pi.latest_charge && typeof pi.latest_charge === 'object') {
        stripeCharge = pi.latest_charge as Stripe.Charge;
      }
    }

    if (!stripeCharge) {
      return { success: false, updated: false, error: 'Could not fetch Stripe charge' };
    }

    // Check for refunds
    if (stripeCharge.refunded || stripeCharge.amount_refunded > 0) {
      const isFullRefund = stripeCharge.refunded;
      const newStatus = isFullRefund ? 'VOID' : 'PAID';

      if (invoice.status !== newStatus) {
        updates.status = newStatus as InvoiceStatus;
        updates.amountPaid = stripeCharge.amount - stripeCharge.amount_refunded;
        updates.amountDue = isFullRefund ? (invoice.amount || 0) : 0;
        changes.statusChanged = true;
        changes.amountChanged = true;
      }

      // Also update payment status
      const paymentNewStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      if (payment.status !== paymentNewStatus) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: paymentNewStatus },
        });
      }
    }

    // Try to update patient info if it's incomplete
    if (invoice.patient?.firstName === 'Unknown' || invoice.patient?.lastName === 'Customer') {
      // Extract customer name from charge billing details or invoice description
      let customerName = stripeCharge.billing_details?.name;
      let customerEmail = stripeCharge.billing_details?.email;
      let customerPhone = stripeCharge.billing_details?.phone;

      // Try to get from customer object
      if ((!customerName || !customerEmail) && stripeCharge.customer) {
        const customerId = typeof stripeCharge.customer === 'string'
          ? stripeCharge.customer
          : stripeCharge.customer.id;
        const customerData = await fetchStripeCustomerData(customerId);
        customerName = customerName || customerData.name;
        customerEmail = customerEmail || customerData.email;
        customerPhone = customerPhone || customerData.phone;
      }

      // Try to extract from description (format: "Invoice XXXX (Name)")
      if (!customerName && stripeCharge.description) {
        const nameMatch = stripeCharge.description.match(/\(([^)]+)\)$/);
        if (nameMatch) {
          customerName = nameMatch[1];
        }
      }

      // Update patient if we found better data
      if (customerName || customerEmail) {
        const patientUpdates: Record<string, string> = {};

        if (customerName && (invoice.patient?.firstName === 'Unknown' || invoice.patient?.lastName === 'Customer')) {
          const { firstName, lastName } = splitName(customerName);
          if (firstName) patientUpdates.firstName = firstName;
          if (lastName) patientUpdates.lastName = lastName;
        }

        if (customerEmail && invoice.patient?.email?.includes('@placeholder.local')) {
          patientUpdates.email = customerEmail;
        }

        if (customerPhone && !invoice.patient?.phone) {
          patientUpdates.phone = customerPhone;
        }

        if (Object.keys(patientUpdates).length > 0) {
          await prisma.patient.update({
            where: { id: invoice.patient.id },
            data: {
              ...patientUpdates,
              profileStatus: 'ACTIVE', // Mark as complete since we have real data now
              notes: invoice.patient.notes?.replace('⚠️ PENDING COMPLETION:', '✅ SYNCED FROM STRIPE:'),
            },
          });
          changes.customerUpdated = true;
        }
      }
    }

    // Apply invoice updates if any
    if (Object.keys(updates).length > 0) {
      updates.metadata = {
        ...(invoice.metadata as Record<string, unknown> || {}),
        lastSyncedFromStripe: new Date().toISOString(),
        syncedChargeId: stripeCharge.id,
      };

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: updates,
      });
    }

    const hasChanges = Object.keys(changes).length > 0;

    logger.info('[PaymentMatching] Invoice synced from Stripe', {
      invoiceId,
      hasChanges,
      changes,
    });

    return {
      success: true,
      updated: hasChanges,
      changes: hasChanges ? changes : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PaymentMatching] Error syncing invoice from Stripe', {
      error: errorMessage,
      invoiceId,
    });
    return { success: false, updated: false, error: errorMessage };
  }
}
