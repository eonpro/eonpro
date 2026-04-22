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

interface ReportRow {
  stripeInvoiceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingReason: string;
  amountPaidCents: number;
  paidAt: string;
  localInvoiceExisted: 'yes' | 'no';
  action: 'skipped_existing' | 'would_create' | 'created' | 'replay_no_patient' | 'replay_error';
  localInvoiceId: string;
  patientId: string;
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
    'billingReason',
    'amountPaidCents',
    'paidAt',
    'localInvoiceExisted',
    'action',
    'localInvoiceId',
    'patientId',
    'errorMessage',
  ];
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => toCsvCell(r[h])).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

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

      const row: ReportRow = {
        stripeInvoiceId: stripeInvoice.id,
        stripeCustomerId:
          typeof stripeInvoice.customer === 'string'
            ? stripeInvoice.customer
            : stripeInvoice.customer?.id || '',
        stripeSubscriptionId:
          typeof (stripeInvoice as any).subscription === 'string'
            ? (stripeInvoice as any).subscription
            : (stripeInvoice as any).subscription?.id || '',
        billingReason: stripeInvoice.billing_reason || '',
        amountPaidCents: stripeInvoice.amount_paid,
        paidAt: paidAt.toISOString(),
        localInvoiceExisted: 'no',
        action: 'would_create',
        localInvoiceId: '',
        patientId: '',
        errorMessage: '',
      };

      try {
        const existing = await prisma.invoice.findUnique({
          where: { stripeInvoiceId: stripeInvoice.id },
          select: { id: true, patientId: true },
        });

        if (existing) {
          row.localInvoiceExisted = 'yes';
          row.action = 'skipped_existing';
          row.localInvoiceId = String(existing.id);
          row.patientId = String(existing.patientId);
          rows.push(row);
          continue;
        }

        if (!args.execute) {
          rows.push(row);
          continue;
        }

        // EXECUTE path: tag the Stripe invoice's metadata so the auto-create
        // path marks the resulting local invoice as a historical backfill.
        // This is purely advisory (metadata only); the live webhook flow is
        // unaffected by this script running.
        //
        // We cannot mutate the Stripe invoice itself here (it belongs to
        // WellMedR's Connect account and we shouldn't touch their records),
        // so we instead re-use updateFromWebhook and then tag the resulting
        // local Invoice.metadata.historicalBackfill = true + suppress-email.
        await runWithClinicContext(clinic.id, async () => {
          await StripeInvoiceService.updateFromWebhook(stripeInvoice, {
            stripeAccountId: stripeContext.stripeAccountId || undefined,
            clinicId: clinic.id,
          });
        });

        const created = await prisma.invoice.findUnique({
          where: { stripeInvoiceId: stripeInvoice.id },
          select: { id: true, patientId: true, metadata: true },
        });

        if (created) {
          row.action = 'created';
          row.localInvoiceId = String(created.id);
          row.patientId = String(created.patientId);

          // Tag the invoice so downstream systems can tell this came from
          // the backfill (for auditing + receipt-email suppression).
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
