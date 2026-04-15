/**
 * WellMedR Post-Purchase Upsell Authentication
 *
 * HMAC-signed tokens that tie a Stripe customer ID to a short-lived window,
 * allowing one-click upsell charges without re-entering payment info.
 *
 * Token format: `{customerId}:{expiresAtUnix}:{hmacHex}`
 */

import { createHmac, timingSafeEqual } from 'crypto';

const EXPIRY_SECONDS = 3600; // 1 hour

function getSecret(): string {
  return (
    process.env.UPSELL_HMAC_SECRET ||
    (process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY ||
      process.env.WELLMEDR_STRIPE_SECRET_KEY ||
      '') + ':upsell-token'
  );
}

export function generateUpsellToken(customerId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const payload = `${customerId}:${expiry}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

export function validateUpsellToken(token: string, expectedCustomerId: string): boolean {
  const lastColon = token.lastIndexOf(':');
  if (lastColon === -1) return false;

  const sig = token.slice(lastColon + 1);
  const payload = token.slice(0, lastColon);

  const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;

  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  const firstColon = payload.indexOf(':');
  if (firstColon === -1) return false;

  const tokenCustomerId = payload.slice(0, firstColon);
  const expiryStr = payload.slice(firstColon + 1);
  const expiry = parseInt(expiryStr, 10);

  if (tokenCustomerId !== expectedCustomerId) return false;
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;

  return true;
}
