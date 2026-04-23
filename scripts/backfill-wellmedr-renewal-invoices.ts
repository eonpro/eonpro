#!/usr/bin/env tsx
/**
 * Backfill: WellMedR Recurring-Renewal Invoices (2026-04-22 incident)
 * ====================================================================
 *
 * Problem
 * -------
 * On 2026-04-19, a guard was added to `StripeInvoiceService.updateFromWebhook`
 * that skipped invoice auto-create for ALL Connect events. The intent was to
 * prevent duplicates at initial checkout (owned by Airtable). The unintended
 * consequence: subscription-renewal `invoice.payment_succeeded` events silently
 * stopped producing local Invoice rows, so WellMedR renewals never appeared in
 * the patient profile or the provider Rx queue.
 *
 * The live webhook regression was fixed on 2026-04-22 (see
 * `connectInvoiceGuard.ts` and the updated `invoiceService.ts`). This script
 * closes the historical gap between 2026-04-19 and the fix deploy.
 *
 * What this script does
 * ---------------------
 * 1. Lists paid invoices on WellMedR's Connect account with
 *    `billing_reason ∈ {subscription_cycle, subscription_update}` and
 *    `created >= --since` (default 2026-04-19T00:00:00Z).
 * 2. For each, checks whether a local Invoice already exists by
 *    `stripeInvoiceId`.
 * 3. Writes a CSV report: `backfill-wellmedr-renewals-<timestamp>.csv`.
 * 4. In DRY-RUN mode (default): reports only, no DB writes.
 * 5. In EXECUTE mode (`--execute`): replays each missing invoice through
 *    `StripeInvoiceService.updateFromWebhook` (same code path the live webhook
 *    uses). This will NOT send patient-facing receipt emails — the invoice
 *    metadata is tagged `historicalBackfill: true` so the receipt automation
 *    suppresses them.
 *
 * Idempotency
 * -----------
 * Re-running is safe. `Invoice.stripeInvoiceId` has a unique index; replaying
 * an already-created invoice is a no-op inside `updateFromWebhook`.
 *
 * Usage
 * -----
 *   # Dry run (default) — produces CSV, no writes
 *   npx tsx scripts/backfill-wellmedr-renewal-invoices.ts
 *
 *   # Dry run over a custom window
 *   npx tsx scripts/backfill-wellmedr-renewal-invoices.ts --since=2026-04-19
 *
 *   # Execute (writes to DB)
 *   npx tsx scripts/backfill-wellmedr-renewal-invoices.ts --execute
 *
 *   # Execute with explicit window
 *   npx tsx scripts/backfill-wellmedr-renewal-invoices.ts --execute --since=2026-04-19
 *
 * Pre-execution checklist
 * -----------------------
 *   [ ] Dry-run CSV reviewed by ops + clinical lead
 *   [ ] Any `missing_patient` rows triaged manually
 *   [ ] DB backup / snapshot taken
 *   [ ] Run with `--execute` during low-traffic window
 *   [ ] Post-run: verify Rx queue counts match expectation
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Default: the commit date of the regression (2026-04-19). See git blame of
// `src/services/stripe/invoiceService.ts` line 436 (`60138e4e`).
const DEFAULT_SINCE = '2026-04-19T00:00:00Z';

interface Args {
  execute: boolean;
  since: Date;
  outputDir: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const execute = argv.includes('--execute');

  let sinceStr = DEFAULT_SINCE;
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  if (sinceArg) {
    sinceStr = sinceArg.slice('--since='.length);
  }
  const since = new Date(sinceStr);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`Invalid --since value: "${sinceStr}" (expected ISO date)`);
  }

  let outputDir = '.';
  const outArg = argv.find((a) => a.startsWith('--out='));
  if (outArg) outputDir = outArg.slice('--out='.length);

  return { execute, since, outputDir };
}

type CoverageReason =
  | 'stripe_invoice_id_match'     // exact: local Invoice.stripeInvoiceId = this Stripe invoice
  | 'payment_method_match'        // Airtable-created Invoice with same stripePaymentMethodId ±2d
  | 'recent_order'                // patient received a Lifefile Order ±14d of paidAt
  | 'recent_refill_queue'         // RefillQueue entry for this patient ±2d of paidAt
  | 'none';

interface ReportRow {
  stripeInvoiceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePaymentMethodId: string;
  billingReason: string;
  amountPaidCents: number;
  paidAt: string;
  patientId: string;
  coverageReason: CoverageReason;
  existingInvoiceId: string;        // populated when coverageReason points to an Invoice
  existingOrderId: string;          // populated when coverageReason=recent_order
  existingRefillQueueId: string;    // populated when coverageReason=recent_refill_queue
  action: 'skipped_covered' | 'would_create' | 'created' | 'replay_no_patient' | 'replay_error';
  errorMessage: string;
}

function toCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(rows: ReportRow[], filePath: string): void {
  const headers: (keyof ReportRow)[] = [
    'stripeInvoiceId',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripePaymentMethodId',
    'billingReason',
    'amountPaidCents',
    'paidAt',
    'patientId',
    'coverageReason',
    'existingInvoiceId',
    'existingOrderId',
    'existingRefillQueueId',
    'action',
    'errorMessage',
  ];
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => toCsvCell(r[h])).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/* Extraction uses @/services/stripe/invoiceFieldExtractors (dahlia-aware). */

async function main() {
  const args = parseArgs();
  const mode = args.execute ? 'EXECUTE' : 'DRY-RUN';
  console.log('━'.repeat(70));
  console.log(`WellMedR Renewal-Invoice Backfill — ${mode}`);
  console.log(`Since: ${args.since.toISOString()}`);
  console.log('━'.repeat(70));

  // Dynamic imports so dotenv runs before module initialization reads env.
  const { prisma, runWithClinicContext } = await import('../src/lib/db');
  const { getStripeForClinic } = await import('../src/lib/stripe/connect');
  const { StripeInvoiceService } = await import('../src/services/stripe/invoiceService');
  const { isRenewalBillingReason } = await import(
    '../src/services/stripe/connectInvoiceGuard'
  );
  const {
    getInvoicePaymentIntentId,
    getInvoicePaymentMethodIdFromExpanded,
    getInvoiceSubscriptionId,
    resolveInvoicePaymentMethodId,
  } = await import('../src/services/stripe/invoiceFieldExtractors');
  const { findPatientByEmail } = await import(
    '../src/services/stripe/paymentMatchingService'
  );

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, stripeAccountId: true },
  });

  if (!clinic?.stripeAccountId) {
    console.error('❌ No WellMedR clinic with stripeAccountId found.');
    process.exit(1);
  }

  console.log(`Clinic: ${clinic.name} (id=${clinic.id})`);
  console.log(`Connect account: ${clinic.stripeAccountId.substring(0, 14)}…`);

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) {
    console.error('❌ getStripeForClinic did not resolve a Connect account.');
    process.exit(1);
  }

  const connectOpts: Stripe.RequestOptions = {
    stripeAccount: stripeContext.stripeAccountId,
  };

  const since = Math.floor(args.since.getTime() / 1000);

  const rows: ReportRow[] = [];
  let scanned = 0;
  let renewalCandidates = 0;
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await stripeContext.stripe.invoices.list(
      {
        status: 'paid',
        created: { gte: since },
        limit: 100,
        // Dahlia: invoice.payments is included without explicit expansion;
        // resolution of payment_method still requires a per-PI retrieve, which
        // we defer until layer 2 is actually reached for a given row.
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      connectOpts
    );

    for (const stripeInvoice of page.data) {
      scanned++;
      if (!isRenewalBillingReason(stripeInvoice.billing_reason)) continue;
      renewalCandidates++;

      const paidAtSeconds =
        stripeInvoice.status_transitions?.paid_at ?? stripeInvoice.created;
      const paidAt = new Date(paidAtSeconds * 1000);
      const stripeSubId = getInvoiceSubscriptionId(stripeInvoice) ?? '';
      const stripeCustomerId =
        typeof stripeInvoice.customer === 'string'
          ? stripeInvoice.customer
          : stripeInvoice.customer?.id || '';
      // Dahlia API: charge/payment_intent no longer expandable at list-time.
      // Only retrieve the payment method when we actually need it for layer 2
      // (to minimize 575× additional API calls).
      let paymentMethodId = getInvoicePaymentMethodIdFromExpanded(stripeInvoice) ?? '';
      const resolvePaymentMethodLazy = async (): Promise<string> => {
        if (paymentMethodId) return paymentMethodId;
        const id = await resolveInvoicePaymentMethodId(
          stripeInvoice,
          stripeContext.stripe,
          connectOpts
        );
        paymentMethodId = id ?? '';
        return paymentMethodId;
      };
      // Record PI id (helpful in the CSV even if PM stays unresolved).
      void getInvoicePaymentIntentId(stripeInvoice);

      const row: ReportRow = {
        stripeInvoiceId: stripeInvoice.id,
        stripeCustomerId,
        stripeSubscriptionId: stripeSubId,
        stripePaymentMethodId: paymentMethodId,
        billingReason: stripeInvoice.billing_reason || '',
        amountPaidCents: stripeInvoice.amount_paid,
        paidAt: paidAt.toISOString(),
        patientId: '',
        coverageReason: 'none',
        existingInvoiceId: '',
        existingOrderId: '',
        existingRefillQueueId: '',
        action: 'would_create',
        errorMessage: '',
      };

      try {
        await runWithClinicContext(clinic.id, async () => {
          // ── Layer 1: exact match by stripeInvoiceId ─────────────────────
          const exactMatch = await prisma.invoice.findUnique({
            where: { stripeInvoiceId: stripeInvoice.id },
            select: { id: true, patientId: true },
          });
          if (exactMatch) {
            row.coverageReason = 'stripe_invoice_id_match';
            row.existingInvoiceId = String(exactMatch.id);
            row.patientId = String(exactMatch.patientId);
            row.action = 'skipped_covered';
            return;
          }

          // Resolve patient through the same cascade the live webhook uses:
          //   1. Subscription.stripeSubscriptionId → patientId (fastest)
          //   2. Patient.stripeCustomerId (fast, but many legacy WellMedR
          //      patients lack this link)
          //   3. Email via findPatientByEmail (searchIndex / plaintext /
          //      encrypted-decrypt cascade). Email source: subscription
          //      metadata → Stripe customer retrieve.
          let patientId: number | null = null;

          if (stripeSubId) {
            const localSub = await prisma.subscription.findUnique({
              where: { stripeSubscriptionId: stripeSubId },
              select: { patientId: true },
            });
            if (localSub) patientId = localSub.patientId;
          }

          if (!patientId && stripeCustomerId) {
            const patientByCust = await prisma.patient.findFirst({
              where: { stripeCustomerId },
              select: { id: true },
            });
            if (patientByCust) patientId = patientByCust.id;
          }

          if (!patientId) {
            // Dahlia invoices carry subscription metadata with checkout email
            // at parent.subscription_details.metadata.email. Free to read.
            const invAny = stripeInvoice as unknown as {
              parent?: { subscription_details?: { metadata?: Record<string, string> } };
              customer_email?: string | null;
            };
            let emailForLookup =
              invAny.parent?.subscription_details?.metadata?.email?.toLowerCase().trim() ||
              invAny.customer_email?.toLowerCase().trim() ||
              '';
            // Final fallback: retrieve the Stripe customer for its email.
            if (!emailForLookup && stripeCustomerId) {
              try {
                const cust = await stripeContext.stripe.customers.retrieve(
                  stripeCustomerId,
                  {},
                  connectOpts
                );
                if (
                  cust &&
                  !(cust as Stripe.DeletedCustomer).deleted &&
                  'email' in cust &&
                  cust.email
                ) {
                  emailForLookup = cust.email.toLowerCase().trim();
                }
              } catch {
                /* Customer retrieve failed — leave email unresolved. */
              }
            }
            if (emailForLookup) {
              const patientByEmail = await findPatientByEmail(emailForLookup, clinic.id);
              if (patientByEmail) patientId = patientByEmail.id;
            }
          }

          if (patientId) row.patientId = String(patientId);

          // ── Layer 2: Airtable-created Invoice match via payment_method ──
          // Window: paidAt ± 2 days. Airtable-created Invoices have
          // stripeInvoiceId=null and metadata.stripePaymentMethodId set.
          // Retrieve the Stripe payment method lazily (requires an extra API
          // call on dahlia since charge/payment_intent aren't on invoice).
          const pmForLayer2 = await resolvePaymentMethodLazy();
          row.stripePaymentMethodId = pmForLayer2;
          if (pmForLayer2) {
            const windowStart = new Date(paidAt.getTime() - 2 * 24 * 60 * 60 * 1000);
            const windowEnd = new Date(paidAt.getTime() + 2 * 24 * 60 * 60 * 1000);
            const pmMatch = await prisma.invoice.findFirst({
              where: {
                stripeInvoiceId: null,
                createdAt: { gte: windowStart, lte: windowEnd },
                metadata: { path: ['stripePaymentMethodId'], equals: pmForLayer2 },
                ...(patientId ? { patientId } : {}),
              },
              select: { id: true, patientId: true },
              orderBy: { createdAt: 'desc' },
            });
            if (pmMatch) {
              row.coverageReason = 'payment_method_match';
              row.existingInvoiceId = String(pmMatch.id);
              row.patientId = String(pmMatch.patientId);
              row.action = 'skipped_covered';
              return;
            }
          }

          // ── Layer 3: patient has a recent Lifefile Order (actual Rx) ────
          // Window: paidAt - 7d to paidAt + 14d. A prescription written within
          // this window covers the renewal clinically, even if the Invoice
          // was never created (provider issued Rx via another route).
          if (patientId) {
            const orderWindowStart = new Date(paidAt.getTime() - 7 * 24 * 60 * 60 * 1000);
            const orderWindowEnd = new Date(paidAt.getTime() + 14 * 24 * 60 * 60 * 1000);
            const recentOrder = await prisma.order.findFirst({
              where: {
                patientId,
                createdAt: { gte: orderWindowStart, lte: orderWindowEnd },
              },
              select: { id: true, createdAt: true, primaryMedName: true },
              orderBy: { createdAt: 'desc' },
            });
            if (recentOrder) {
              row.coverageReason = 'recent_order';
              row.existingOrderId = String(recentOrder.id);
              row.action = 'skipped_covered';
              return;
            }
          }

          // ── Layer 4: patient has a recent RefillQueue entry ─────────────
          if (patientId) {
            const rqWindowStart = new Date(paidAt.getTime() - 2 * 24 * 60 * 60 * 1000);
            const rqWindowEnd = new Date(paidAt.getTime() + 2 * 24 * 60 * 60 * 1000);
            const recentRefill = await prisma.refillQueue.findFirst({
              where: {
                patientId,
                OR: [
                  { paymentVerifiedAt: { gte: rqWindowStart, lte: rqWindowEnd } },
                  { createdAt: { gte: rqWindowStart, lte: rqWindowEnd } },
                ],
              },
              select: { id: true, status: true, paymentVerifiedAt: true },
              orderBy: { createdAt: 'desc' },
            });
            if (recentRefill) {
              row.coverageReason = 'recent_refill_queue';
              row.existingRefillQueueId = String(recentRefill.id);
              row.action = 'skipped_covered';
              return;
            }
          }

          // ── No coverage found: genuinely missed ─────────────────────────
          if (!args.execute) {
            row.action = 'would_create';
            return;
          }

          // EXECUTE: replay via updateFromWebhook (same code path as live webhook)
          await StripeInvoiceService.updateFromWebhook(stripeInvoice, {
            stripeAccountId: stripeContext.stripeAccountId || undefined,
            clinicId: clinic.id,
          });

          const created = await prisma.invoice.findUnique({
            where: { stripeInvoiceId: stripeInvoice.id },
            select: { id: true, patientId: true, metadata: true },
          });
          if (created) {
            row.action = 'created';
            row.existingInvoiceId = String(created.id);
            row.patientId = String(created.patientId);
            const existingMeta = (created.metadata as Record<string, unknown>) || {};
            await prisma.invoice.update({
              where: { id: created.id },
              data: {
                metadata: {
                  ...existingMeta,
                  historicalBackfill: true,
                  backfillSource: 'backfill-wellmedr-renewal-invoices.ts',
                  backfillRunAt: new Date().toISOString(),
                },
              },
            });
          } else {
            row.action = 'replay_no_patient';
            row.errorMessage =
              'updateFromWebhook completed but no Invoice row appeared — patient likely unresolvable on Connect account';
          }
        });
      } catch (err) {
        row.action = 'replay_error';
        row.errorMessage = err instanceof Error ? err.message : 'Unknown';
      }

      rows.push(row);
    }

    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.resolve(
    args.outputDir,
    `backfill-wellmedr-renewals-${timestamp}${args.execute ? '-executed' : '-dryrun'}.csv`
  );
  writeCsv(rows, csvPath);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});

  console.log('');
  console.log('━'.repeat(70));
  console.log('Summary');
  console.log('━'.repeat(70));
  console.log(`  Total Stripe invoices scanned:      ${scanned}`);
  console.log(`  Renewal candidates (cycle/update):  ${renewalCandidates}`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(36)} ${v}`);
  }
  console.log('');
  console.log(`CSV written: ${csvPath}`);
  console.log('');
  if (!args.execute) {
    console.log('Dry-run complete. Review the CSV, then re-run with --execute to apply.');
  } else {
    console.log('Execute run complete. Verify Rx queue + patient profiles for affected clinics.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
