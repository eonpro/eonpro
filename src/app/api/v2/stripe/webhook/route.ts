import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import Stripe from "stripe";
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled("STRIPE_SUBSCRIPTIONS")) {
      return NextResponse.json(
        { error: "Subscriptions are not enabled" },
        { status: 403 }
      );
    }

    const stripe = getStripe();
    const body = await req.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe signature" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Webhook signature verification failed: ${errorMessage}`);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.debug(`[STRIPE_WEBHOOK] Subscription ${event.type}:`, { id: subscription.id });
        
        // Update subscription in database
        // await prisma.subscription.upsert({
        //   where: { stripeSubscriptionId: subscription.id },
        //   update: {
        //     status: subscription.status,
        //     currentPeriodStart: new Date(subscription.current_period_start * 1000),
        //     currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        //   },
        //   create: {
        //     stripeSubscriptionId: subscription.id,
        //     stripeCustomerId: subscription.customer as string,
        //     status: subscription.status,
        //     priceId: subscription.items.data[0].price.id,
        //     currentPeriodStart: new Date(subscription.current_period_start * 1000),
        //     currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        //   },
        // });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.debug(`[STRIPE_WEBHOOK] Subscription cancelled:`, { value: subscription.id });
        
        // Update subscription status in database
        // await prisma.subscription.update({
        //   where: { stripeSubscriptionId: subscription.id },
        //   data: { 
        //     status: "cancelled",
        //     cancelledAt: new Date(),
        //   },
        // });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.debug(`[STRIPE_WEBHOOK] Payment succeeded for invoice:`, { value: invoice.id });
        
        // Record successful payment
        // await prisma.payment.create({
        //   data: {
        //     stripeInvoiceId: invoice.id,
        //     stripeCustomerId: invoice.customer as string,
        //     amount: invoice.amount_paid,
        //     status: "succeeded",
        //     paidAt: new Date(invoice.status_transitions.paid_at! * 1000),
        //   },
        // });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.debug(`[STRIPE_WEBHOOK] Payment failed for invoice:`, { value: invoice.id });
        
        // Handle failed payment
        // You might want to notify the customer or suspend their access
        // await prisma.payment.create({
        //   data: {
        //     stripeInvoiceId: invoice.id,
        //     stripeCustomerId: invoice.customer as string,
        //     amount: invoice.amount_due,
        //     status: "FAILED" as any,
        //   },
        // });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.debug(`[STRIPE_WEBHOOK] Checkout completed:`, { value: session.id });
        
        // Handle successful checkout
        if (session.subscription) {
          // Subscription checkout completed
          logger.debug("Subscription created:", { value: session.subscription });
        }
        break;
      }

      default:
        logger.debug(`[STRIPE_WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("[STRIPE_WEBHOOK_ERROR]", error);
    return NextResponse.json(
      { error: errorMessage || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
