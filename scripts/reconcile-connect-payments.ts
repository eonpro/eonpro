#!/usr/bin/env tsx
/**
 * Connect Account Payment Reconciliation
 * =======================================
 *
 * Reconciles payments from Stripe Connect accounts (e.g., Wellmedr) that were
 * missed during the webhook outage (Feb 23 – Mar 1, 2026).
 *
 * What it does:
 *   1. Lists all succeeded PaymentIntents + paid Invoices from the connected account
 *   2. Cross-references with local Payment / PaymentReconciliation / Invoice tables
 *   3. For missing payments: runs processStripePayment to match → patient → invoice
 *   4. Reports a full summary of matched, created, skipped, and failed
 *
 * Usage:
 *   # Dry run (default) — report only, no DB writes
 *   npx tsx scripts/reconcile-connect-payments.ts
 *
 *   # Execute — actually process missing payments
 *   npx tsx scripts/reconcile-connect-payments.ts --execute
 *
 *   # Custom date range (default: last 14 days)
 *   npx tsx scripts/reconcile-connect-payments.ts --since 2026-02-20 --execute
 *
 *   # Specific connected account
 *   npx tsx scripts/reconcile-connect-payments.ts --account acct_1SrNVgDfH4PWyxxd --execute
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/reconcile-connect-payments.ts --execute
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import Stripe from 'stripe';
import { prisma, runWithClinicContext } from '../src/lib/db';

const BATCH_SIZE = 100;
const DEFAULT_LOOKBACK_DAYS = 14;

interface ReconResult {
  stripePaymentsFound: number;
  stripeInvoicesFound: number;
  alreadyInDb: number;
  newlyProcessed: number;
  patientsCreated: number;
  patientsMatched: number;
  failed: number;
  errors: string[];
}

function parseArgs(): {
  execute: boolean;
  since: Date;
  accountId: string | null;
} {
  const args = process.argv.slice(2);
  let execute = false;
  let since = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  let accountId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--execute') execute = true;
    if (args[i] === '--since' && args[i + 1]) {
      since = new Date(args[i + 1] + 'T00:00:00Z');
      i++;
    }
    if (args[i] === '--account' && args[i + 1]) {
      accountId = args[i + 1];
      i++;
    }
  }

  return { execute, since, accountId };
}

function getConnectPlatformStripe(): Stripe {
  const secretKey = process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_CONNECT_PLATFORM_SECRET_KEY not configured');
  }
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
    maxNetworkRetries: 3,
    timeout: 30000,
  });
}

async function getConnectClinics(specificAccountId: string | null): Promise<
  Array<{ id: number; name: string; stripeAccountId: string; subdomain: string | null }>
> {
  const where: any = { stripeAccountId: { not: null } };
  if (specificAccountId) {
    where.stripeAccountId = specificAccountId;
  }

  const clinics = await prisma.clinic.findMany({
    where,
    select: { id: true, name: true, stripeAccountId: true, subdomain: true },
  });

  return clinics.filter((c) => c.stripeAccountId) as Array<{
    id: number;
    name: string;
    stripeAccountId: string;
    subdomain: string | null;
  }>;
}

async function fetchConnectPaymentIntents(
  stripe: Stripe,
  accountId: string,
  since: Date
): Promise<Stripe.PaymentIntent[]> {
  const sinceTs = Math.floor(since.getTime() / 1000);
  const all: Stripe.PaymentIntent[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.paymentIntents.list(
      {
        created: { gte: sinceTs },
        limit: BATCH_SIZE,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount: accountId }
    );

    all.push(...page.data.filter((pi) => pi.status === 'succeeded'));
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return all;
}

async function fetchConnectInvoices(
  stripe: Stripe,
  accountId: string,
  since: Date
): Promise<Stripe.Invoice[]> {
  const sinceTs = Math.floor(since.getTime() / 1000);
  const all: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.invoices.list(
      {
        created: { gte: sinceTs },
        status: 'paid',
        limit: BATCH_SIZE,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount: accountId }
    );

    all.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return all;
}

async function reconcileClinic(
  stripe: Stripe,
  clinic: { id: number; name: string; stripeAccountId: string },
  since: Date,
  execute: boolean
): Promise<ReconResult> {
  const result: ReconResult = {
    stripePaymentsFound: 0,
    stripeInvoicesFound: 0,
    alreadyInDb: 0,
    newlyProcessed: 0,
    patientsCreated: 0,
    patientsMatched: 0,
    failed: 0,
    errors: [],
  };

  console.log(`\n  Fetching PaymentIntents from Stripe (account: ${clinic.stripeAccountId})...`);
  const paymentIntents = await fetchConnectPaymentIntents(stripe, clinic.stripeAccountId, since);
  result.stripePaymentsFound = paymentIntents.length;
  console.log(`  Found ${paymentIntents.length} succeeded PaymentIntents`);

  console.log(`  Fetching paid Invoices from Stripe...`);
  const invoices = await fetchConnectInvoices(stripe, clinic.stripeAccountId, since);
  result.stripeInvoicesFound = invoices.length;
  console.log(`  Found ${invoices.length} paid Invoices`);

  // All DB queries must run within clinic context for tenant isolation
  const { processedPiIds, processedInvIds } = await runWithClinicContext(clinic.id, async () => {
    const piIds = paymentIntents.map((pi) => pi.id);

    // Check in batches to avoid query size limits
    const CHUNK = 500;
    const existingPiSet = new Set<string>();

    for (let i = 0; i < piIds.length; i += CHUNK) {
      const chunk = piIds.slice(i, i + CHUNK);

      const [payments, recons] = await Promise.all([
        prisma.payment.findMany({
          where: { stripePaymentIntentId: { in: chunk } },
          select: { stripePaymentIntentId: true },
        }),
        prisma.paymentReconciliation.findMany({
          where: { stripePaymentIntentId: { in: chunk } },
          select: { stripePaymentIntentId: true },
        }),
      ]);

      for (const p of payments) if (p.stripePaymentIntentId) existingPiSet.add(p.stripePaymentIntentId);
      for (const r of recons) if (r.stripePaymentIntentId) existingPiSet.add(r.stripePaymentIntentId);
    }

    const stripeInvIds = invoices.map((inv) => inv.id);
    const existingInvSet = new Set<string>();

    for (let i = 0; i < stripeInvIds.length; i += CHUNK) {
      const chunk = stripeInvIds.slice(i, i + CHUNK);
      const existingInvs = await prisma.invoice.findMany({
        where: { stripeInvoiceId: { in: chunk } },
        select: { stripeInvoiceId: true },
      });
      for (const inv of existingInvs) if (inv.stripeInvoiceId) existingInvSet.add(inv.stripeInvoiceId);
    }

    return { processedPiIds: existingPiSet, processedInvIds: existingInvSet };
  });

  // Find missing payment intents (not linked to a Stripe invoice)
  const missingPIs = paymentIntents.filter((pi) => {
    if (processedPiIds.has(pi.id)) return false;
    const piAny = pi as Stripe.PaymentIntent & { invoice?: string | null };
    if (piAny.invoice) return false; // Invoice-linked PIs are handled below
    return true;
  });

  // Find missing invoices
  const missingInvoices = invoices.filter((inv) => !processedInvIds.has(inv.id));

  // Check invoice-linked PIs separately
  const invoiceLinkedPIs = paymentIntents.filter((pi) => {
    const piAny = pi as Stripe.PaymentIntent & { invoice?: string | null };
    return piAny.invoice && !processedPiIds.has(pi.id);
  });

  const totalAlready =
    paymentIntents.length + invoices.length - missingPIs.length - missingInvoices.length - invoiceLinkedPIs.length;
  result.alreadyInDb = Math.max(0, totalAlready);

  console.log(`\n  Already in DB: ${result.alreadyInDb}`);
  console.log(`  Missing PaymentIntents (standalone): ${missingPIs.length}`);
  console.log(`  Missing PaymentIntents (invoice-linked): ${invoiceLinkedPIs.length}`);
  console.log(`  Missing Invoices: ${missingInvoices.length}`);

  if (!execute) {
    console.log(`\n  ⚠️  DRY RUN — no changes made. Use --execute to process.`);

    // Show sample of missing payments
    if (missingPIs.length > 0) {
      console.log(`\n  Sample missing standalone PaymentIntents:`);
      for (const pi of missingPIs.slice(0, 10)) {
        const email =
          pi.receipt_email ||
          (pi.latest_charge as any)?.billing_details?.email ||
          pi.metadata?.email ||
          'no-email';
        const name =
          (pi.latest_charge as any)?.billing_details?.name || pi.metadata?.name || 'no-name';
        console.log(
          `    ${pi.id} | $${(pi.amount / 100).toFixed(2)} | ${email} | ${name} | ${new Date(pi.created * 1000).toISOString()}`
        );
      }
    }

    if (missingInvoices.length > 0) {
      console.log(`\n  Sample missing Invoices:`);
      for (const inv of missingInvoices.slice(0, 10)) {
        const email = inv.customer_email || 'no-email';
        console.log(
          `    ${inv.id} | $${(inv.amount_paid / 100).toFixed(2)} | ${email} | ${inv.billing_reason || 'unknown'} | ${new Date(inv.created * 1000).toISOString()}`
        );
      }
    }

    return result;
  }

  // ---- EXECUTE MODE ----
  console.log(`\n  Processing missing payments...`);

  const { processStripePayment, extractPaymentDataFromPaymentIntent } = await import(
    '../src/services/stripe/paymentMatchingService'
  );

  // Process standalone PaymentIntents
  for (const pi of missingPIs) {
    try {
      const processed = await runWithClinicContext(clinic.id, async () => {
        // Expand the charge for billing details (Connect requires stripeAccount header)
        let expandedPi = pi;
        if (typeof pi.latest_charge === 'string') {
          try {
            expandedPi = await stripe.paymentIntents.retrieve(
              pi.id,
              { expand: ['latest_charge'] },
              { stripeAccount: clinic.stripeAccountId }
            );
          } catch {
            // Use unexpanded PI
          }
        }

        const paymentData = await extractPaymentDataFromPaymentIntent(expandedPi);
        paymentData.metadata = {
          ...paymentData.metadata,
          clinicId: clinic.id.toString(),
          sync_source: 'connect_reconciliation',
        };

        return processStripePayment(
          paymentData,
          `recon_${pi.id}_${Date.now()}`,
          'payment_intent.succeeded'
        );
      });

      if (processed.success) {
        result.newlyProcessed++;
        if (processed.patientCreated) result.patientsCreated++;
        else result.patientsMatched++;
        console.log(
          `    ✅ ${pi.id} | $${(pi.amount / 100).toFixed(2)} | patient=${processed.patient?.id} | matched=${processed.matchResult?.matchedBy || 'created'}`
        );
      } else {
        result.failed++;
        result.errors.push(`${pi.id}: ${processed.error}`);
        console.log(`    ❌ ${pi.id} | $${(pi.amount / 100).toFixed(2)} | ${processed.error}`);
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : 'Unknown';
      result.errors.push(`${pi.id}: ${msg}`);
      console.log(`    ❌ ${pi.id} | EXCEPTION: ${msg}`);
    }
  }

  // Process invoice-linked PaymentIntents
  for (const pi of invoiceLinkedPIs) {
    try {
      const processed = await runWithClinicContext(clinic.id, async () => {
        let expandedPi = pi;
        if (typeof pi.latest_charge === 'string') {
          try {
            expandedPi = await stripe.paymentIntents.retrieve(
              pi.id,
              { expand: ['latest_charge'] },
              { stripeAccount: clinic.stripeAccountId }
            );
          } catch {
            // Use unexpanded PI
          }
        }

        const paymentData = await extractPaymentDataFromPaymentIntent(expandedPi);
        paymentData.metadata = {
          ...paymentData.metadata,
          clinicId: clinic.id.toString(),
          sync_source: 'connect_reconciliation_invoice',
        };

        const piAny = pi as Stripe.PaymentIntent & { invoice?: string | null };
        if (piAny.invoice) {
          paymentData.stripeInvoiceId = piAny.invoice;
        }

        return processStripePayment(
          paymentData,
          `recon_inv_${pi.id}_${Date.now()}`,
          'invoice.payment_succeeded'
        );
      });

      if (processed.success) {
        result.newlyProcessed++;
        if (processed.patientCreated) result.patientsCreated++;
        else result.patientsMatched++;
        console.log(
          `    ✅ ${pi.id} (invoice) | $${(pi.amount / 100).toFixed(2)} | patient=${processed.patient?.id}`
        );
      } else {
        result.failed++;
        result.errors.push(`${pi.id}: ${processed.error}`);
        console.log(`    ❌ ${pi.id} (invoice) | ${processed.error}`);
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : 'Unknown';
      result.errors.push(`${pi.id}: ${msg}`);
    }
  }

  // Process missing Stripe invoices (subscription payments)
  for (const inv of missingInvoices) {
    const paymentIntentId =
      typeof (inv as any).payment_intent === 'string'
        ? (inv as any).payment_intent
        : ((inv as any).payment_intent as Stripe.PaymentIntent | null)?.id;

    if (!paymentIntentId) continue;
    if (processedPiIds.has(paymentIntentId)) {
      result.alreadyInDb++;
      continue;
    }

    try {
      const processed = await runWithClinicContext(clinic.id, async () => {
        const pi = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          { expand: ['latest_charge'] },
          { stripeAccount: clinic.stripeAccountId }
        );

        if (pi.status !== 'succeeded') return { success: true, skipped: true } as any;

        const paymentData = await extractPaymentDataFromPaymentIntent(pi);
        paymentData.metadata = {
          ...paymentData.metadata,
          clinicId: clinic.id.toString(),
          sync_source: 'connect_reconciliation_subscription',
        };
        paymentData.stripeInvoiceId = inv.id;

        return processStripePayment(
          paymentData,
          `recon_sub_${inv.id}_${Date.now()}`,
          'invoice.payment_succeeded'
        );
      });

      if (processed.skipped) continue;

      if (processed.success) {
        result.newlyProcessed++;
        if (processed.patientCreated) result.patientsCreated++;
        else result.patientsMatched++;
        console.log(
          `    ✅ ${inv.id} (subscription) | $${(inv.amount_paid / 100).toFixed(2)} | patient=${processed.patient?.id}`
        );
      } else {
        result.failed++;
        result.errors.push(`${inv.id}: ${processed.error}`);
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : 'Unknown';
      result.errors.push(`${inv.id}: ${msg}`);
    }
  }

  return result;
}

async function main() {
  const { execute, since, accountId } = parseArgs();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  STRIPE CONNECT PAYMENT RECONCILIATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode:      ${execute ? '🔴 EXECUTE (will write to DB)' : '🟡 DRY RUN (report only)'}`);
  console.log(`  Since:     ${since.toISOString()}`);
  console.log(`  Account:   ${accountId || 'all Connect accounts'}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const stripe = getConnectPlatformStripe();
  const clinics = await getConnectClinics(accountId);

  if (clinics.length === 0) {
    console.log('  No Connect clinics found. Exiting.');
    return;
  }

  console.log(`  Found ${clinics.length} Connect clinic(s):`);
  for (const c of clinics) {
    console.log(`    - ${c.name} (id=${c.id}, account=${c.stripeAccountId})`);
  }

  const allResults: Map<string, ReconResult> = new Map();

  for (const clinic of clinics) {
    console.log(`\n───────────────────────────────────────────────────────────────`);
    console.log(`  Clinic: ${clinic.name} (id=${clinic.id})`);
    console.log(`───────────────────────────────────────────────────────────────`);

    try {
      const result = await reconcileClinic(stripe, clinic, since, execute);
      allResults.set(clinic.name, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      console.error(`  ❌ FATAL ERROR for ${clinic.name}: ${msg}`);
      allResults.set(clinic.name, {
        stripePaymentsFound: 0,
        stripeInvoicesFound: 0,
        alreadyInDb: 0,
        newlyProcessed: 0,
        patientsCreated: 0,
        patientsMatched: 0,
        failed: 1,
        errors: [msg],
      });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  let totalProcessed = 0;
  let totalFailed = 0;
  let totalCreated = 0;
  let totalMatched = 0;

  for (const [clinicName, r] of allResults) {
    console.log(`\n  ${clinicName}:`);
    console.log(`    Stripe PaymentIntents:  ${r.stripePaymentsFound}`);
    console.log(`    Stripe Invoices:        ${r.stripeInvoicesFound}`);
    console.log(`    Already in DB:          ${r.alreadyInDb}`);
    console.log(`    Newly processed:        ${r.newlyProcessed}`);
    console.log(`      - Matched to patient: ${r.patientsMatched}`);
    console.log(`      - New patient created:${r.patientsCreated}`);
    console.log(`    Failed:                 ${r.failed}`);

    if (r.errors.length > 0) {
      console.log(`    Errors:`);
      for (const e of r.errors.slice(0, 10)) {
        console.log(`      - ${e}`);
      }
      if (r.errors.length > 10) {
        console.log(`      ... and ${r.errors.length - 10} more`);
      }
    }

    totalProcessed += r.newlyProcessed;
    totalFailed += r.failed;
    totalCreated += r.patientsCreated;
    totalMatched += r.patientsMatched;
  }

  console.log('\n  ─────────────────────────────────');
  console.log(`  TOTAL processed:  ${totalProcessed}`);
  console.log(`  TOTAL matched:    ${totalMatched}`);
  console.log(`  TOTAL created:    ${totalCreated}`);
  console.log(`  TOTAL failed:     ${totalFailed}`);

  if (!execute && totalProcessed === 0) {
    const totalMissing = [...allResults.values()].reduce(
      (sum, r) => sum + r.stripePaymentsFound + r.stripeInvoicesFound - r.alreadyInDb,
      0
    );
    if (totalMissing > 0) {
      console.log(`\n  ⚠️  ${totalMissing} payments need processing. Run with --execute to fix.`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Done.');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
