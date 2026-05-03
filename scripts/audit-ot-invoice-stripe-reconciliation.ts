#!/usr/bin/env tsx
/**
 * Phase 2 audit (READ-ONLY, PHI-safe): quantify the blast radius of the
 * OT invoice ↔ Stripe reconciliation discrepancy class identified in the
 * Phase 1 RCA (`~/.cursor/plans/ot-invoice-3213-rca.md`).
 *
 * Scope: every Invoice belonging to a patient in the OT clinic
 * (`clinic.subdomain = 'ot'`). No time window by default — pass
 * `--since 2026-01-01` to limit if needed.
 *
 * For each invoice, computes flags:
 *
 *   amountpaid_vs_payment_net      Invoice.amountPaid !== SUM(Payment.amount - refundedAmount)
 *                                   for SUCCEEDED + PARTIALLY_REFUNDED payments
 *   refund_double_decrement        Has a refund AND Invoice.amountPaid is exactly
 *                                   `2 × refund` short of Payment net (the bug we found)
 *   header_vs_lineitems            Invoice.amount !== SUM(Invoice.lineItems[].amount)
 *                                   (or SUM(InvoiceItem.amount) when present)
 *   missing_invoiceitem_rows       lineItems JSON populated but 0 InvoiceItem rows (B9)
 *   missing_orderid                Invoice.orderId is null (B10) — counted but informational
 *   refund_no_reconciliation_row   metadata.refund set AND no PaymentReconciliation
 *                                   row with type matching /refund/i (B8)
 *   payment_partially_refunded     Has a Payment with status='PARTIALLY_REFUNDED'
 *                                   (B6 — falls back to invoice_sync in OT editor)
 *
 * Financial exposure is computed only for `amountpaid_vs_payment_net` —
 * that's the canonical source of truth.
 *
 * Run:
 *   set -a; source .env.production.local; set +a
 *   npx tsx scripts/audit-ot-invoice-stripe-reconciliation.ts
 *
 *   # Optional flags:
 *   --since 2026-01-01    Only invoices created on/after this ISO date
 *   --sample-per-bucket 5 Show this many sample invoiceIds per bucket (default 5)
 *   --csv /path/to.csv    Also dump per-invoice rows to a CSV (no PHI)
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.production.local' });

import { basePrisma } from '../src/lib/db';
import type { Prisma } from '@prisma/client';

function getArg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const SINCE = getArg('since') ? new Date(getArg('since')!) : null;
const SAMPLE_PER_BUCKET = Number(getArg('sample-per-bucket') ?? '10');
const CSV_PATH = getArg('csv') ?? null;
const PAGE_SIZE = 500;
const OT_SUBDOMAIN = 'ot';

function fmt(cents: number): string {
  return `${cents}c ($${(cents / 100).toFixed(2)})`;
}

type Bucket =
  | 'amountpaid_too_low'
  | 'amountpaid_too_high'
  | 'refund_double_decrement'
  | 'refundedamount_column_missing' // historical, fixable by existing backfill-refund-payment-columns.ts
  | 'header_vs_lineitems'
  | 'missing_invoiceitem_rows'
  | 'missing_orderid'
  | 'refund_no_reconciliation_row'
  | 'payment_partially_refunded';

interface InvoiceFinding {
  invoiceId: number;
  patientId: number;
  status: string;
  amount: number | null;
  amountPaid: number;
  amountDue: number | null;
  hasOrderId: boolean;
  hasInvoiceItems: boolean;
  hasLineItemsJson: boolean;
  lineItemsJsonSum: number | null;
  paymentGross: number; // SUCCEEDED + PARTIALLY_REFUNDED + REFUNDED
  paymentRefunded: number;
  paymentNet: number; // gross - refunded
  paymentStatuses: string[];
  invoiceMetadataHasRefund: boolean;
  invoiceMetadataRefundAmount: number | null;
  hasReconciliationRefundRow: boolean;
  flags: Set<Bucket>;
  /** $ exposure for amountPaid drift: |paymentNet - amountPaid|. */
  exposureCents: number;
  /** Signed: positive = under-recorded, negative = over-recorded. */
  signedExposureCents: number;
}

interface InvoiceMetadata {
  refund?: { amount?: number };
}

interface InvoiceLineItemJsonEntry {
  amount?: number;
}

async function main() {
  console.log('OT Invoice ↔ Stripe Reconciliation Audit');
  console.log('Phase 2 of `.cursor/scratchpad.md` § OT Invoice Discrepancy');
  console.log('');

  // ---------- 1. Resolve OT clinic ----------
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true, subdomain: true },
  });
  if (!clinic) throw new Error(`OT clinic (subdomain=${OT_SUBDOMAIN}) not found`);
  console.log(`OT clinic id=${clinic.id} subdomain=${clinic.subdomain}`);
  if (SINCE) console.log(`Time filter: createdAt >= ${SINCE.toISOString()}`);
  console.log('');

  // ---------- 2. Stream invoices, page by page ----------
  const findings: InvoiceFinding[] = [];
  let cursor: number | undefined;
  let totalScanned = 0;

  while (true) {
    const where: Prisma.InvoiceWhereInput = {
      patient: { clinicId: clinic.id },
      ...(SINCE ? { createdAt: { gte: SINCE } } : {}),
    };
    const page = await basePrisma.invoice.findMany({
      where,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        patientId: true,
        orderId: true,
        status: true,
        amount: true,
        amountDue: true,
        amountPaid: true,
        lineItems: true,
        metadata: true,
      },
    });
    if (page.length === 0) break;

    const invoiceIds = page.map((i) => i.id);

    // Batch fetch related rows
    const [items, payments, reconciliations] = await Promise.all([
      basePrisma.invoiceItem.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, amount: true },
      }),
      basePrisma.payment.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: {
          invoiceId: true,
          status: true,
          amount: true,
          refundedAmount: true,
          metadata: true,
          stripePaymentIntentId: true,
        },
      }),
      basePrisma.paymentReconciliation.findMany({
        where: {
          invoiceId: { in: invoiceIds },
          stripeEventType: { contains: 'refund', mode: 'insensitive' },
        },
        select: { invoiceId: true, stripeEventType: true },
      }),
    ]);

    const itemsByInvoice = new Map<number, number>();
    for (const it of items) {
      itemsByInvoice.set(it.invoiceId, (itemsByInvoice.get(it.invoiceId) ?? 0) + it.amount);
    }
    const itemCountByInvoice = new Map<number, number>();
    for (const it of items) {
      itemCountByInvoice.set(it.invoiceId, (itemCountByInvoice.get(it.invoiceId) ?? 0) + 1);
    }
    const paymentsByInvoice = new Map<number, typeof payments>();
    for (const p of payments) {
      if (p.invoiceId == null) continue;
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }
    const refundReconByInvoice = new Set<number>();
    for (const r of reconciliations) {
      if (r.invoiceId != null) refundReconByInvoice.add(r.invoiceId);
    }

    for (const inv of page) {
      totalScanned++;
      const flags = new Set<Bucket>();

      const itemSum = itemsByInvoice.get(inv.id) ?? 0;
      const itemCount = itemCountByInvoice.get(inv.id) ?? 0;
      const lineItems = (inv.lineItems as InvoiceLineItemJsonEntry[] | null) ?? null;
      const lineItemsJsonSum = Array.isArray(lineItems)
        ? lineItems.reduce((acc, li) => acc + (typeof li?.amount === 'number' ? li.amount : 0), 0)
        : null;
      const hasLineItemsJson = Array.isArray(lineItems) && lineItems.length > 0;

      // Payment rollup — only count SUCCEEDED, PARTIALLY_REFUNDED, REFUNDED
      // (not FAILED / PENDING / CANCELLED — those didn't actually settle).
      const invPayments = (paymentsByInvoice.get(inv.id) ?? []).filter((p) =>
        ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status as string)
      );
      const paymentGross = invPayments.reduce((acc, p) => acc + p.amount, 0);

      // Canonical refund total per payment: prefer the column; fall back to
      // metadata.refund.amount (the column was historically null — see
      // scripts/backfill-refund-payment-columns.ts). For fully REFUNDED status
      // with neither set, assume full payment was refunded.
      let paymentRefunded = 0;
      let refundedAmountColumnMissing = false;
      for (const p of invPayments) {
        const md = p.metadata as { refund?: { amount?: number } } | null;
        const mdRefund = typeof md?.refund?.amount === 'number' ? md.refund.amount : null;
        const colRefund = p.refundedAmount ?? null;
        let canonical: number;
        if (colRefund != null && colRefund > 0) {
          canonical = colRefund;
        } else if (mdRefund != null && mdRefund > 0) {
          canonical = mdRefund;
          refundedAmountColumnMissing = true;
        } else if (p.status === 'REFUNDED') {
          // Status says fully refunded but neither column nor metadata has the amount.
          // Assume full refund of payment.amount.
          canonical = p.amount;
          refundedAmountColumnMissing = true;
        } else {
          canonical = 0;
        }
        paymentRefunded += canonical;
      }

      const paymentNet = paymentGross - paymentRefunded;
      const paymentStatuses = [...new Set(invPayments.map((p) => p.status as string))];

      const md = (inv.metadata as InvoiceMetadata | null) ?? null;
      const invoiceMetadataHasRefund = md?.refund != null;
      const invoiceMetadataRefundAmount =
        typeof md?.refund?.amount === 'number' ? md.refund.amount : null;
      const hasReconciliationRefundRow = refundReconByInvoice.has(inv.id);

      // Bucket: canonical truth for amountPaid (split into too-low / too-high
      // because they have very different root causes).
      if (invPayments.length > 0) {
        if (inv.amountPaid < paymentNet) {
          flags.add('amountpaid_too_low');
        } else if (inv.amountPaid > paymentNet) {
          flags.add('amountpaid_too_high');
        }
      }

      // Bucket: smoking gun — Invoice.amountPaid is exactly 2× refund short
      // of Payment net. This is the classic double-decrement signature.
      if (
        invPayments.length > 0 &&
        paymentRefunded > 0 &&
        inv.amountPaid === paymentNet - paymentRefunded
      ) {
        flags.add('refund_double_decrement');
      }

      if (refundedAmountColumnMissing) {
        flags.add('refundedamount_column_missing');
      }

      // Bucket: header (Invoice.amount) vs the line items it should match.
      // Use InvoiceItem sum if present, else lineItems JSON sum.
      const expectedHeader = itemCount > 0 ? itemSum : lineItemsJsonSum;
      if (
        inv.amount != null &&
        expectedHeader != null &&
        expectedHeader > 0 &&
        inv.amount !== expectedHeader
      ) {
        flags.add('header_vs_lineitems');
      }

      if (hasLineItemsJson && itemCount === 0) {
        flags.add('missing_invoiceitem_rows');
      }

      if (inv.orderId == null) {
        flags.add('missing_orderid');
      }

      if (invoiceMetadataHasRefund && !hasReconciliationRefundRow) {
        flags.add('refund_no_reconciliation_row');
      }

      if (invPayments.some((p) => p.status === 'PARTIALLY_REFUNDED')) {
        flags.add('payment_partially_refunded');
      }

      // Exposure is only meaningful when amountPaid differs from canonical
      // payment net. We sign it: positive = under-recorded (clinic owed money),
      // negative = over-recorded (clinic took credit it shouldn't have).
      const signedExposureCents =
        invPayments.length > 0 ? paymentNet - inv.amountPaid : 0;
      const exposureCents = Math.abs(signedExposureCents);

      findings.push({
        invoiceId: inv.id,
        patientId: inv.patientId,
        status: inv.status,
        amount: inv.amount,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        hasOrderId: inv.orderId != null,
        hasInvoiceItems: itemCount > 0,
        hasLineItemsJson,
        lineItemsJsonSum,
        paymentGross,
        paymentRefunded,
        paymentNet,
        paymentStatuses,
        invoiceMetadataHasRefund,
        invoiceMetadataRefundAmount,
        hasReconciliationRefundRow,
        flags,
        exposureCents,
        signedExposureCents,
      });
    }

    cursor = page[page.length - 1].id;
    process.stdout.write(`  scanned ${totalScanned}…\r`);
  }

  console.log(`  scanned ${totalScanned} invoices total.\n`);

  // ---------- 3. Aggregate ----------
  const buckets: Bucket[] = [
    'amountpaid_too_low',
    'amountpaid_too_high',
    'refund_double_decrement',
    'refundedamount_column_missing',
    'header_vs_lineitems',
    'missing_invoiceitem_rows',
    'missing_orderid',
    'refund_no_reconciliation_row',
    'payment_partially_refunded',
  ];
  const exposureBuckets = new Set<Bucket>([
    'amountpaid_too_low',
    'amountpaid_too_high',
    'refund_double_decrement',
  ]);

  console.log('='.repeat(80));
  console.log('Bucket counts and financial exposure');
  console.log('='.repeat(80));
  console.log(
    'Bucket'.padEnd(36) + 'Count'.padStart(8) + '  ' + 'Total exposure'.padStart(22)
  );
  console.log('-'.repeat(80));
  for (const b of buckets) {
    const inBucket = findings.filter((f) => f.flags.has(b));
    const totalExposure = exposureBuckets.has(b)
      ? inBucket.reduce((a, f) => a + f.exposureCents, 0)
      : 0;
    const exposureCol = exposureBuckets.has(b) ? fmt(totalExposure) : '(N/A)';
    console.log(b.padEnd(36) + String(inBucket.length).padStart(8) + '  ' + exposureCol.padStart(22));
  }
  console.log('-'.repeat(80));

  // Net signed exposure across all buckets — what direction is OT systemically off?
  const totalUnderRecorded = findings
    .filter((f) => f.signedExposureCents > 0)
    .reduce((a, f) => a + f.signedExposureCents, 0);
  const totalOverRecorded = findings
    .filter((f) => f.signedExposureCents < 0)
    .reduce((a, f) => a + Math.abs(f.signedExposureCents), 0);
  console.log(`Under-recorded amountPaid (clinic likely UNDER-paid):  ${fmt(totalUnderRecorded)}`);
  console.log(`Over-recorded  amountPaid (clinic likely OVER-paid):   ${fmt(totalOverRecorded)}`);
  console.log(`Net direction: ${totalUnderRecorded > totalOverRecorded ? 'OT was UNDER-credited' : 'OT was OVER-credited'} by ${fmt(Math.abs(totalUnderRecorded - totalOverRecorded))}`);
  console.log(`Total invoices scanned: ${totalScanned}`);
  console.log('');

  // ---------- 4. Sample IDs per bucket ----------
  console.log('='.repeat(80));
  console.log(`Sample invoiceIds per bucket (up to ${SAMPLE_PER_BUCKET} each, sorted by exposure desc)`);
  console.log('='.repeat(80));
  for (const b of buckets) {
    const inBucket = findings
      .filter((f) => f.flags.has(b))
      .sort((a, z) => z.exposureCents - a.exposureCents);
    if (inBucket.length === 0) {
      console.log(`\n${b}: 0 rows`);
      continue;
    }
    console.log(`\n${b}: ${inBucket.length} rows. Top ${Math.min(SAMPLE_PER_BUCKET, inBucket.length)}:`);
    for (const f of inBucket.slice(0, SAMPLE_PER_BUCKET)) {
      console.log(
        `  invoiceId=${f.invoiceId} status=${f.status} amount=${fmt(f.amount ?? 0)} amountPaid=${fmt(f.amountPaid)} ` +
          `paymentGross=${fmt(f.paymentGross)} paymentRefunded=${fmt(f.paymentRefunded)} paymentNet=${fmt(f.paymentNet)} ` +
          `exposure=${fmt(f.exposureCents)} hasOrderId=${f.hasOrderId} statuses=[${f.paymentStatuses.join(',')}]`
      );
    }
  }

  // ---------- 5. CSV dump (optional) ----------
  if (CSV_PATH) {
    const header = [
      'invoiceId',
      'patientId',
      'status',
      'amount_cents',
      'amountPaid_cents',
      'amountDue_cents',
      'hasOrderId',
      'hasInvoiceItems',
      'hasLineItemsJson',
      'lineItemsJsonSum_cents',
      'paymentGross_cents',
      'paymentRefunded_cents',
      'paymentNet_cents',
      'paymentStatuses',
      'invoiceMetadataHasRefund',
      'invoiceMetadataRefundAmount_cents',
      'hasReconciliationRefundRow',
      'exposure_cents',
      'flags',
    ];
    const lines = [header.join(',')];
    for (const f of findings) {
      lines.push(
        [
          f.invoiceId,
          f.patientId,
          f.status,
          f.amount ?? '',
          f.amountPaid,
          f.amountDue ?? '',
          f.hasOrderId,
          f.hasInvoiceItems,
          f.hasLineItemsJson,
          f.lineItemsJsonSum ?? '',
          f.paymentGross,
          f.paymentRefunded,
          f.paymentNet,
          `"${f.paymentStatuses.join('|')}"`,
          f.invoiceMetadataHasRefund,
          f.invoiceMetadataRefundAmount ?? '',
          f.hasReconciliationRefundRow,
          f.exposureCents,
          `"${[...f.flags].join('|')}"`,
        ].join(',')
      );
    }
    fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n');
    console.log(`\nCSV written to ${CSV_PATH} (${findings.length} rows).`);
  }

  // ---------- 6. Top exposure invoices (the priority backfill list) ----------
  console.log('\n' + '='.repeat(80));
  console.log('Top 25 invoices by financial exposure (amountpaid_vs_payment_net)');
  console.log('='.repeat(80));
  const exposureSorted = findings
    .filter((f) => f.exposureCents > 0)
    .sort((a, z) => z.exposureCents - a.exposureCents)
    .slice(0, 25);
  if (exposureSorted.length === 0) {
    console.log('None.');
  } else {
    for (const f of exposureSorted) {
      console.log(
        `  invoiceId=${f.invoiceId} exposure=${fmt(f.exposureCents)} amountPaid=${fmt(f.amountPaid)} → corrected=${fmt(f.paymentNet)} flags=[${[...f.flags].join(',')}]`
      );
    }
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => basePrisma.$disconnect());
