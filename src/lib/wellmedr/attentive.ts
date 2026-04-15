/**
 * Attentive SMS Marketing — WellMedR ecommerce events
 *
 * Fires product view, add-to-cart, checkout-started, and purchase events
 * via the Attentive REST API. All calls are non-blocking (fire-and-forget).
 *
 * Requires: ATTENTIVE_API_KEY env var.
 */

const BASE_URL = 'https://api.attentivemobile.com/v1';
const CUSTOM_EVENTS_ENDPOINT = `${BASE_URL}/events/custom`;

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
    console.error('[Attentive] Failed to send product view event:', err);
  }
}

export async function sendAddToCartEvent(params: AttentiveProductParams): Promise<void> {
  try {
    await restRequest('/events/ecommerce/add-to-cart', {
      items: [productItem(params)],
      user: eventUser(params.email, params.phone),
    });
  } catch (err) {
    console.error('[Attentive] Failed to send add to cart event:', err);
  }
}

export async function sendCheckoutStartedEvent(params: AttentiveProductParams): Promise<void> {
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
    console.error('[Attentive] Failed to send checkout started event:', err);
  }
}

export async function sendPurchaseEvent(params: AttentivePurchaseParams): Promise<void> {
  try {
    await restRequest('/events/ecommerce/purchase', {
      items: [productItem(params)],
      user: eventUser(params.email, params.phone),
    });
  } catch (err) {
    console.error('[Attentive] Failed to send purchase event:', err);
  }
}
