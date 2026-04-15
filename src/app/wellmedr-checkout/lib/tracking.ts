/**
 * GTM dataLayer tracking utilities with SHA-256 hashed user data.
 *
 * Pushes GA4-standard ecommerce events that GTM reads for both
 * GA4 tags and the native Facebook Pixel template (via GTM variables).
 *
 * user_data fields are SHA-256 hashed before pushing (Meta requirement
 * when GTM Custom HTML tags are used instead of the native template).
 */

function push(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { dataLayer: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(data);
}

function clearEcommerce() {
  push({ ecommerce: null });
}

const STATE_ABBREVS: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh',
  oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
};

function normalizeState(state: string): string {
  const lower = state.trim().toLowerCase();
  if (lower.length === 2) return lower;
  return STATE_ABBREVS[lower] || lower;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  return digits;
}

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface UserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  externalId?: string;
}

async function buildHashedUserData(raw: UserData): Promise<Record<string, string>> {
  const result: Record<string, string> = { country: 'us' };
  try {
    if (raw.email) result.em = await sha256(raw.email.trim().toLowerCase());
    if (raw.phone) result.ph = await sha256(normalizePhone(raw.phone));
    if (raw.firstName) result.fn = await sha256(raw.firstName.trim().toLowerCase());
    if (raw.lastName) result.ln = await sha256(raw.lastName.trim().toLowerCase());
    if (raw.city) result.ct = await sha256(raw.city.trim().toLowerCase().replace(/\s/g, ''));
    if (raw.state) result.st = await sha256(normalizeState(raw.state));
    if (raw.zipCode) result.zp = await sha256(raw.zipCode.trim());
    if (raw.externalId) result.external_id = await sha256(raw.externalId);
  } catch {
    if (raw.email) result.em = raw.email.trim().toLowerCase();
    if (raw.phone) result.ph = normalizePhone(raw.phone);
  }
  return result;
}

interface ProductInfo {
  productId: string;
  productName: string;
  price: number;
  planType?: string;
}

function buildItem(product: ProductInfo) {
  return {
    item_id: product.productId,
    item_name: product.productName,
    price: product.price,
    quantity: 1,
    item_category: 'Weight Loss',
    item_category2: 'GLP-1',
    item_brand: 'WellMedR',
    item_variant: product.planType || 'monthly',
  };
}

export function pushViewItem(product: ProductInfo) {
  clearEcommerce();
  push({
    event: 'view_item',
    ecommerce: {
      currency: 'USD',
      value: product.price,
      items: [buildItem(product)],
    },
  });
}

export function pushAddToCart(product: ProductInfo) {
  clearEcommerce();
  push({
    event: 'add_to_cart',
    ecommerce: {
      currency: 'USD',
      value: product.price,
      items: [buildItem(product)],
    },
  });
}

interface PurchaseData {
  transactionId: string;
  value: number;
  currency?: string;
  product: ProductInfo;
  coupon?: string;
  userData?: UserData;
}

export async function pushPurchase(data: PurchaseData) {
  clearEcommerce();

  const userData = data.userData ? await buildHashedUserData(data.userData) : { country: 'us' };

  push({
    event: 'purchase',
    event_id: data.transactionId,
    user_data: userData,
    ecommerce: {
      transaction_id: data.transactionId,
      value: data.value,
      currency: data.currency || 'USD',
      ...(data.coupon ? { coupon: data.coupon } : {}),
      items: [buildItem(data.product)],
    },
  });
}
