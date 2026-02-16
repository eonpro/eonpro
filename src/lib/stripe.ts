import Stripe from 'stripe';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORT FROM CONFIG MODULE
// ═══════════════════════════════════════════════════════════════════════════

export {
  getStripeClient,
  requireStripeClient,
  validateStripeConfig,
  isStripeConfigured,
  isStripeTestMode,
  getStripePriceId,
  hasPriceMapping,
  getStripeDiagnostics,
  StripeConfigError,
} from '@/lib/stripe/config';

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

// Get API key with fallbacks for various naming conventions
// NAMING: EONMEDS_STRIPE_* = EonMeds clinic account (standalone)
//         STRIPE_CONNECT_PLATFORM_* = EONpro platform Connect account (separate)
function getStripeSecretKey(): string | undefined {
  return (
    // EonMeds clinic account (preferred)
    process.env.EONMEDS_STRIPE_SECRET_KEY ||
    // Legacy names (backward compatibility)
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SK ||
    undefined
  );
}

const stripeApiKey = getStripeSecretKey();

// Legacy stripe instance for backward compatibility
export const stripe = stripeApiKey
  ? new Stripe(stripeApiKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000,
    })
  : null;

// Stripe configuration constants for EonMeds Clinic Account
// NOTE: This is separate from Stripe Connect (which uses STRIPE_CONNECT_PLATFORM_*)
export const STRIPE_CONFIG = {
  // Payment settings
  currency: 'usd' as const,
  paymentMethods: ['card', 'ach_debit'] as const,

  // Invoice settings
  invoiceDueDays: 30,
  collectionMethod: 'send_invoice' as const,

  // Webhook endpoints (EonMeds clinic webhooks)
  webhookEndpointSecret:
    process.env.EONMEDS_STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET ||
    '',

  // Product/Price IDs (to be configured)
  products: {
    consultation: process.env.STRIPE_PRODUCT_CONSULTATION || '',
    prescription: process.env.STRIPE_PRODUCT_PRESCRIPTION || '',
    labWork: process.env.STRIPE_PRODUCT_LAB_WORK || '',
  },

  // Default tax settings
  automaticTax: {
    enabled: true,
  },
};

// Helper function to format currency
export function formatCurrency(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100);
}

// Legacy helper function to get Stripe instance (use requireStripeClient for new code)
export function getStripe(): Stripe {
  if (!stripe) {
    // Log detailed error for debugging
    logger.error('[STRIPE] Configuration Error', {
      hasEonmedsSecretKey: !!process.env.EONMEDS_STRIPE_SECRET_KEY,
      hasLegacySecretKey: !!process.env.STRIPE_SECRET_KEY,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    throw new Error(
      'Stripe is not configured. Please set EONMEDS_STRIPE_SECRET_KEY environment variable.'
    );
  }
  return stripe;
}
