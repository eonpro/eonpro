/**
 * Stripe Module - Enterprise Integration
 * 
 * This module provides all Stripe-related functionality including:
 * - Configuration management
 * - Client initialization
 * - Invoice creation
 * - Payment processing
 * - Subscription management
 */

// Re-export configuration utilities
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
  type StripeConfig,
  type StripePriceMapping,
} from './config';
