#!/usr/bin/env tsx
/**
 * Read-only diagnostic for a single WellMedR patient.
 *
 * - Loads patient by id (and verifies the Sarah Clark identity).
 * - Reports patient.stripeCustomerId and any local Subscription rows.
 * - Looks up the WellMedR Stripe Connect account for any active subscription
 *   matching the patient by either stored stripeCustomerId or by email.
 *
 * NO writes. Safe to run in production.
 *
 * Usage:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/diag-sarah-clark-subscription.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { decryptPHI } from '../src/lib/security/phi-encryption';
import type Stripe from 'stripe';

const PATIENT_ID = 104174;
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value);
  } catch {
    return value;
  }
}

async function loadPatient() {
  return prisma.patient.findUnique({
    where: { id: PATIENT_ID },
    select: {
      id: true,
      patientId: true,
      clinicId: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          planName: true,
          amount: true,
          interval: true,
          intervalCount: true,
          stripeSubscriptionId: true,
          startDate: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          canceledAt: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          stripeInvoiceNumber: true,
          stripeInvoiceId: true,
          status: true,
          amount: true,
          amountPaid: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });
}

async function main() {
  console.log(`\n=== Diagnostic for patient.id=${PATIENT_ID} (claimed: Sarah Clark / WEL-78964101) ===\n`);

  // Resolve WellMedR clinic id (clinic table is not clinic-isolated, safe outside context).
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });
  if (!clinic) {
    console.error('WellMedR clinic not found.');
    process.exit(1);
  }
  console.log(`WellMedR clinic resolved: id=${clinic.id} subdomain=${clinic.subdomain} name="${clinic.name}"\n`);

  const patient = await runWithClinicContext(clinic.id, () => loadPatient());

  if (!patient) {
    console.error(`Patient id=${PATIENT_ID} not found.`);
    process.exit(1);
  }

  const firstName = safeDecrypt(patient.firstName);
  const lastName = safeDecrypt(patient.lastName);
  const email = safeDecrypt(patient.email);

  console.log('PATIENT');
  console.log(`  id:                   ${patient.id}`);
  console.log(`  patientId (display):  ${patient.patientId}`);
  console.log(`  clinicId:             ${patient.clinicId}`);
  console.log(`  name:                 ${firstName} ${lastName}`);
  console.log(`  email:                ${email}`);
  console.log(`  stripeCustomerId:     ${patient.stripeCustomerId ?? '(null)'}`);

  console.log(`\nLOCAL SUBSCRIPTIONS (${patient.subscriptions.length})`);
  if (patient.subscriptions.length === 0) {
    console.log('  (none)  <-- this is why /api/patient-portal/subscription returns null');
  } else {
    for (const s of patient.subscriptions) {
      console.log(
        `  - id=${s.id} status=${s.status} plan="${s.planName}" amount=${s.amount}c interval=${s.intervalCount}/${s.interval} stripeSubId=${s.stripeSubscriptionId ?? '(none)'} created=${s.createdAt.toISOString()}`,
      );
    }
  }

  console.log('\nRECENT INVOICES (last 5)');
  for (const inv of patient.invoices) {
    console.log(
      `  - id=${inv.id} num=${inv.stripeInvoiceNumber ?? '(none)'} stripeInv=${inv.stripeInvoiceId ?? '(none)'} status=${inv.status} amount=${inv.amount}c paid=${inv.amountPaid ?? 0}c desc="${(inv.description ?? '').slice(0, 60)}" at=${inv.createdAt.toISOString()}`,
    );
  }

  if (!patient.clinicId) {
    console.error('\nNo clinicId on patient. Cannot resolve Stripe Connect account.');
    process.exit(2);
  }

  const stripeContext = await getStripeForClinic(patient.clinicId);
  const stripe = stripeContext.stripe;
  const opts: Stripe.RequestOptions | undefined = stripeContext.stripeAccountId
    ? { stripeAccount: stripeContext.stripeAccountId }
    : undefined;

  console.log('\nSTRIPE CONNECT CONTEXT');
  console.log(`  stripeAccountId:      ${stripeContext.stripeAccountId ?? '(platform/default)'}`);

  // 1) Try by stripeCustomerId (fast path)
  if (patient.stripeCustomerId) {
    console.log(`\nSTRIPE LOOKUP A: subscriptions for stored customerId=${patient.stripeCustomerId}`);
    try {
      const subs = await stripe.subscriptions.list(
        { customer: patient.stripeCustomerId, status: 'all', limit: 20 },
        opts,
      );
      if (subs.data.length === 0) {
        console.log('  No Stripe subscriptions on this customer (any status).');
      } else {
        for (const s of subs.data) {
          const item = s.items?.data?.[0];
          const price = item?.price;
          const product = price?.product;
          const productName =
            typeof product === 'object' && product && 'name' in product
              ? (product as Stripe.Product).name
              : (s.metadata?.planName as string) ?? '(unknown product)';
          console.log(
            `  - ${s.id} status=${s.status} amount=${price?.unit_amount}c interval=${price?.recurring?.interval_count}/${price?.recurring?.interval} product="${productName}" created=${new Date(s.created * 1000).toISOString()}`,
          );
          console.log(
            `      cancel_at_period_end=${s.cancel_at_period_end} canceled_at=${s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : '(null)'} cancel_at=${s.cancel_at ? new Date(s.cancel_at * 1000).toISOString() : '(null)'} ended_at=${s.ended_at ? new Date(s.ended_at * 1000).toISOString() : '(null)'} start_date=${s.start_date ? new Date(s.start_date * 1000).toISOString() : '(null)'} billing_cycle_anchor=${s.billing_cycle_anchor ? new Date(s.billing_cycle_anchor * 1000).toISOString() : '(null)'}`,
          );
          console.log(
            `      cancellation_details=${JSON.stringify((s as any).cancellation_details ?? null)} metadata=${JSON.stringify(s.metadata ?? {})}`,
          );
        }
      }
    } catch (err) {
      console.log(
        `  Lookup error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    console.log('\nSTRIPE LOOKUP A: skipped (no stripeCustomerId on patient).');
  }

  // Also list all invoices on this Stripe customer to confirm what's actually been billed.
  if (patient.stripeCustomerId) {
    console.log(`\nSTRIPE INVOICES on customerId=${patient.stripeCustomerId}`);
    try {
      const invs = await stripe.invoices.list(
        { customer: patient.stripeCustomerId, limit: 20 },
        opts,
      );
      if (invs.data.length === 0) {
        console.log('  (none)');
      } else {
        for (const inv of invs.data) {
          console.log(
            `  - ${inv.id} number=${inv.number} status=${inv.status} amount_paid=${inv.amount_paid}c amount_due=${inv.amount_due}c billing_reason=${inv.billing_reason} subscription=${typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription as any)?.id ?? '(null)'} created=${new Date(inv.created * 1000).toISOString()}`,
          );
        }
      }

      // Upcoming (would-be-next) invoice
      try {
        const upcoming = await (stripe.invoices as any).retrieveUpcoming(
          { customer: patient.stripeCustomerId },
          opts,
        );
        console.log(
          `\nUPCOMING Stripe invoice: amount_due=${upcoming.amount_due}c next_payment_attempt=${upcoming.next_payment_attempt ? new Date(upcoming.next_payment_attempt * 1000).toISOString() : '(null)'}`,
        );
      } catch (err: any) {
        console.log(
          `\nUPCOMING Stripe invoice: none (${err?.code ?? err?.message ?? 'unknown'})`,
        );
      }
    } catch (err) {
      console.log(
        `  Lookup error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2) Search by email on the Connect account
  if (email) {
    console.log(`\nSTRIPE LOOKUP B: customers on this Connect account with email="${email}"`);
    try {
      const customers = await stripe.customers.list({ email, limit: 10 }, opts);
      if (customers.data.length === 0) {
        console.log('  No Stripe customers found by email.');
      } else {
        for (const c of customers.data) {
          console.log(
            `  - ${c.id} name="${c.name ?? ''}" created=${new Date(c.created * 1000).toISOString()}`,
          );
          const subs = await stripe.subscriptions.list(
            { customer: c.id, status: 'all', limit: 20 },
            opts,
          );
          for (const s of subs.data) {
            const item = s.items?.data?.[0];
            const price = item?.price;
            const product = price?.product;
            const productName =
              typeof product === 'object' && product && 'name' in product
                ? (product as Stripe.Product).name
                : (s.metadata?.planName as string) ?? '(unknown product)';
            console.log(
              `      sub ${s.id} status=${s.status} amount=${price?.unit_amount}c interval=${price?.recurring?.interval_count}/${price?.recurring?.interval} product="${productName}" created=${new Date(s.created * 1000).toISOString()}`,
            );
          }
        }
      }
    } catch (err) {
      console.log(
        `  Lookup error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log('\n=== Done. (No writes performed.) ===\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
