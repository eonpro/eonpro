import Stripe from 'stripe';
import { logger } from '@/lib/logger';

// Initialize Stripe with API key
const stripeApiKey = process.env.STRIPE_SECRET_KEY;

// Only throw error at runtime, not during build
const checkStripeKey = () => {
  if (!stripeApiKey && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test" && typeof window === 'undefined') {
    logger.warn('STRIPE_SECRET_KEY is not configured - Stripe features will be disabled');
  }
};

export const stripe = stripeApiKey
  ? new Stripe(stripeApiKey, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
    })
  : null;

// Stripe configuration constants
export const STRIPE_CONFIG = {
  // Payment settings
  currency: 'usd' as const,
  paymentMethods: ['card', 'ach_debit'] as const,
  
  // Invoice settings
  invoiceDueDays: 30,
  collectionMethod: 'send_invoice' as const,
  
  // Webhook endpoints
  webhookEndpointSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  
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

// Helper function to get Stripe instance
export function getStripe(): Stripe {
  checkStripeKey();
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }
  return stripe;
}
