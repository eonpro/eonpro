import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.EONMEDS_STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
  }
  return _stripe;
}

// TODO: Add rate limiting (e.g. upstash/ratelimit) before production launch

async function getOrCreateCustomer(
  email: string | undefined,
  name?: string,
  phone?: string,
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country?: string;
  },
  metadata?: Record<string, string>,
) {
  const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (isValidEmail) {
    const existingCustomers = await getStripe().customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const customer = await getStripe().customers.update(existingCustomers.data[0].id, {
        name: name || undefined,
        phone: phone || undefined,
        address: address || undefined,
        metadata: metadata || {},
      });
      return customer;
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
    } = body;

    if (!amount || amount < 50) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (
      !shipping_address ||
      typeof shipping_address !== 'object' ||
      !shipping_address.addressLine1?.trim?.() ||
      !shipping_address.city?.trim?.() ||
      !shipping_address.state?.trim?.() ||
      !shipping_address.zipCode?.trim?.()
    ) {
      return NextResponse.json(
        {
          error: 'Shipping address required',
          message: 'Please enter a complete shipping address (street, city, state, zip).',
        },
        { status: 400 },
      );
    }

    const normalizedShippingAddress = {
      addressLine1: String(shipping_address.addressLine1 || '').trim(),
      addressLine2: String(shipping_address.addressLine2 || '').trim(),
      city: String(shipping_address.city || '').trim(),
      state: String(shipping_address.state || '').trim().toUpperCase(),
      zipCode: String(shipping_address.zipCode || '').trim(),
      country: String(shipping_address.country || 'US').trim().toUpperCase(),
    };

    const billingAddress = {
      line1: normalizedShippingAddress.addressLine1,
      line2: normalizedShippingAddress.addressLine2 || undefined,
      city: normalizedShippingAddress.city,
      state: normalizedShippingAddress.state,
      postal_code: normalizedShippingAddress.zipCode,
      country: normalizedShippingAddress.country || 'US',
    };

    const customer = await getOrCreateCustomer(
      customer_email,
      customer_name,
      customer_phone,
      billingAddress,
      {
        medication: order_data?.medication || '',
        plan: order_data?.plan || '',
        source: 'eonpro_checkout',
      },
    );

    const planType = order_data?.plan || '';
    const isSubscription = planType && !planType.toLowerCase().includes('one time');

    const normalizedPlanName = (() => {
      const p = (order_data?.plan || '').toLowerCase();
      if (p.includes('mensual') || p.includes('monthly') || p.includes('recurrente') || p.includes('recurring'))
        return 'Monthly Recurring';
      if (p.includes('3') && (p.includes('mes') || p.includes('month')))
        return '3-Month Plan';
      if (p.includes('6') && (p.includes('mes') || p.includes('month')))
        return '6-Month Plan';
      if (p.includes('única') || p.includes('one-time') || p.includes('onetime'))
        return 'One-Time Purchase';
      return order_data?.plan || 'Monthly Recurring';
    })();

    const description = `${order_data?.medication || 'Medication'} - ${normalizedPlanName}${
      order_data?.addons?.length > 0 ? ` + ${order_data.addons.join(', ')}` : ''
    }${order_data?.expeditedShipping ? ' + Expedited Shipping' : ''}`;

    const nameParts = (customer_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const isValidEmail = customer_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email);

    const orderMetadata: Record<string, string> = {
      ...metadata,
      customer_email: String(customer_email || ''),
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_phone: String(customer_phone || ''),
      customer_id: customer.id,
      language: String(language || 'en'),
      source: 'eonpro_checkout',
      shipping_line1: normalizedShippingAddress.addressLine1,
      shipping_city: normalizedShippingAddress.city,
      shipping_state: normalizedShippingAddress.state,
      shipping_zip: normalizedShippingAddress.zipCode,
      timestamp: new Date().toISOString(),
      medication: order_data?.medication || '',
      plan: normalizedPlanName,
      is_subscription: isSubscription ? 'true' : 'false',
      addons: JSON.stringify(order_data?.addons || []),
      expedited_shipping: order_data?.expeditedShipping ? 'yes' : 'no',
      subtotal: order_data?.subtotal?.toString() || '',
      shipping_cost: order_data?.shippingCost?.toString() || '',
      total: order_data?.total?.toString() || '',
      shipping_address: JSON.stringify({
        line1: normalizedShippingAddress.addressLine1,
        line2: normalizedShippingAddress.addressLine2,
        city: normalizedShippingAddress.city,
        state: normalizedShippingAddress.state,
        zip: normalizedShippingAddress.zipCode,
        country: normalizedShippingAddress.country || 'US',
      }),
    };

    const paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: currency || 'usd',
      customer: customer.id,
      description,
      payment_method_types: ['card', 'link'],
      setup_future_usage: isSubscription ? 'off_session' : undefined,
      receipt_email: isValidEmail ? customer_email : undefined,
      metadata: orderMetadata,
      shipping: {
        name: customer_name || (isValidEmail ? customer_email : 'Customer'),
        address: {
          line1: normalizedShippingAddress.addressLine1,
          line2: normalizedShippingAddress.addressLine2 || undefined,
          city: normalizedShippingAddress.city,
          state: normalizedShippingAddress.state,
          postal_code: normalizedShippingAddress.zipCode,
          country: normalizedShippingAddress.country || 'US',
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating payment intent:', { error: message });
    return NextResponse.json(
      { error: 'Failed to create payment intent', message },
      { status: 500 },
    );
  }
}
