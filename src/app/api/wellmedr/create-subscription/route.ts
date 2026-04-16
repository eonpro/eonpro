import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { createOrder } from '@/app/wellmedr-checkout/lib/order-store';
import { updateCheckoutFields } from '@/lib/wellmedr/airtableSync';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
  getWellMedrApplicationFee,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { getAddonStripePriceId } from '@/app/wellmedr-checkout/data/stripe-price-ids';
import type { AddonId } from '@/app/wellmedr-checkout/types/checkout';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const addressSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  apt: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zipCode: z.string().max(20).optional(),
}).optional();

const createSubscriptionSchema = z.object({
  priceId: z.string().min(1).max(200),
  customerEmail: z.string().email().max(254),
  customerName: z.string().max(200).optional(),
  cardholderName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  submissionId: z.string().max(500).optional(),
  productName: z.string().max(200).optional(),
  medicationType: z.string().max(50).optional(),
  planType: z.string().max(50).optional(),
  promotionCodeId: z.string().max(200).optional(),
  selectedAddons: z.array(z.enum(['nad_plus', 'sermorelin', 'b12', 'elite_bundle'])).optional(),
  airtableRecordId: z.string().max(200).startsWith('rec').optional(),
});

function getPaymentConfigId(): string | undefined {
  return process.env.WELLMEDR_STRIPE_PAYMENT_CONFIG_ID || process.env.STRIPE_PAYMENT_CONFIG_ID;
}

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      priceId,
      customerEmail,
      customerName,
      cardholderName,
      shippingAddress,
      billingAddress,
      submissionId,
      productName,
      medicationType,
      planType,
      promotionCodeId,
      selectedAddons,
      airtableRecordId,
    } = parsed.data;

    const addons: AddonId[] = selectedAddons || [];

    const stripe = getWellMedrConnectStripe();
    const connectOpts = getWellMedrConnectOpts();

    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 }, connectOpts);
    let customer: Stripe.Customer;

    const shippingData = shippingAddress
      ? {
          name: `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim(),
          address: {
            line1: shippingAddress.address || '',
            line2: shippingAddress.apt || '',
            city: shippingAddress.city || '',
            state: shippingAddress.state || '',
            postal_code: shippingAddress.zipCode || '',
            country: 'US',
          },
        }
      : undefined;

    if (customers.data.length > 0) {
      customer = (await stripe.customers.update(
        customers.data[0].id,
        {
          name: customerName,
          ...(shippingData ? { shipping: shippingData } : {}),
          metadata: { submissionId: submissionId || '', productName: productName || '', medicationType: medicationType || '', planType: planType || '' },
        },
        connectOpts
      )) as Stripe.Customer;
    } else {
      customer = await stripe.customers.create(
        {
          email: customerEmail,
          name: customerName,
          ...(shippingData ? { shipping: shippingData } : {}),
          metadata: { submissionId: submissionId || '', productName: productName || '', medicationType: medicationType || '', planType: planType || '' },
        },
        connectOpts
      );
    }

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
        submissionId: submissionId || '',
        productName: productName || '',
        medicationType: medicationType || '',
        planType: planType || '',
        cardholderName: cardholderName || customerName || '',
        shippingAddress: JSON.stringify(shippingAddress || {}),
        billingAddress: JSON.stringify(billingAddress || {}),
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
        submissionId: submissionId || '',
        subscriptionId: subscription.id,
        customerId: customer.id,
        customerEmail,
        productName: productName || '',
        medicationType: medicationType || '',
        planType: planType || '',
        priceId,
        amount: 0,
        shippingAddress: shippingAddress || {},
        billingAddress: billingAddress || {},
        selectedAddons: addons,
      }).catch((err) => {
        Sentry.captureException(err, {
          tags: { module: 'wellmedr-checkout', route: 'create-subscription', op: 'createOrder' },
        });
      });

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
      const invoicePayments = await stripe.invoicePayments.list(
        { invoice: latestInvoice.id, limit: 1 },
        connectOpts
      );
      if (invoicePayments.data.length > 0) {
        const paymentRecord = invoicePayments.data[0];
        if (paymentRecord.payment?.type === 'payment_intent') {
          const piId = (paymentRecord.payment as { type: 'payment_intent'; payment_intent: string })
            .payment_intent;
          const pi = await stripe.paymentIntents.retrieve(piId, {}, connectOpts as any);
          clientSecret = pi.client_secret;
        }
      }
    }

    const amount = latestInvoice?.amount_due ? latestInvoice.amount_due / 100 : 0;

    createOrder({
      submissionId: submissionId || '',
      subscriptionId: subscription.id,
      customerId: customer.id,
      customerEmail,
      productName: productName || '',
      medicationType: medicationType || '',
      planType: planType || '',
      priceId,
      amount,
      shippingAddress: shippingAddress || {},
      billingAddress: billingAddress || {},
      selectedAddons: addons,
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { module: 'wellmedr-checkout', route: 'create-subscription', op: 'createOrder' },
      });
    });

    if (airtableRecordId) {
      updateCheckoutFields(airtableRecordId, {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        product: productName,
        medicationType,
        plan: planType,
        price: amount,
        customerEmail,
        customerName: cardholderName || customerName,
        cardholderName,
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : undefined,
        billingAddress: billingAddress ? JSON.stringify(billingAddress) : undefined,
        paymentStatus: 'pending',
        orderStatus: 'created',
      }).catch((err) => {
        Sentry.captureException(err, {
          tags: { module: 'wellmedr-checkout', route: 'create-subscription', op: 'airtableSync' },
        });
      });
    }

    return NextResponse.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret,
      status: subscription.status,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'create-subscription' },
    });
    logger.error('[wellmedr/create-subscription] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to create subscription. Please try again.' },
      { status: 500 }
    );
  }
}

export const POST = rateLimit({ max: 5, windowMs: 60_000 })(handler);
