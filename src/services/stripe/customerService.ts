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
   * Get or create a Stripe customer for a patient on the default (EonMeds) Stripe account.
   * For dedicated/connected accounts, use getOrCreateCustomerForContext() instead.
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
        logger.error(
          `Error retrieving Stripe customer ${patient.stripeCustomerId}:`,
          error instanceof Error ? error : new Error(String(error))
        );
        // Customer doesn't exist, create a new one
        return await this.createNewCustomer(patient);
      }
    }

    // Create new Stripe customer
    return await this.createNewCustomer(patient);
  }

  /**
   * Get or create a Stripe customer for a patient on a specific Stripe account.
   * Used for dedicated accounts (OT) and connected accounts (WellMedR) where the
   * customer namespace is separate from the default EonMeds account.
   *
   * patient.stripeCustomerId is NOT overwritten since it belongs to the default account.
   * Instead, the customer is looked up by email on the target account.
   */
  static async getOrCreateCustomerForContext(
    patientId: number,
    stripeClient: Stripe,
    connectOpts?: { stripeAccount: string }
  ): Promise<Stripe.Customer> {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new Error(`Patient with ID ${patientId} not found`);
    }

    // Try to retrieve existing customer if the stored ID happens to work on this account
    if (patient.stripeCustomerId) {
      try {
        const customer = connectOpts
          ? await stripeClient.customers.retrieve(patient.stripeCustomerId, {}, connectOpts)
          : await stripeClient.customers.retrieve(patient.stripeCustomerId);

        if (!(customer as Stripe.DeletedCustomer).deleted) {
          return customer as Stripe.Customer;
        }
      } catch {
        // Customer doesn't exist on this Stripe account — expected for cross-account
      }
    }

    // Search by email on the target Stripe account
    let decryptedPatient = patient as Record<string, unknown>;
    try {
      decryptedPatient = decryptPatientPHI(
        patient as Record<string, unknown>,
        DEFAULT_PHI_FIELDS as unknown as string[]
      );
    } catch {
      logger.debug('Patient data not encrypted, using raw values');
    }

    const email = decryptedPatient.email as string;
    if (email) {
      try {
        const searchParams = { query: `email:"${email}"`, limit: 1 };
        const existing = connectOpts
          ? await stripeClient.customers.search(searchParams, connectOpts)
          : await stripeClient.customers.search(searchParams);

        if (existing.data.length > 0) {
          logger.info('[STRIPE] Found existing customer by email on target account', {
            patientId: patient.id,
            customerId: existing.data[0].id,
          });
          return existing.data[0];
        }
      } catch (searchErr) {
        logger.warn('[STRIPE] Customer search failed, will create new', {
          patientId: patient.id,
          error: searchErr instanceof Error ? searchErr.message : String(searchErr),
        });
      }
    }

    // Create a new customer on the target Stripe account (don't overwrite patient.stripeCustomerId)
    return await this.createNewCustomerOnAccount(patient, stripeClient, connectOpts);
  }

  /**
   * Create a new Stripe customer for a patient on the default account
   */
  private static async createNewCustomer(patient: Patient): Promise<Stripe.Customer> {
    const stripeClient = getStripe();

    // Decrypt ALL PHI fields before sending to Stripe
    // This includes name, email, phone, and address fields
    let decryptedPatient = patient as Record<string, unknown>;
    try {
      decryptedPatient = decryptPatientPHI(
        patient as Record<string, unknown>,
        DEFAULT_PHI_FIELDS as unknown as string[]
      );
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
   * Create a new customer on a specific Stripe account (dedicated or connected).
   * Does NOT overwrite patient.stripeCustomerId since that belongs to the default account.
   */
  private static async createNewCustomerOnAccount(
    patient: Patient,
    stripeClient: Stripe,
    connectOpts?: { stripeAccount: string }
  ): Promise<Stripe.Customer> {
    let decryptedPatient = patient as Record<string, unknown>;
    try {
      decryptedPatient = decryptPatientPHI(
        patient as Record<string, unknown>,
        DEFAULT_PHI_FIELDS as unknown as string[]
      );
    } catch {
      logger.debug('Patient data not encrypted, using raw values');
    }

    const createParams: Stripe.CustomerCreateParams = {
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
        source: 'eonpro_platform',
      },
    };

    const customer = connectOpts
      ? await stripeClient.customers.create(createParams, connectOpts)
      : await stripeClient.customers.create(createParams);

    logger.info(
      `[STRIPE] Created customer ${customer.id} on target account for patient ${patient.id}`
    );

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
      decryptedPatient = decryptPatientPHI(
        patient as Record<string, unknown>,
        DEFAULT_PHI_FIELDS as unknown as string[]
      );
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
  static async getCustomerPortalUrl(patientId: number, returnUrl: string): Promise<string> {
    const stripeClient = getStripe();

    const customer = await this.getOrCreateCustomer(patientId);

    try {
      const session = await stripeClient.billingPortal.sessions.create({
        customer: customer.id,
        return_url: returnUrl,
      });

      return session.url;
    } catch (err: unknown) {
      const stripeErr = err as { type?: string; message?: string };
      if (
        stripeErr.type === 'StripeInvalidRequestError' &&
        stripeErr.message?.includes('configuration')
      ) {
        throw new Error(
          'Stripe billing portal is not configured. Set it up at https://dashboard.stripe.com/settings/billing/portal'
        );
      }
      throw err;
    }
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
        logger.error(
          `[STRIPE] Failed to sync patient ${patient.id}:`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    logger.debug('[STRIPE] Patient sync complete');
  }
}
