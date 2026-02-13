/**
 * Stripe Module - Enterprise Integration
 *
 * This module provides all Stripe-related functionality including:
 * - Configuration management
 * - Client initialization
 * - Invoice creation
 * - Payment processing
 * - Subscription management
 * - Stripe Connect for multi-tenant support
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

// Re-export Stripe Connect utilities for multi-tenant support
export {
  getStripeForPlatform,
  getStripeForClinic,
  withConnectedAccount,
  createConnectedAccount,
  getOnboardingLink,
  getDashboardLink,
  syncConnectedAccountStatus,
  deleteConnectedAccount,
  getClinicBalance,
  getClinicCharges,
  getClinicPayouts,
  getClinicCustomers,
  getClinicSubscriptions,
  getClinicDisputes,
  getClinicProducts,
  type StripeContext,
  type ConnectedAccountStatus,
} from './connect';
