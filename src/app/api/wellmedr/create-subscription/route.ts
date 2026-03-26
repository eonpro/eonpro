import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createOrder } from '@/app/wellmedr-checkout/lib/order-store';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
  getWellMedrApplicationFee,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { getAddonStripePriceId } from '@/app/wellmedr-checkout/data/stripe-price-ids';
import type { AddonId } from '@/app/wellmedr-checkout/types/checkout';

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = process.env.NODE_ENV === 'production' ? 5 : 100;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getPaymentConfigId(): string | undefined {
  return process.env.WELLMEDR_STRIPE_PAYMENT_CONFIG_ID
    || process.env.STRIPE_PAYMENT_CONFIG_ID;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (entry && now < entry.resetAt) {
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  } else {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  }

  try {
    const body = await req.json();
    const {
      priceId, customerEmail, customerName, cardholderName,
      shippingAddress, billingAddress, submissionId,
      productName, medicationType, planType, promotionCodeId,
      selectedAddons,
    } = body;

    const addons: AddonId[] = Array.isArray(selectedAddons) ? selectedAddons : [];

    if (!priceId || !customerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();

    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 }, connectOpts);
    let customer: Stripe.Customer;

    const shippingData = shippingAddress ? {
      name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
      address: {
        line1: shippingAddress.address,
        line2: shippingAddress.apt || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.zipCode,
        country: 'US',
      },
    } : undefined;

    if (customers.data.length > 0) {
      customer = await stripe.customers.update(customers.data[0].id, {
        name: customerName,
        ...(shippingData ? { shipping: shippingData } : {}),
        metadata: { submissionId, productName, medicationType, planType },
      }, connectOpts) as Stripe.Customer;
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        ...(shippingData ? { shipping: shippingData } : {}),
        metadata: { submissionId, productName, medicationType, planType },
      }, connectOpts);
    }

    // Build addon invoice items — flat charges added to each billing cycle
    const addonInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[] = [];
    for (const addonId of addons) {
      const addonPriceId = getAddonStripePriceId(addonId);
      if (addonPriceId) {
        addonInvoiceItems.push({ price: addonPriceId });
      }
    }

    const applicationFee = getWellMedrApplicationFee(0);
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customer.id,
      items: [{ price: priceId }],
      ...(addonInvoiceItems.length > 0 ? { add_invoice_items: addonInvoiceItems } : {}),
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        ...(getPaymentConfigId() ? { payment_method_configuration: getPaymentConfigId() } : {}),
      },
      metadata: {
        submissionId,
        productName,
        medicationType,
        planType,
        cardholderName: cardholderName || customerName,
        shippingAddress: JSON.stringify(shippingAddress),
        billingAddress: JSON.stringify(billingAddress),
        ...(addons.length > 0 ? { selectedAddons: JSON.stringify(addons) } : {}),
      },
      expand: ['latest_invoice'],
    };

    if (applicationFee) {
      (subscriptionParams as any).payment_intent_data = {
        application_fee_amount: applicationFee,
      };
    }

    if (promotionCodeId) {
      subscriptionParams.discounts = [{ promotion_code: promotionCodeId }];
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams, connectOpts);

    let clientSecret: string | null = null;

    if (subscription.status === 'active') {
      createOrder({
        submissionId,
        subscriptionId: subscription.id,
        customerId: customer.id,
        customerEmail,
        productName, medicationType, planType,
        priceId,
        amount: 0,
        shippingAddress: shippingAddress || {},
        billingAddress: billingAddress || {},
        selectedAddons: addons,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        subscriptionId: subscription.id,
        customerId: customer.id,
        clientSecret: null,
        status: subscription.status,
      });
    }

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
    if (latestInvoice?.id) {
      const invoicePayments = await stripe.invoicePayments.list({ invoice: latestInvoice.id, limit: 1 }, connectOpts);
      if (invoicePayments.data.length > 0) {
        const paymentRecord = invoicePayments.data[0];
        if (paymentRecord.payment?.type === 'payment_intent') {
          const piId = (paymentRecord.payment as { type: 'payment_intent'; payment_intent: string }).payment_intent;
          const pi = await stripe.paymentIntents.retrieve(piId, connectOpts);
          clientSecret = pi.client_secret;
        }
      }
    }

    const amount = latestInvoice?.amount_due ? latestInvoice.amount_due / 100 : 0;

    createOrder({
      submissionId,
      subscriptionId: subscription.id,
      customerId: customer.id,
      customerEmail,
      productName, medicationType, planType,
      priceId,
      amount,
      shippingAddress: shippingAddress || {},
      billingAddress: billingAddress || {},
      selectedAddons: addons,
    }).catch(() => {});

    return NextResponse.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret,
      status: subscription.status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    console.error('[wellmedr/create-subscription]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
