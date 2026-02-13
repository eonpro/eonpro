/**
 * Enterprise Stripe Configuration Service
 *
 * This module provides centralized Stripe configuration management with:
 * - Environment validation
 * - Configuration caching
 * - Detailed diagnostics
 * - Graceful fallback handling
 */

import Stripe from 'stripe';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface StripeConfig {
  isConfigured: boolean;
  isTestMode: boolean;
  hasSecretKey: boolean;
  hasPublishableKey: boolean;
  hasWebhookSecret: boolean;
  accountId?: string;
  accountName?: string;
  error?: string;
  lastValidated?: Date;
}

export interface StripePriceMapping {
  planId: string;
  stripePriceId: string;
  stripeProductId?: string;
  name: string;
  price: number;
  isRecurring: boolean;
  interval?: 'month' | 'year';
  intervalCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION CACHE
// ═══════════════════════════════════════════════════════════════════════════

let cachedConfig: StripeConfig | null = null;
let cachedStripeClient: Stripe | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let lastCacheTime = 0;

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Stripe key environment variables
 *
 * NAMING CONVENTION:
 * - EONMEDS_STRIPE_* = EonMeds clinic's own Stripe account (standalone)
 * - STRIPE_CONNECT_PLATFORM_* = EONpro platform's Stripe Connect account
 * - STRIPE_CONNECT_* = Stripe Connect settings (Client ID, webhook)
 *
 * The "default" Stripe key is EonMeds for backward compatibility,
 * but clinics using Connect will use their own connected accounts.
 */
function getStripeSecretKey(): string | undefined {
  return (
    // EonMeds clinic account (preferred for direct payments)
    process.env.EONMEDS_STRIPE_SECRET_KEY ||
    // Legacy names (backward compatibility)
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SK ||
    undefined
  );
}

function getStripePublishableKey(): string | undefined {
  return (
    // EonMeds clinic account (preferred)
    process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
    // Legacy names (backward compatibility)
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PK ||
    undefined
  );
}

function getStripeWebhookSecret(): string | undefined {
  return (
    // EonMeds clinic account (preferred)
    process.env.EONMEDS_STRIPE_WEBHOOK_SECRET ||
    // Legacy names (backward compatibility)
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET ||
    undefined
  );
}

/**
 * Get Stripe Connect Platform secret key
 * This is a SEPARATE Stripe account used for Connect functionality
 */
export function getStripeConnectPlatformKey(): string | undefined {
  return process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEDICATED CLINIC ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OT (Overtime) Clinic Stripe Configuration
 * This is a dedicated Stripe account for ot.eonpro.io
 */
export const OT_STRIPE_CONFIG = {
  secretKey: process.env.OT_STRIPE_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_OT_STRIPE_PUBLISHABLE_KEY,
  webhookSecret: process.env.OT_STRIPE_WEBHOOK_SECRET,
  isConfigured: (): boolean => !!process.env.OT_STRIPE_SECRET_KEY,
  isTestMode: (): boolean => {
    const key = process.env.OT_STRIPE_SECRET_KEY;
    return !key || key.includes('_test_');
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE CLIENT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get or create Stripe client instance
 * Uses singleton pattern with lazy initialization
 */
export function getStripeClient(): Stripe | null {
  const secretKey = getStripeSecretKey();

  if (!secretKey) {
    logger.warn('[STRIPE] No secret key configured');
    return null;
  }

  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000, // 30 seconds
    });

    logger.info('[STRIPE] Client initialized', {
      isTestMode: secretKey.includes('_test_'),
      keyPrefix: secretKey.substring(0, 7) + '...',
    });
  }

  return cachedStripeClient;
}

/**
 * Get Stripe client or throw error
 * Use this when Stripe is required for the operation
 */
export function requireStripeClient(): Stripe {
  const client = getStripeClient();

  if (!client) {
    throw new StripeConfigError(
      'Stripe is not configured. Please set EONMEDS_STRIPE_SECRET_KEY environment variable.',
      'STRIPE_NOT_CONFIGURED'
    );
  }

  return client;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate and cache Stripe configuration
 */
export async function validateStripeConfig(forceRefresh = false): Promise<StripeConfig> {
  const now = Date.now();

  // Return cached config if still valid
  if (!forceRefresh && cachedConfig && now - lastCacheTime < CACHE_DURATION_MS) {
    return cachedConfig;
  }

  const secretKey = getStripeSecretKey();
  const publishableKey = getStripePublishableKey();
  const webhookSecret = getStripeWebhookSecret();

  const config: StripeConfig = {
    isConfigured: false,
    isTestMode: secretKey?.includes('_test_') ?? true,
    hasSecretKey: !!secretKey,
    hasPublishableKey: !!publishableKey,
    hasWebhookSecret: !!webhookSecret,
    lastValidated: new Date(),
  };

  // No secret key = not configured
  if (!secretKey) {
    config.error = 'EONMEDS_STRIPE_SECRET_KEY not found in environment';
    cachedConfig = config;
    lastCacheTime = now;
    return config;
  }

  // Validate key format
  if (!secretKey.startsWith('sk_')) {
    config.error = 'Invalid EONMEDS_STRIPE_SECRET_KEY format (should start with sk_)';
    cachedConfig = config;
    lastCacheTime = now;
    return config;
  }

  // Test the connection
  try {
    const stripe = getStripeClient()!;

    // Try to retrieve account info
    const account = await stripe.accounts.retrieve();

    config.isConfigured = true;
    config.accountId = account.id;
    config.accountName = account.business_profile?.name || account.email || undefined;

    logger.info('[STRIPE] Configuration validated successfully', {
      accountId: account.id,
      isTestMode: config.isTestMode,
    });
  } catch (error: any) {
    // Check for specific error types
    if (error.type === 'StripeAuthenticationError') {
      config.error = 'Invalid Stripe API key';
    } else if (error.type === 'StripePermissionError') {
      // Keys are valid but restricted - still consider configured
      config.isConfigured = true;
      config.error = 'API key has restricted permissions';
    } else {
      config.error = error.message || 'Failed to connect to Stripe';
    }

    logger.error('[STRIPE] Configuration validation failed', {
      error: config.error,
      type: error.type,
    });
  }

  cachedConfig = config;
  lastCacheTime = now;
  return config;
}

/**
 * Quick check if Stripe is configured (no API call)
 */
export function isStripeConfigured(): boolean {
  return !!getStripeSecretKey();
}

/**
 * Quick check if we're in test mode
 */
export function isStripeTestMode(): boolean {
  const key = getStripeSecretKey();
  return !key || key.includes('_test_');
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ID MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map of billing plan IDs to Stripe price IDs
 * This should be stored in database for production, but defaults are provided here
 */
const STRIPE_PRICE_MAP: Record<string, string> = {
  // Semaglutide
  sema_monthly_default: process.env.STRIPE_PRICE_SEMA_MONTHLY_DEFAULT || '',
  sema_single_default: process.env.STRIPE_PRICE_SEMA_SINGLE_DEFAULT || '',
  sema_3month_default: process.env.STRIPE_PRICE_SEMA_3MONTH_DEFAULT || '',
  sema_6month_default: process.env.STRIPE_PRICE_SEMA_6MONTH_DEFAULT || '',
  sema_monthly_3ml: process.env.STRIPE_PRICE_SEMA_MONTHLY_3ML || '',
  sema_single_3ml: process.env.STRIPE_PRICE_SEMA_SINGLE_3ML || '',
  sema_3month_3ml: process.env.STRIPE_PRICE_SEMA_3MONTH_3ML || '',
  sema_6month_3ml: process.env.STRIPE_PRICE_SEMA_6MONTH_3ML || '',
  sema_monthly_4ml: process.env.STRIPE_PRICE_SEMA_MONTHLY_4ML || '',
  sema_single_4ml: process.env.STRIPE_PRICE_SEMA_SINGLE_4ML || '',
  sema_3month_4ml: process.env.STRIPE_PRICE_SEMA_3MONTH_4ML || '',
  sema_6month_4ml: process.env.STRIPE_PRICE_SEMA_6MONTH_4ML || '',

  // Tirzepatide
  tirz_monthly_default: process.env.STRIPE_PRICE_TIRZ_MONTHLY_DEFAULT || '',
  tirz_single_default: process.env.STRIPE_PRICE_TIRZ_SINGLE_DEFAULT || '',
  tirz_3month_default: process.env.STRIPE_PRICE_TIRZ_3MONTH_DEFAULT || '',
  tirz_6month_default: process.env.STRIPE_PRICE_TIRZ_6MONTH_DEFAULT || '',
  tirz_monthly_3ml: process.env.STRIPE_PRICE_TIRZ_MONTHLY_3ML || '',
  tirz_single_3ml: process.env.STRIPE_PRICE_TIRZ_SINGLE_3ML || '',
  tirz_3month_3ml: process.env.STRIPE_PRICE_TIRZ_3MONTH_3ML || '',
  tirz_6month_3ml: process.env.STRIPE_PRICE_TIRZ_6MONTH_3ML || '',
  tirz_monthly_4ml: process.env.STRIPE_PRICE_TIRZ_MONTHLY_4ML || '',
  tirz_single_4ml: process.env.STRIPE_PRICE_TIRZ_SINGLE_4ML || '',
  tirz_3month_4ml: process.env.STRIPE_PRICE_TIRZ_3MONTH_4ML || '',
  tirz_6month_4ml: process.env.STRIPE_PRICE_TIRZ_6MONTH_4ML || '',
  tirz_monthly_high: process.env.STRIPE_PRICE_TIRZ_MONTHLY_HIGH || '',
  tirz_single_high: process.env.STRIPE_PRICE_TIRZ_SINGLE_HIGH || '',
  tirz_3month_high: process.env.STRIPE_PRICE_TIRZ_3MONTH_HIGH || '',
  tirz_6month_high: process.env.STRIPE_PRICE_TIRZ_6MONTH_HIGH || '',

  // Upsales
  upsale_ondansetron: process.env.STRIPE_PRICE_ONDANSETRON || '',
  upsale_fat_burner: process.env.STRIPE_PRICE_FAT_BURNER || '',

  // Bloodwork
  bloodwork_partial: process.env.STRIPE_PRICE_BLOODWORK_PARTIAL || '',
  bloodwork_full: process.env.STRIPE_PRICE_BLOODWORK_FULL || '',

  // Additional treatments
  treatment_nad: process.env.STRIPE_PRICE_NAD || '',
  treatment_sermorelin: process.env.STRIPE_PRICE_SERMORELIN || '',

  // Shipping
  shipping_expedited: process.env.STRIPE_PRICE_SHIPPING_EXPEDITED || '',
};

/**
 * Get Stripe price ID for a billing plan
 */
export function getStripePriceId(planId: string): string | null {
  return STRIPE_PRICE_MAP[planId] || null;
}

/**
 * Check if a plan has a Stripe price ID configured
 */
export function hasPriceMapping(planId: string): boolean {
  return !!STRIPE_PRICE_MAP[planId];
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export class StripeConfigError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'StripeConfigError';
    this.code = code;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get detailed diagnostics for troubleshooting
 */
export async function getStripeDiagnostics(): Promise<{
  config: StripeConfig;
  environment: {
    nodeEnv: string;
    hasSecretKey: boolean;
    hasPublishableKey: boolean;
    hasWebhookSecret: boolean;
    keyFormat: string | null;
  };
  connectivity: {
    canConnect: boolean;
    latencyMs?: number;
    error?: string;
  };
  priceMapping: {
    configuredCount: number;
    totalCount: number;
    mappings: Record<string, boolean>;
  };
}> {
  const config = await validateStripeConfig(true);
  const secretKey = getStripeSecretKey();

  // Check connectivity
  let connectivity = {
    canConnect: false,
    latencyMs: undefined as number | undefined,
    error: undefined as string | undefined,
  };

  if (secretKey) {
    const start = Date.now();
    try {
      const stripe = getStripeClient()!;
      await stripe.balance.retrieve();
      connectivity.canConnect = true;
      connectivity.latencyMs = Date.now() - start;
    } catch (error: any) {
      connectivity.error = error.message;
      connectivity.latencyMs = Date.now() - start;
    }
  }

  // Check price mappings
  const mappings: Record<string, boolean> = {};
  let configuredCount = 0;

  for (const [planId, priceId] of Object.entries(STRIPE_PRICE_MAP)) {
    const hasMapping = !!priceId;
    mappings[planId] = hasMapping;
    if (hasMapping) configuredCount++;
  }

  return {
    config,
    environment: {
      nodeEnv: process.env.NODE_ENV || 'unknown',
      hasSecretKey: !!secretKey,
      hasPublishableKey: !!getStripePublishableKey(),
      hasWebhookSecret: !!getStripeWebhookSecret(),
      keyFormat: secretKey ? (secretKey.startsWith('sk_live_') ? 'live' : 'test') : null,
    },
    connectivity,
    priceMapping: {
      configuredCount,
      totalCount: Object.keys(STRIPE_PRICE_MAP).length,
      mappings,
    },
  };
}
