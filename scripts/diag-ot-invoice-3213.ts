#!/usr/bin/env tsx
/**
 * Diagnostic: OT invoice 3213 / INV-19036 / Order #16631 / pi_3TOk6oDQIH4O9Fhr05oblLJx
 *
 * The user reported five conflicting dollar figures for the same Stripe charge:
 *   Stripe gross   $649.00   (PaymentIntent pi_3TOk6oDQIH4O9Fhr05oblLJx)
 *   Stripe refund -$200.00   (Apr 27 2026)
 *   Patient Billing tab line item   $649.00
 *   Patient Billing tab header      amountPaid $249.00
 *   OT editor "Patient gross"       $249.00   (negative net to clinic -$58.41)
 *
 * This script gathers the ground-truth values for every layer involved
 * (Order → Invoice → InvoiceItem → Payment → PaymentReconciliation → live
 * Stripe ledger) and prints a side-by-side comparison so the RCA can
 * definitively name which code path produced each wrong number.
 *
 * READ-ONLY. PHI-safe (no name/email/DOB in output — only IDs and dollar
 * cents). Run against production:
 *
 *   tsx scripts/diag-ot-invoice-3213.ts
 *
 * Optional overrides via argv:
 *   tsx scripts/diag-ot-invoice-3213.ts --invoice 19036 --order 16631 \
 *       --pi pi_3TOk6oDQIH4O9Fhr05oblLJx --customer cus_T4tVdXBlZbpgQj
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

import { basePrisma } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { resolveOtPatientGrossCents } from '../src/lib/invoices/ot-stripe-sale-alignment';

// ---------- argv parsing (defaults to the values from the user's screenshots) ----------
function getArg(name: string, fallback: string): string {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const INVOICE_DB_ID = Number(getArg('invoice', '19036'));
const ORDER_ID = Number(getArg('order', '16631'));
let PAYMENT_INTENT_ID = getArg('pi', '');
let STRIPE_CUSTOMER_ID = getArg('customer', '');
const OT_SUBDOMAIN = 'ot';

function fmt(cents: number | null | undefined): string {
  if (cents == null) return 'null';
  return `${cents}c ($${(cents / 100).toFixed(2)})`;
}

function hr(label?: string) {
  console.log('');
  console.log('='.repeat(80));
  if (label) console.log(label);
  if (label) console.log('='.repeat(80));
}

async function main() {
  console.log(`Inputs: invoiceDbId=${INVOICE_DB_ID} orderId=${ORDER_ID} pi=${PAYMENT_INTENT_ID} customer=${STRIPE_CUSTOMER_ID}`);

  // ---------- STEP 1: locate OT clinic ----------
  hr('STEP 1 — Locate OT clinic');
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_SUBDOMAIN, status: 'ACTIVE' },
    select: {
      id: true,
      subdomain: true,
      stripeAccountId: true,
      stripePlatformAccount: true,
    },
  });
  if (!clinic) {
    console.error(`No active clinic with subdomain "${OT_SUBDOMAIN}". Aborting.`);
    process.exitCode = 1;
    return;
  }
  console.log(`clinicId=${clinic.id} subdomain=${clinic.subdomain} stripeAccountId=${clinic.stripeAccountId ?? 'null'} stripePlatformAccount=${clinic.stripePlatformAccount ?? 'null'}`);

  // ---------- STEP 2: Invoice row ----------
  hr(`STEP 2 — Invoice id=${INVOICE_DB_ID}`);
  const invoice = await basePrisma.invoice.findUnique({
    where: { id: INVOICE_DB_ID },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      orderId: true,
      stripeInvoiceId: true,
      stripeInvoiceNumber: true,
      description: true,
      amount: true,
      amountDue: true,
      amountPaid: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      paidAt: true,
      lineItems: true,
      metadata: true,
    },
  });
  if (!invoice) {
    console.error(`Invoice id=${INVOICE_DB_ID} not found. Aborting.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Invoice.id            = ${invoice.id}`);
  console.log(`Invoice.clinicId      = ${invoice.clinicId} (OT=${clinic.id} ${invoice.clinicId === clinic.id ? 'MATCH' : 'MISMATCH'})`);
  console.log(`Invoice.patientId     = ${invoice.patientId}`);
  console.log(`Invoice.orderId       = ${invoice.orderId} (expected ${ORDER_ID} ${invoice.orderId === ORDER_ID ? 'MATCH' : 'MISMATCH'})`);
  console.log(`Invoice.stripeInvoiceId     = ${invoice.stripeInvoiceId ?? 'null'}`);
  console.log(`Invoice.stripeInvoiceNumber = ${invoice.stripeInvoiceNumber ?? 'null'}`);
  console.log(`Invoice.description   = ${invoice.description ?? 'null'}`);
  console.log(`Invoice.status        = ${invoice.status}`);
  console.log(`Invoice.createdAt     = ${invoice.createdAt.toISOString()}`);
  console.log(`Invoice.updatedAt     = ${invoice.updatedAt.toISOString()} ${invoice.updatedAt.getTime() !== invoice.createdAt.getTime() ? '(MUTATED after creation)' : ''}`);
  console.log(`Invoice.paidAt        = ${invoice.paidAt?.toISOString() ?? 'null'}`);
  console.log(`Invoice.amount        = ${fmt(invoice.amount)}`);
  console.log(`Invoice.amountDue     = ${fmt(invoice.amountDue)}`);
  console.log(`Invoice.amountPaid    = ${fmt(invoice.amountPaid)}`);
  console.log(`Invoice.currency      = ${invoice.currency}`);
  if (invoice.lineItems) {
    console.log(`Invoice.lineItems (JSON): ${JSON.stringify(invoice.lineItems)}`);
  }
  if (invoice.metadata) {
    console.log(`Invoice.metadata  (JSON): ${JSON.stringify(invoice.metadata)}`);
  }

  // ---------- STEP 3: InvoiceItem rows ----------
  hr(`STEP 3 — InvoiceItem rows for invoiceId=${INVOICE_DB_ID}`);
  const items = await basePrisma.invoiceItem.findMany({
    where: { invoiceId: INVOICE_DB_ID },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      metadata: true,
    },
  });
  let itemSum = 0;
  if (items.length === 0) {
    console.log('No InvoiceItem rows.');
  } else {
    for (const it of items) {
      itemSum += it.amount;
      console.log(
        `  itemId=${it.id} productId=${it.productId ?? 'null'} qty=${it.quantity} unit=${fmt(it.unitPrice)} amount=${fmt(it.amount)} desc="${it.description}"`
      );
    }
  }
  console.log(`SUM(InvoiceItem.amount) = ${fmt(itemSum)}`);

  // ---------- STEP 4: Payment rows for this invoice + this PI ----------
  hr(`STEP 4 — Payment rows (invoiceId=${INVOICE_DB_ID}${PAYMENT_INTENT_ID ? ` OR pi=${PAYMENT_INTENT_ID}` : ''})`);
  const payments = await basePrisma.payment.findMany({
    where: PAYMENT_INTENT_ID
      ? {
          OR: [
            { invoiceId: INVOICE_DB_ID },
            { stripePaymentIntentId: PAYMENT_INTENT_ID },
          ],
        }
      : { invoiceId: INVOICE_DB_ID },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      invoiceId: true,
      subscriptionId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      stripeRefundId: true,
      amount: true,
      refundedAmount: true,
      refundedAt: true,
      status: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
      description: true,
    },
  });
  let succeededAmountSum = 0;
  let succeededRefundedSum = 0;
  if (payments.length === 0) {
    console.log('NO Payment rows match. (`loadOtPaymentNetCentsByInvoiceId` would return empty → editor falls through to invoice_sync.)');
  } else {
    for (const p of payments) {
      console.log(
        `  paymentId=${p.id} status=${p.status} invoiceId=${p.invoiceId ?? 'null'} pi=${p.stripePaymentIntentId ?? 'null'} charge=${p.stripeChargeId ?? 'null'}`
      );
      console.log(
        `    amount=${fmt(p.amount)} refundedAmount=${fmt(p.refundedAmount)} refundedAt=${p.refundedAt?.toISOString() ?? 'null'} stripeRefundId=${p.stripeRefundId ?? 'null'}`
      );
      console.log(
        `    paidAt=${p.paidAt?.toISOString() ?? 'null'} createdAt=${p.createdAt.toISOString()} desc="${p.description ?? ''}"`
      );
      if (p.status === 'SUCCEEDED' && p.invoiceId === INVOICE_DB_ID) {
        succeededAmountSum += p.amount;
        succeededRefundedSum += p.refundedAmount ?? 0;
      }
    }
  }
  console.log(`SUM(SUCCEEDED Payment.amount where invoiceId=${INVOICE_DB_ID})         = ${fmt(succeededAmountSum)}`);
  console.log(`SUM(SUCCEEDED Payment.refundedAmount where invoiceId=${INVOICE_DB_ID}) = ${fmt(succeededRefundedSum)}`);
  console.log(`Implied true net (Payment.amount − Payment.refundedAmount)              = ${fmt(succeededAmountSum - succeededRefundedSum)}`);

  // Auto-derive PI/customer from the first Payment row if not supplied via argv.
  if (!PAYMENT_INTENT_ID && payments.length > 0 && payments[0].stripePaymentIntentId) {
    PAYMENT_INTENT_ID = payments[0].stripePaymentIntentId;
    console.log(`(auto-derived PAYMENT_INTENT_ID=${PAYMENT_INTENT_ID} from Payment row)`);
  }

  // ---------- STEP 5: PaymentReconciliation rows ----------
  hr(`STEP 5 — PaymentReconciliation rows`);
  const reconciliations = await basePrisma.paymentReconciliation.findMany({
    where: {
      OR: [
        { invoiceId: INVOICE_DB_ID },
        { stripePaymentIntentId: PAYMENT_INTENT_ID },
        { stripeCustomerId: STRIPE_CUSTOMER_ID, createdAt: { gte: new Date('2026-04-01') } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      clinicId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      stripeInvoiceId: true,
      stripeCustomerId: true,
      stripeEventId: true,
      stripeEventType: true,
      amount: true,
      currency: true,
      customerName: true,
      createdAt: true,
    },
  });
  if (reconciliations.length === 0) {
    console.log('No PaymentReconciliation rows. (Webhook may have never been ingested OR was matched to a different invoiceId.)');
  } else {
    for (const r of reconciliations) {
      console.log(
        `  reconId=${r.id} type=${r.stripeEventType} amount=${fmt(r.amount)} pi=${r.stripePaymentIntentId ?? 'null'} charge=${r.stripeChargeId ?? 'null'} invId=${r.stripeInvoiceId ?? 'null'}`
      );
      console.log(`    eventId=${r.stripeEventId} customerName="${r.customerName ?? ''}" at=${r.createdAt.toISOString()}`);
    }
    const refundEvents = reconciliations.filter((r) => /refund/i.test(r.stripeEventType));
    console.log(`-> Refund-related event count: ${refundEvents.length} ${refundEvents.length === 0 ? '(REFUND WEBHOOK NEVER INGESTED LOCALLY)' : ''}`);
  }

  // ---------- STEP 6: Stripe-side ground truth ----------
  hr('STEP 6 — Live Stripe ledger (OT dedicated account)');
  const ctx = await getStripeForClinic(clinic.id);
  if (!ctx.stripe) {
    console.log('No Stripe client resolved for OT clinic. Skipping Stripe-side fetches.');
  } else {
    console.log(`Stripe context: stripeAccountId=${ctx.stripeAccountId ?? 'null (dedicated key)'} isPlatform=${ctx.isPlatformAccount ?? false}`);
    const reqOpts = ctx.stripeAccountId ? { stripeAccount: ctx.stripeAccountId } : {};

    try {
      const pi = await ctx.stripe.paymentIntents.retrieve(
        PAYMENT_INTENT_ID,
        { expand: ['latest_charge', 'invoice'] },
        reqOpts
      );
      console.log(`PaymentIntent ${pi.id}:`);
      console.log(`  amount=${fmt(pi.amount)} amount_received=${fmt(pi.amount_received)} status=${pi.status} currency=${pi.currency}`);
      console.log(`  invoice=${typeof pi.invoice === 'string' ? pi.invoice : (pi.invoice as any)?.id ?? 'null'}`);
      const lc = pi.latest_charge;
      if (lc && typeof lc !== 'string') {
        console.log(`  latest_charge ${lc.id}: amount=${fmt(lc.amount)} amount_refunded=${fmt(lc.amount_refunded)} captured=${lc.captured} refunded=${lc.refunded} status=${lc.status}`);
        console.log(`  description=${lc.description ?? ''}`);
      }
    } catch (err) {
      console.log(`PaymentIntent retrieve FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const charges = await ctx.stripe.charges.list(
        { payment_intent: PAYMENT_INTENT_ID, limit: 10 },
        reqOpts
      );
      console.log(`Charges for ${PAYMENT_INTENT_ID}: ${charges.data.length}`);
      for (const c of charges.data) {
        console.log(`  charge ${c.id}: amount=${fmt(c.amount)} amount_refunded=${fmt(c.amount_refunded)} status=${c.status} captured=${c.captured} refunded=${c.refunded}`);
        try {
          const refunds = await ctx.stripe.refunds.list({ charge: c.id, limit: 10 }, reqOpts);
          console.log(`    refunds: ${refunds.data.length}`);
          for (const rf of refunds.data) {
            console.log(`      refund ${rf.id}: amount=${fmt(rf.amount)} status=${rf.status} reason=${rf.reason ?? ''} created=${new Date(rf.created * 1000).toISOString()}`);
          }
        } catch (rfErr) {
          console.log(`    refunds.list FAILED: ${rfErr instanceof Error ? rfErr.message : String(rfErr)}`);
        }
      }
    } catch (err) {
      console.log(`charges.list FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (invoice.stripeInvoiceId) {
      try {
        const stripeInv = await ctx.stripe.invoices.retrieve(invoice.stripeInvoiceId, {}, reqOpts);
        console.log(`Stripe Invoice ${stripeInv.id}: amount_due=${fmt(stripeInv.amount_due)} amount_paid=${fmt(stripeInv.amount_paid)} amount_remaining=${fmt(stripeInv.amount_remaining)} status=${stripeInv.status} number=${stripeInv.number}`);
      } catch (err) {
        console.log(`invoices.retrieve FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log('No Invoice.stripeInvoiceId stored locally — invoice was not synced from a Stripe invoice (likely created from a PaymentIntent / cart).');
    }
  }

  // ---------- STEP 7: Reproduce OT editor's resolveOtPatientGrossCents() ----------
  hr('STEP 7 — Reproduce resolveOtPatientGrossCents() with actual DB inputs');

  // Reproduce loadOtPaymentNetCentsByInvoiceId locally (single-invoice version)
  const map = new Map<number, number>();
  for (const p of payments) {
    if (p.status !== 'SUCCEEDED') continue;
    if (p.invoiceId !== INVOICE_DB_ID) continue;
    if (p.amount <= 0) continue;
    map.set(INVOICE_DB_ID, (map.get(INVOICE_DB_ID) ?? 0) + p.amount);
  }
  console.log(`paymentNetCentsByInvoiceId.get(${INVOICE_DB_ID}) = ${map.get(INVOICE_DB_ID) ?? 'undefined'}`);

  // The fallback used by the OT generation service prefers amountPaid, then amountDue.
  const invoiceGrossFallback = (inv: { amountPaid: number; amountDue: number | null }) =>
    inv.amountPaid > 0 ? inv.amountPaid : (inv.amountDue ?? 0);

  const resolved = resolveOtPatientGrossCents({
    invoiceDbId: INVOICE_DB_ID,
    invoiceAmountPaid: invoice.amountPaid,
    invoiceAmountDue: invoice.amountDue,
    paymentNetCentsByInvoiceId: map,
    invoiceGrossFallback,
  });
  console.log(`resolveOtPatientGrossCents -> cents=${fmt(resolved.cents)} source=${resolved.source}`);

  // ---------- STEP 8: Reconciliation summary ----------
  hr('STEP 8 — Side-by-side reconciliation');
  console.log('Layer                                    Value');
  console.log('-'.repeat(60));
  console.log(`Invoice.amount                           ${fmt(invoice.amount)}`);
  console.log(`Invoice.amountDue                        ${fmt(invoice.amountDue)}`);
  console.log(`Invoice.amountPaid                       ${fmt(invoice.amountPaid)}`);
  console.log(`SUM(InvoiceItem.amount)                  ${fmt(itemSum)}`);
  console.log(`SUM(SUCCEEDED Payment.amount)            ${fmt(succeededAmountSum)}`);
  console.log(`SUM(SUCCEEDED Payment.refundedAmount)    ${fmt(succeededRefundedSum)}`);
  console.log(`Implied net (Payment.amount − refunded)  ${fmt(succeededAmountSum - succeededRefundedSum)}`);
  console.log(`OT editor resolved patientGross          ${fmt(resolved.cents)} (source=${resolved.source})`);
  console.log('');
  console.log('Stripe ledger (truth):');
  console.log('  Expected gross  : 64900c ($649.00)');
  console.log('  Expected refund : 20000c ($200.00)');
  console.log('  Expected net    : 44900c ($449.00)');

  hr('DONE');
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => basePrisma.$disconnect());
