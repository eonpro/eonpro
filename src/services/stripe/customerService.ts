import { stripe, getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import type { Patient } from '@prisma/client';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';

/**
 * Service for managing Stripe customers
 */
export class StripeCustomerService {
  /**
   * Get or create a Stripe customer for a patient
   */
  static async getOrCreateCustomer(patientId: number): Promise<Stripe.Customer> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }
    const stripeClient = getStripe();
    
    // Get patient from database
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    
    if (!patient) {
      throw new Error(`Patient with ID ${patientId} not found`);
    }
    
    // If patient already has a Stripe customer ID, retrieve it
    if (patient.stripeCustomerId) {
      try {
        const customer = await stripeClient.customers.retrieve(patient.stripeCustomerId);
        
        // Check if customer is deleted
        if ((customer as Stripe.DeletedCustomer).deleted) {
          // Customer was deleted, create a new one
          return await this.createNewCustomer(patient);
        }
        
        return customer as Stripe.Customer;
      } catch (error: unknown) {
        logger.error(`Error retrieving Stripe customer ${patient.stripeCustomerId}:`, error instanceof Error ? error : new Error(String(error)));
        // Customer doesn't exist, create a new one
        return await this.createNewCustomer(patient);
      }
    }
    
    // Create new Stripe customer
    return await this.createNewCustomer(patient);
  }
  
  /**
   * Create a new Stripe customer for a patient
   */
  private static async createNewCustomer(patient: Patient): Promise<Stripe.Customer> {
    const stripeClient = getStripe();
    
    // Decrypt ALL PHI fields before sending to Stripe
    // This includes name, email, phone, and address fields
    let decryptedPatient = patient as Record<string, unknown>;
    try {
      decryptedPatient = decryptPatientPHI(patient as Record<string, unknown>, DEFAULT_PHI_FIELDS as unknown as string[]);
    } catch (e) {
      logger.debug('Patient data not encrypted, using raw values');
    }
    
    // Create customer in Stripe with decrypted values
    const customer = await stripeClient.customers.create({
      email: decryptedPatient.email as string,
      name: `${decryptedPatient.firstName || ''} ${decryptedPatient.lastName || ''}`.trim(),
      phone: decryptedPatient.phone as string,
      address: {
        line1: decryptedPatient.address1 as string,
        line2: (decryptedPatient.address2 as string) || undefined,
        city: decryptedPatient.city as string,
        state: decryptedPatient.state as string,
        postal_code: decryptedPatient.zip as string,
        country: 'US',
      },
      metadata: {
        patientId: patient.id.toString(),
        patientNumber: patient.patientId || '',
        source: 'eonmeds_platform',
      } as any,
    });
    
    // Update patient with Stripe customer ID
    await prisma.patient.update({
      where: { id: patient.id },
      data: { stripeCustomerId: customer.id },
    });
    
    logger.debug(`[STRIPE] Created new customer ${customer.id} for patient ${patient.id}`);
    
    return customer;
  }
  
  /**
   * Update Stripe customer information
   */
  static async updateCustomer(patientId: number): Promise<Stripe.Customer> {
    const stripeClient = getStripe();
    
    // Get patient from database
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    
    if (!patient) {
      throw new Error(`Patient with ID ${patientId} not found`);
    }
    
    if (!patient.stripeCustomerId) {
      // No existing customer, create one
      return await this.createNewCustomer(patient);
    }
    
    // Decrypt ALL PHI fields before sending to Stripe
    let decryptedPatient = patient as Record<string, unknown>;
    try {
      decryptedPatient = decryptPatientPHI(patient as Record<string, unknown>, DEFAULT_PHI_FIELDS as unknown as string[]);
    } catch (e) {
      logger.debug('Patient data not encrypted, using raw values');
    }
    
    // Update existing customer with decrypted values
    const customer = await stripeClient.customers.update(patient.stripeCustomerId, {
      email: decryptedPatient.email as string,
      name: `${decryptedPatient.firstName || ''} ${decryptedPatient.lastName || ''}`.trim(),
      phone: decryptedPatient.phone as string,
      address: {
        line1: decryptedPatient.address1 as string,
        line2: (decryptedPatient.address2 as string) || undefined,
        city: decryptedPatient.city as string,
        state: decryptedPatient.state as string,
        postal_code: decryptedPatient.zip as string,
        country: 'US',
      },
      metadata: {
        patientId: patient.id.toString(),
        patientNumber: patient.patientId || '',
        source: 'eonmeds_platform',
      } as any,
    });
    
    logger.debug(`[STRIPE] Updated customer ${customer.id} for patient ${patient.id}`);
    
    return customer;
  }
  
  /**
   * Get customer portal URL for a patient
   */
  static async getCustomerPortalUrl(
    patientId: number,
    returnUrl: string
  ): Promise<string> {
    const stripeClient = getStripe();
    
    // Get or create customer
    const customer = await this.getOrCreateCustomer(patientId);
    
    // Create billing portal session
    const session = await stripeClient.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl,
    });
    
    return session.url;
  }
  
  /**
   * Sync all patients to Stripe (for initial setup)
   */
  static async syncAllPatients(): Promise<void> {
    const patients = await prisma.patient.findMany({
      where: { stripeCustomerId: null },
    });
    
    logger.debug(`[STRIPE] Syncing ${patients.length} patients to Stripe...`);
    
    for (const patient of patients) {
      try {
        await this.createNewCustomer(patient);
      } catch (error: unknown) {
        logger.error(`[STRIPE] Failed to sync patient ${patient.id}:`, error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    logger.debug('[STRIPE] Patient sync complete');
  }
}
