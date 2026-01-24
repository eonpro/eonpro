/**
 * Payment Matching Service
 * ========================
 * 
 * Matches incoming Stripe payments to patients and creates internal invoices.
 * Handles patient creation when no match is found.
 * 
 * Matching priority:
 * 1. stripeCustomerId (exact match - already linked)
 * 2. Email (case-insensitive)
 * 3. Phone (normalized)
 * 4. Full name match (firstName + lastName)
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type Stripe from 'stripe';
import type { Patient, Invoice, InvoiceStatus } from '@prisma/client';

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
 */
export async function findPatientByStripeCustomerId(
  customerId: string
): Promise<Patient | null> {
  return prisma.patient.findUnique({
    where: { stripeCustomerId: customerId },
  });
}

/**
 * Find a patient by email (case-insensitive)
 */
export async function findPatientByEmail(
  email: string,
  clinicId?: number
): Promise<Patient | null> {
  const normalizedEmail = email.toLowerCase().trim();
  
  const where: any = {
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
  
  const where: any = {
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
  const where: any = {
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
  if (paymentData.customerId) {
    const patient = await findPatientByStripeCustomerId(paymentData.customerId);
    if (patient) {
      logger.debug('[PaymentMatching] Matched by stripeCustomerId', {
        customerId: paymentData.customerId,
        patientId: patient.id,
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
 */
export async function createPatientFromStripePayment(
  paymentData: StripePaymentData,
  clinicId: number
): Promise<Patient> {
  const { firstName, lastName } = paymentData.name 
    ? splitName(paymentData.name)
    : { firstName: 'Unknown', lastName: 'Customer' };
  
  // Generate next patient ID
  const counter = await prisma.patientCounter.upsert({
    where: { id: 1 },
    create: { id: 1, current: 1 },
    update: { current: { increment: 1 } },
  });
  const patientId = counter.current.toString().padStart(6, '0');
  
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
      address1: '',
      city: '',
      state: '',
      zip: '',
      stripeCustomerId: paymentData.customerId,
      source: 'stripe',
      sourceMetadata: {
        stripeCustomerId: paymentData.customerId,
        firstPaymentId: paymentData.paymentIntentId || paymentData.chargeId,
        createdFrom: 'payment_webhook',
        timestamp: new Date().toISOString(),
      },
      notes: `Auto-created from Stripe payment. Please update patient details.`,
    },
  });
  
  logger.info('[PaymentMatching] Created new patient from Stripe payment', {
    patientId: patient.id,
    stripeCustomerId: paymentData.customerId,
    email: paymentData.email,
  });
  
  return patient;
}

// ============================================================================
// Invoice Creation
// ============================================================================

/**
 * Create a paid invoice from a Stripe payment
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
  
  // Create the invoice as PAID
  const invoice = await prisma.invoice.create({
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
  await prisma.payment.create({
    data: {
      patientId: patient.id,
      clinicId: patient.clinicId,
      invoiceId: invoice.id,
      stripePaymentIntentId: paymentData.paymentIntentId,
      stripeChargeId: paymentData.chargeId,
      amount: paymentData.amount,
      currency: paymentData.currency || 'usd',
      status: 'SUCCEEDED',
      paidAt: paymentData.paidAt,
    },
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
 */
export function extractPaymentDataFromCharge(charge: Stripe.Charge): StripePaymentData {
  const billing = charge.billing_details;
  // Access invoice field - exists on Charge but not in all TS definitions
  const chargeInvoice = (charge as any).invoice;

  return {
    customerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
    email: billing?.email || null,
    name: billing?.name || null,
    phone: billing?.phone || null,
    amount: charge.amount,
    currency: charge.currency,
    description: charge.description || null,
    paymentIntentId: typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id || null,
    chargeId: charge.id,
    stripeInvoiceId: typeof chargeInvoice === 'string'
      ? chargeInvoice
      : chargeInvoice?.id || null,
    metadata: charge.metadata || {},
    paidAt: new Date(charge.created * 1000),
  };
}

/**
 * Extract payment data from a Stripe PaymentIntent object
 */
export function extractPaymentDataFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent
): StripePaymentData {
  // Get billing details from the first successful charge
  const charge = paymentIntent.latest_charge;
  const chargeObj = typeof charge === 'object' ? charge as Stripe.Charge : null;
  const billing = chargeObj?.billing_details;
  // Access invoice field - exists on PaymentIntent but not in all TS definitions
  const piInvoice = (paymentIntent as any).invoice;

  return {
    customerId: typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : paymentIntent.customer?.id || null,
    email: billing?.email || null,
    name: billing?.name || null,
    phone: billing?.phone || null,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    description: paymentIntent.description || null,
    paymentIntentId: paymentIntent.id,
    chargeId: typeof charge === 'string' ? charge : chargeObj?.id || null,
    stripeInvoiceId: typeof piInvoice === 'string'
      ? piInvoice
      : null,
    metadata: paymentIntent.metadata || {},
    paidAt: new Date(paymentIntent.created * 1000),
  };
}

/**
 * Extract payment data from a Stripe Checkout Session object
 */
export function extractPaymentDataFromCheckoutSession(
  session: Stripe.Checkout.Session
): StripePaymentData {
  const customerDetails = session.customer_details;
  
  return {
    customerId: typeof session.customer === 'string' 
      ? session.customer 
      : session.customer?.id || null,
    email: customerDetails?.email || null,
    name: customerDetails?.name || null,
    phone: customerDetails?.phone || null,
    amount: session.amount_total || 0,
    currency: session.currency || 'usd',
    description: session.metadata?.description || 'Checkout payment',
    paymentIntentId: typeof session.payment_intent === 'string' 
      ? session.payment_intent 
      : session.payment_intent?.id || null,
    chargeId: null, // Not directly available from session
    stripeInvoiceId: typeof session.invoice === 'string' 
      ? session.invoice 
      : session.invoice?.id || null,
    metadata: session.metadata || {},
    paidAt: new Date(session.created * 1000),
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
            matchedBy: existing.matchedBy as any, 
            confidence: existing.matchConfidence as any 
          },
          patientCreated: existing.patientCreated,
        };
      }
    }
    
    // Determine clinic ID from metadata or default
    let clinicId: number | undefined;
    if (paymentData.metadata.clinicId) {
      clinicId = parseInt(paymentData.metadata.clinicId, 10);
    }
    
    // Try to match existing patient
    const matchResult = await matchPatientFromPayment(paymentData, clinicId);
    
    let patient = matchResult.patient;
    let patientCreated = false;
    
    // If no match, create new patient
    if (!patient) {
      // Determine clinic for new patient
      const targetClinicId = clinicId || parseInt(process.env.DEFAULT_CLINIC_ID || '0', 10);
      
      if (!targetClinicId) {
        // Log failed reconciliation
        await createReconciliationRecord(paymentData, stripeEventId, stripeEventType, {
          status: 'FAILED',
          errorMessage: 'No clinic ID available for patient creation',
        });
        
        logger.error('[PaymentMatching] Cannot create patient: no clinic ID available', {
          paymentIntentId: paymentData.paymentIntentId,
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
      
      patient = await createPatientFromStripePayment(paymentData, targetClinicId);
      patientCreated = true;
    } else {
      // Update stripeCustomerId if not set and we have one
      if (!patient.stripeCustomerId && paymentData.customerId) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { stripeCustomerId: paymentData.customerId },
        });
        logger.debug('[PaymentMatching] Linked stripeCustomerId to existing patient', {
          patientId: patient.id,
          stripeCustomerId: paymentData.customerId,
        });
      }
    }
    
    // Create paid invoice
    const invoice = await createPaidInvoiceFromStripe(patient, paymentData);
    
    // Log successful reconciliation
    await createReconciliationRecord(paymentData, stripeEventId, stripeEventType, {
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
    
    // Log failed reconciliation
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
