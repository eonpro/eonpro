/**
 * STRIPE CONNECT MULTI-TENANT SUPPORT
 * 
 * Handles Stripe Connect for multi-clinic setup:
 * - EONmeds: Platform account (direct Stripe calls)
 * - Other Clinics: Connected accounts (Stripe Connect)
 * 
 * Usage:
 * - For platform operations: getStripeForPlatform()
 * - For clinic operations: getStripeForClinic(clinicId)
 * - The returned object includes `stripe` client and optional `stripeAccountId`
 */

import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

// Types
export interface StripeContext {
  stripe: Stripe;
  stripeAccountId?: string; // Connected account ID (acct_xxx) - undefined for platform
  isPlatformAccount: boolean;
  clinicId?: number;
}

export interface ConnectedAccountStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
}

// Platform Stripe client (singleton)
let platformStripe: Stripe | null = null;

function getPlatformStripe(): Stripe {
  if (!platformStripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    platformStripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 3,
    });
  }
  return platformStripe;
}

/**
 * Get Stripe context for the platform account (EONmeds)
 * Use this for platform-level operations
 */
export function getStripeForPlatform(): StripeContext {
  return {
    stripe: getPlatformStripe(),
    isPlatformAccount: true,
  };
}

/**
 * Get Stripe context for a specific clinic
 * Returns connected account ID if clinic has one, otherwise uses platform
 */
export async function getStripeForClinic(clinicId: number): Promise<StripeContext> {
  const stripe = getPlatformStripe();
  
  // Get clinic's Stripe Connect info
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      stripeAccountId: true,
      stripePlatformAccount: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboardingComplete: true,
    },
  });
  
  if (!clinic) {
    throw new Error(`Clinic ${clinicId} not found`);
  }
  
  // If clinic is explicitly marked as platform account (e.g., EONmeds)
  if (clinic.stripePlatformAccount) {
    return {
      stripe,
      isPlatformAccount: true,
      clinicId: clinic.id,
    };
  }
  
  // If clinic has no connected account AND is not a platform account,
  // return isPlatformAccount: false so API routes can detect and return empty data
  if (!clinic.stripeAccountId) {
    logger.info('[STRIPE CONNECT] Clinic has no Stripe account configured', {
      clinicId: clinic.id,
      clinicName: clinic.name,
    });
    return {
      stripe,
      isPlatformAccount: false,
      stripeAccountId: undefined,
      clinicId: clinic.id,
    };
  }
  
  // Verify connected account is ready
  if (!clinic.stripeChargesEnabled) {
    logger.warn(`[STRIPE CONNECT] Clinic ${clinicId} has connected account but charges not enabled`);
  }
  
  return {
    stripe,
    stripeAccountId: clinic.stripeAccountId,
    isPlatformAccount: false,
    clinicId: clinic.id,
  };
}

/**
 * Make Stripe API call with optional connected account
 * Automatically adds stripeAccount header if needed
 */
export function withConnectedAccount<T extends object>(
  context: StripeContext,
  params: T
): T & { stripeAccount?: string } {
  if (context.stripeAccountId) {
    return { ...params, stripeAccount: context.stripeAccountId };
  }
  return params;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE CONNECT ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Stripe Connect account for a clinic
 * 
 * @param clinicId - The clinic ID
 * @param options - Account creation options
 * @param options.email - Email for the connected account
 * @param options.businessType - 'individual' or 'company' (default: 'company')
 * @param options.country - Country code (default: 'US')
 * @param options.returnPath - Custom return path after onboarding (default: /admin/settings/stripe)
 */
export async function createConnectedAccount(
  clinicId: number,
  options: {
    email: string;
    businessType?: 'individual' | 'company';
    country?: string;
    returnPath?: string;
  }
): Promise<{ accountId: string; onboardingUrl: string }> {
  const stripe = getPlatformStripe();
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, stripeAccountId: true },
  });
  
  if (!clinic) {
    throw new Error(`Clinic ${clinicId} not found`);
  }
  
  if (clinic.stripeAccountId) {
    throw new Error(`Clinic ${clinicId} already has a connected account`);
  }
  
  // Create connected account
  const account = await stripe.accounts.create({
    type: 'standard', // Standard accounts have their own dashboard
    email: options.email,
    business_type: options.businessType || 'company',
    country: options.country || 'US',
    metadata: {
      clinicId: clinicId.toString(),
      clinicName: clinic.name,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  
  // Update clinic with account ID
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: 'pending',
      stripeConnectedAt: new Date(),
    },
  });
  
  // Default return path for self-service flow
  const returnPath = options.returnPath || '/admin/settings/stripe';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  
  // Create account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${baseUrl}${returnPath}?stripe=refresh`,
    return_url: `${baseUrl}${returnPath}?stripe=complete`,
    type: 'account_onboarding',
  });
  
  logger.info('[STRIPE CONNECT] Created connected account', {
    clinicId,
    accountId: account.id,
  });
  
  return {
    accountId: account.id,
    onboardingUrl: accountLink.url,
  };
}

/**
 * Get onboarding link for existing connected account
 * 
 * @param clinicId - The clinic ID
 * @param returnPath - Custom return path after onboarding (default: /admin/settings/stripe)
 */
export async function getOnboardingLink(
  clinicId: number,
  returnPath?: string
): Promise<string> {
  const stripe = getPlatformStripe();
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeAccountId: true },
  });
  
  if (!clinic?.stripeAccountId) {
    throw new Error(`Clinic ${clinicId} has no connected account`);
  }
  
  const path = returnPath || '/admin/settings/stripe';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  
  const accountLink = await stripe.accountLinks.create({
    account: clinic.stripeAccountId,
    refresh_url: `${baseUrl}${path}?stripe=refresh`,
    return_url: `${baseUrl}${path}?stripe=complete`,
    type: 'account_onboarding',
  });
  
  return accountLink.url;
}

/**
 * Get Stripe dashboard login link for connected account
 */
export async function getDashboardLink(clinicId: number): Promise<string> {
  const stripe = getPlatformStripe();
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeAccountId: true },
  });
  
  if (!clinic?.stripeAccountId) {
    throw new Error(`Clinic ${clinicId} has no connected account`);
  }
  
  const loginLink = await stripe.accounts.createLoginLink(clinic.stripeAccountId);
  return loginLink.url;
}

/**
 * Sync connected account status from Stripe
 */
export async function syncConnectedAccountStatus(clinicId: number): Promise<ConnectedAccountStatus> {
  const stripe = getPlatformStripe();
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeAccountId: true },
  });
  
  if (!clinic?.stripeAccountId) {
    throw new Error(`Clinic ${clinicId} has no connected account`);
  }
  
  const account = await stripe.accounts.retrieve(clinic.stripeAccountId);
  
  const status: ConnectedAccountStatus = {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    onboardingComplete: account.charges_enabled && account.details_submitted,
    requirements: {
      currentlyDue: account.requirements?.currently_due || [],
      eventuallyDue: account.requirements?.eventually_due || [],
      pastDue: account.requirements?.past_due || [],
    },
  };
  
  // Update clinic with latest status
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      stripeChargesEnabled: status.chargesEnabled,
      stripePayoutsEnabled: status.payoutsEnabled,
      stripeDetailsSubmitted: status.detailsSubmitted,
      stripeOnboardingComplete: status.onboardingComplete,
      stripeAccountStatus: status.onboardingComplete ? 'active' : 'pending',
    },
  });
  
  logger.info('[STRIPE CONNECT] Synced account status', {
    clinicId,
    accountId: account.id,
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
  });
  
  return status;
}

/**
 * Delete connected account (use with caution!)
 */
export async function deleteConnectedAccount(clinicId: number): Promise<void> {
  const stripe = getPlatformStripe();
  
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeAccountId: true },
  });
  
  if (!clinic?.stripeAccountId) {
    throw new Error(`Clinic ${clinicId} has no connected account`);
  }
  
  // Delete the account from Stripe
  await stripe.accounts.del(clinic.stripeAccountId);
  
  // Clear clinic's Stripe fields
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      stripeAccountId: null,
      stripeAccountStatus: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeOnboardingComplete: false,
      stripeConnectedAt: null,
    },
  });
  
  logger.info('[STRIPE CONNECT] Deleted connected account', {
    clinicId,
    accountId: clinic.stripeAccountId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTED ACCOUNT DATA ACCESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get balance for a clinic (platform or connected account)
 */
export async function getClinicBalance(clinicId: number) {
  const context = await getStripeForClinic(clinicId);
  
  const balance = await context.stripe.balance.retrieve(
    context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : undefined
  );
  
  return balance;
}

/**
 * List charges for a clinic
 */
export async function getClinicCharges(
  clinicId: number,
  params: Stripe.ChargeListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const charges = await context.stripe.charges.list(
    withConnectedAccount(context, params)
  );
  
  return charges;
}

/**
 * List payouts for a clinic
 */
export async function getClinicPayouts(
  clinicId: number,
  params: Stripe.PayoutListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const payouts = await context.stripe.payouts.list(
    withConnectedAccount(context, params)
  );
  
  return payouts;
}

/**
 * List customers for a clinic
 */
export async function getClinicCustomers(
  clinicId: number,
  params: Stripe.CustomerListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const customers = await context.stripe.customers.list(
    withConnectedAccount(context, params)
  );
  
  return customers;
}

/**
 * List subscriptions for a clinic
 */
export async function getClinicSubscriptions(
  clinicId: number,
  params: Stripe.SubscriptionListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const subscriptions = await context.stripe.subscriptions.list(
    withConnectedAccount(context, params)
  );
  
  return subscriptions;
}

/**
 * List disputes for a clinic
 */
export async function getClinicDisputes(
  clinicId: number,
  params: Stripe.DisputeListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const disputes = await context.stripe.disputes.list(
    withConnectedAccount(context, params)
  );
  
  return disputes;
}

/**
 * List products for a clinic
 */
export async function getClinicProducts(
  clinicId: number,
  params: Stripe.ProductListParams = {}
) {
  const context = await getStripeForClinic(clinicId);
  
  const products = await context.stripe.products.list(
    withConnectedAccount(context, params)
  );
  
  return products;
}
