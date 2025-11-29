import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

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
    const { priceId, customerId, patientId } = await req.json();

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID is required" },
        { status: 400 }
      );
    }

    let stripeCustomerId = customerId;

    // If no Stripe customer ID, create a new customer
    if (!stripeCustomerId && patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
      });

      if (patient) {
        const customer = await stripe.customers.create({
          email: patient.email || undefined,
          name: `${patient.firstName} ${patient.lastName}`,
          metadata: {
            patientId: patient.id.toString(),
          } as any,
        });

        stripeCustomerId = customer.id;

        // Save the Stripe customer ID to the patient record
        // Note: You'll need to add a stripeCustomerId field to your Patient model
        // await prisma.patient.update({
        //   where: { id: patient.id },
        //   data: { stripeCustomerId: customer.id },
        // });
      }
    }

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    });

    // Get the client secret for payment
    let clientSecret = "";
    
    if (subscription.pending_setup_intent) {
      // For trials or free plans
      const setupIntent = subscription.pending_setup_intent as any;
      clientSecret = setupIntent.client_secret;
    } else if (subscription.latest_invoice) {
      // For paid subscriptions
      const invoice = subscription.latest_invoice as any;
      if (invoice.payment_intent) {
        clientSecret = invoice.payment_intent.client_secret;
      }
    }

    // Store subscription info in database (optional)
    // await prisma.subscription.create({
    //   data: {
    //     stripeSubscriptionId: subscription.id,
    //     stripeCustomerId: stripeCustomerId,
    //     patientId: patientId,
    //     status: subscription.status,
    //     priceId: priceId,
    //     currentPeriodStart: new Date(subscription.current_period_start * 1000),
    //     currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    //   },
    // });

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: clientSecret,
      status: subscription.status,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("[STRIPE_CREATE_SUBSCRIPTION]", error);
    return NextResponse.json(
      { error: errorMessage || "Failed to create subscription" },
      { status: 500 }
    );
  }
}
