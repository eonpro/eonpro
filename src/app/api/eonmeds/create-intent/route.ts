import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const STRIPE_PRODUCTS = {
  semaglutide: {
    monthly: process.env.EONMEDS_STRIPE_PRICE_SEMAGLUTIDE_MONTHLY || '',
    singleMonth: process.env.EONMEDS_STRIPE_PRICE_SEMAGLUTIDE_SINGLEMONTH || '',
    threeMonth: process.env.EONMEDS_STRIPE_PRICE_SEMAGLUTIDE_3MONTH || '',
    sixMonth: process.env.EONMEDS_STRIPE_PRICE_SEMAGLUTIDE_6MONTH || '',
    oneTime: process.env.EONMEDS_STRIPE_PRICE_SEMAGLUTIDE_ONETIME || '',
  },
  tirzepatide: {
    monthly: process.env.EONMEDS_STRIPE_PRICE_TIRZEPATIDE_MONTHLY || '',
    singleMonth: process.env.EONMEDS_STRIPE_PRICE_TIRZEPATIDE_SINGLEMONTH || '',
    threeMonth: process.env.EONMEDS_STRIPE_PRICE_TIRZEPATIDE_3MONTH || '',
    sixMonth: process.env.EONMEDS_STRIPE_PRICE_TIRZEPATIDE_6MONTH || '',
    oneTime: process.env.EONMEDS_STRIPE_PRICE_TIRZEPATIDE_ONETIME || '',
  },
  addons: {
    nauseaRelief: process.env.EONMEDS_STRIPE_PRODUCT_NAUSEA_RELIEF || '',
    fatBurner: process.env.EONMEDS_STRIPE_PRODUCT_FAT_BURNER || '',
  },
  shipping: {
    expedited: process.env.EONMEDS_STRIPE_SHIPPING_EXPEDITED || '',
  },
};

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(
      process.env.EONMEDS_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '',
      { apiVersion: '2026-03-25.dahlia' },
    );
  }
  return _stripe;
}

async function getOrCreateCustomer(
  email: string | undefined,
  name?: string,
  phone?: string,
  address?: { line1: string; line2?: string; city: string; state: string; postal_code: string; country?: string },
  metadata?: Record<string, string>,
) {
  const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (isValidEmail) {
    const existing = await getStripe().customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      return getStripe().customers.update(existing.data[0].id, {
        name: name || undefined,
        phone: phone || undefined,
        address: address || undefined,
        metadata: metadata || {},
      });
    }
    return getStripe().customers.create({
      email,
      name: name || undefined,
      phone: phone || undefined,
      address: address || undefined,
      metadata: metadata || {},
    });
  }

  return getStripe().customers.create({
    name: name || undefined,
    phone: phone || undefined,
    address: address || undefined,
    metadata: { ...metadata, anonymous: 'true' },
  });
}

function getPriceId(medication: string, planType: string) {
  if (!medication || !planType) return null;

  const med = medication.toLowerCase().replace(/\s+/g, '');
  const medKey = med.includes('semaglutide') ? 'semaglutide' : 'tirzepatide';
  const planLower = planType.toLowerCase();
  let mappedPlan = 'monthly';

  if (planLower.includes('6') || planLower.includes('six')) mappedPlan = 'sixMonth';
  else if (planLower.includes('3') || planLower.includes('three')) mappedPlan = 'threeMonth';
  else if (planLower.includes('one-time') || planLower.includes('onetime')) mappedPlan = 'oneTime';
  else if (planLower.includes('single') || planLower === 'monthly') mappedPlan = 'singleMonth';

  const medProducts = STRIPE_PRODUCTS[medKey as keyof typeof STRIPE_PRODUCTS];
  if (!medProducts || typeof medProducts === 'string') return null;

  let priceId = (medProducts as Record<string, string>)[mappedPlan];
  if (!priceId && mappedPlan === 'singleMonth') {
    priceId = (medProducts as Record<string, string>).monthly;
  }
  return priceId || null;
}

function normalizeMetaParam(value: string | null | undefined): string {
  if (!value) return '';
  if (value.startsWith('@')) return '';
  return value;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      amount,
      currency,
      customer_email,
      customer_name,
      customer_phone,
      shipping_address,
      order_data,
      metadata,
      language,
      lead_id,
      fbp,
      fbc,
      fbclid,
      meta_event_id,
      page_url,
      user_agent,
    } = body;

    if (!amount || amount < 50) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (
      !shipping_address ||
      !shipping_address.addressLine1?.trim?.() ||
      !shipping_address.city?.trim?.() ||
      !shipping_address.state?.trim?.() ||
      !shipping_address.zipCode?.trim?.()
    ) {
      return NextResponse.json(
        { error: 'Shipping address required', message: 'Please enter a complete shipping address.' },
        { status: 400 },
      );
    }

    const normalizedShipping = {
      addressLine1: String(shipping_address.addressLine1 || '').trim(),
      addressLine2: String(shipping_address.addressLine2 || '').trim(),
      city: String(shipping_address.city || '').trim(),
      state: String(shipping_address.state || '').trim().toUpperCase(),
      zipCode: String(shipping_address.zipCode || '').trim(),
      country: String(shipping_address.country || 'US').trim().toUpperCase(),
    };

    const billingAddress = {
      line1: normalizedShipping.addressLine1,
      line2: normalizedShipping.addressLine2 || undefined,
      city: normalizedShipping.city,
      state: normalizedShipping.state,
      postal_code: normalizedShipping.zipCode,
      country: normalizedShipping.country || 'US',
    };

    const customer = await getOrCreateCustomer(
      customer_email,
      customer_name,
      customer_phone,
      billingAddress,
      { medication: order_data?.medication || '', plan: order_data?.plan || '', source: 'eonmeds_checkout' },
    );

    const planType = order_data?.plan || '';
    const medicationId = order_data?.medication?.toLowerCase().replace(' ', '') || '';
    const isSubscription = planType && !planType.toLowerCase().includes('one time');

    const mainPriceId = getPriceId(medicationId, planType);
    const addonPriceIds: string[] = [];
    if (order_data?.addons) {
      for (const addon of order_data.addons) {
        if (addon.toLowerCase().includes('nausea') && STRIPE_PRODUCTS.addons.nauseaRelief) {
          addonPriceIds.push(STRIPE_PRODUCTS.addons.nauseaRelief);
        } else if (addon.toLowerCase().includes('fat burner') && STRIPE_PRODUCTS.addons.fatBurner) {
          addonPriceIds.push(STRIPE_PRODUCTS.addons.fatBurner);
        }
      }
    }
    if (order_data?.expeditedShipping && STRIPE_PRODUCTS.shipping.expedited) {
      addonPriceIds.push(STRIPE_PRODUCTS.shipping.expedited);
    }

    const normalizedPlanName = (() => {
      const p = (order_data?.plan || '').toLowerCase();
      if (p.includes('mensual') || p.includes('monthly') || p.includes('recurrente') || p.includes('recurring')) return 'Monthly Recurring';
      if (p.includes('3') && (p.includes('mes') || p.includes('month'))) return '3-Month Plan';
      if (p.includes('6') && (p.includes('mes') || p.includes('month'))) return '6-Month Plan';
      if (p.includes('única') || p.includes('one-time') || p.includes('onetime')) return 'One-Time Purchase';
      return order_data?.plan || 'Monthly Recurring';
    })();

    const description = `${order_data?.medication || 'Medication'} - ${normalizedPlanName}${
      order_data?.addons?.length > 0 ? ` + ${order_data.addons.join(', ')}` : ''
    }${order_data?.expeditedShipping ? ' + Expedited Shipping' : ''}`;

    const nameParts = (customer_name || '').trim().split(/\s+/);
    const normalizedLeadId = (!lead_id || lead_id.startsWith('@')) ? (meta_event_id || '') : lead_id;

    const orderMetadata: Record<string, string> = {
      ...metadata,
      customer_email: String(customer_email || ''),
      customer_first_name: nameParts[0] || '',
      customer_last_name: nameParts.slice(1).join(' ') || '',
      customer_phone: String(customer_phone || ''),
      customer_id: customer.id,
      language: String(language || 'en'),
      lead_id: normalizedLeadId,
      fbp: normalizeMetaParam(fbp),
      fbc: normalizeMetaParam(fbc),
      fbclid: normalizeMetaParam(fbclid),
      meta_event_id: String(meta_event_id ?? ''),
      page_url: String(page_url ?? ''),
      user_agent: String(user_agent ?? ''),
      source: 'eonmeds.eonpro.io',
      shipping_line1: normalizedShipping.addressLine1,
      shipping_city: normalizedShipping.city,
      shipping_state: normalizedShipping.state,
      shipping_zip: normalizedShipping.zipCode,
      timestamp: new Date().toISOString(),
      terms_accepted_at: new Date().toISOString(),
      medication: order_data?.medication || '',
      plan: normalizedPlanName,
      is_subscription: isSubscription ? 'true' : 'false',
      main_price_id: mainPriceId || '',
      addon_price_ids: addonPriceIds.join(','),
      addons: JSON.stringify(order_data?.addons || []),
      expedited_shipping: order_data?.expeditedShipping ? 'yes' : 'no',
      subtotal: order_data?.subtotal?.toString() || '',
      shipping_cost: order_data?.shippingCost?.toString() || '',
      total: order_data?.total?.toString() || '',
      shipping_address: JSON.stringify({
        line1: normalizedShipping.addressLine1,
        line2: normalizedShipping.addressLine2,
        city: normalizedShipping.city,
        state: normalizedShipping.state,
        zip: normalizedShipping.zipCode,
        country: normalizedShipping.country || 'US',
      }),
    };

    const isValidEmail = customer_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email);

    const paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: currency || 'usd',
      customer: customer.id,
      description,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: isSubscription ? 'off_session' : undefined,
      receipt_email: isValidEmail ? customer_email : undefined,
      metadata: orderMetadata,
      shipping: {
        name: customer_name || (isValidEmail ? customer_email : 'Customer'),
        address: {
          line1: normalizedShipping.addressLine1,
          line2: normalizedShipping.addressLine2 || undefined,
          city: normalizedShipping.city,
          state: normalizedShipping.state,
          postal_code: normalizedShipping.zipCode,
          country: normalizedShipping.country || 'US',
        },
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      customerId: customer.id,
      isSubscription,
    });
  } catch (error: any) {
    console.error('[EONMeds] Error creating payment intent:', error.message);
    return NextResponse.json(
      { error: 'Failed to create payment intent', message: error.message },
      { status: 500 },
    );
  }
}
