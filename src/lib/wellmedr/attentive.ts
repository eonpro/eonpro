/**
 * Attentive SMS Marketing — WellMedR ecommerce events
 *
 * Fires product view, add-to-cart, checkout-started, and purchase events
 * via the Attentive REST API. All calls are non-blocking (fire-and-forget).
 *
 * HIPAA: Attentive receives raw email/phone. The ATTENTIVE_HIPAA_BAA_CONFIRMED
 * env var must be set to "true" to confirm a BAA is in place before any data
 * is sent. Without it, all events are silently skipped.
 *
 * Requires: ATTENTIVE_API_KEY, ATTENTIVE_HIPAA_BAA_CONFIRMED env vars.
 */

import { logger } from '@/lib/logger';

const BASE_URL = 'https://api.attentivemobile.com/v1';
const CUSTOM_EVENTS_ENDPOINT = `${BASE_URL}/events/custom`;

function isBaaConfirmed(): boolean {
  return process.env.ATTENTIVE_HIPAA_BAA_CONFIRMED === 'true';
}

function getApiKey(): string {
  return process.env.ATTENTIVE_API_KEY || '';
}

function resolveProductId(name: string, fallbackId: string): string {
  const n = name.toLowerCase();
  if (n.includes('semaglutide') && n.includes('12')) return '001';
  if (n.includes('semaglutide') && n.includes('6')) return '002';
  if (n.includes('semaglutide') && (n.includes('3') || n.includes('quarter'))) return '003';
  if (n.includes('semaglutide')) return '004';
  if (n.includes('tirzepatide') && n.includes('12')) return '005';
  if (n.includes('tirzepatide') && n.includes('6')) return '006';
  if (n.includes('tirzepatide') && (n.includes('3') || n.includes('quarter'))) return '007';
  if (n.includes('tirzepatide')) return '008';
  return fallbackId || '000';
}

interface AttentiveProductParams {
  email: string;
  phone?: string;
  productId: string;
  productName: string;
  productPrice: number;
  currency?: string;
  quantity?: number;
}

interface AttentivePurchaseParams extends AttentiveProductParams {
  orderId?: string;
}

async function restRequest(path: string, body: Record<string, unknown>): Promise<void> {
  if (!isBaaConfirmed()) {
    logger.warn('[Attentive] Skipping event — ATTENTIVE_HIPAA_BAA_CONFIRMED is not set to "true"');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) return;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Attentive REST error ${res.status}: ${text}`);
  }
}

function eventUser(email: string, phone?: string) {
  return { email, ...(phone ? { phone } : {}) };
}

function productItem(params: AttentiveProductParams) {
  const id = resolveProductId(params.productName, params.productId);
  return {
    productId: id,
    productVariantId: id,
    name: params.productName,
    price: [{ value: params.productPrice, currency: params.currency || 'USD' }],
    quantity: params.quantity || 1,
  };
}

export async function sendProductViewEvent(params: AttentiveProductParams): Promise<void> {
  try {
    await restRequest('/events/ecommerce/product-view', {
      items: [productItem(params)],
      user: eventUser(params.email, params.phone),
    });
  } catch (err) {
    logger.error('[Attentive] Failed to send product view event', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function sendAddToCartEvent(params: AttentiveProductParams): Promise<void> {
  try {
    await restRequest('/events/ecommerce/add-to-cart', {
      items: [productItem(params)],
      user: eventUser(params.email, params.phone),
    });
  } catch (err) {
    logger.error('[Attentive] Failed to send add to cart event', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function sendCheckoutStartedEvent(params: AttentiveProductParams): Promise<void> {
  if (!isBaaConfirmed()) {
    logger.warn('[Attentive] Skipping checkout-started — ATTENTIVE_HIPAA_BAA_CONFIRMED is not set');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) return;

  try {
    const res = await fetch(CUSTOM_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        type: 'Checkout Started',
        properties: {
          productId: resolveProductId(params.productName, params.productId),
          productName: params.productName,
          price: params.productPrice.toFixed(2),
          currency: params.currency || 'USD',
        },
        user: eventUser(params.email, params.phone),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Attentive Custom Event error ${res.status}: ${text}`);
    }
  } catch (err) {
    logger.error('[Attentive] Failed to send checkout started event', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function sendPurchaseEvent(params: AttentivePurchaseParams): Promise<void> {
  try {
    await restRequest('/events/ecommerce/purchase', {
      items: [productItem(params)],
      user: eventUser(params.email, params.phone),
    });
  } catch (err) {
    logger.error('[Attentive] Failed to send purchase event', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}
