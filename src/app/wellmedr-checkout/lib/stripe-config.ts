/**
 * Returns the platform's publishable key for direct charges via Connect.
 * Falls back to WellMedR-specific or legacy keys for backward compatibility.
 */
export function getStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_EONMEDS_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ''
  );
}

/**
 * Returns the WellMedR connected account ID for use with loadStripe's stripeAccount option.
 */
export function getStripeConnectedAccountId(): string | undefined {
  return process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID || undefined;
}

export function getStripeSecretKey(): string {
  return (
    process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY ||
    process.env.WELLMEDR_STRIPE_SECRET_KEY ||
    process.env.EONMEDS_STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    ''
  );
}

export function getStripePaymentConfigId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_PAYMENT_CONFIG_ID ||
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_CONFIG_ID ||
    undefined
  );
}

export function getStripeWebhookSecret(): string {
  return (
    process.env.STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET ||
    process.env.WELLMEDR_STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    ''
  );
}
