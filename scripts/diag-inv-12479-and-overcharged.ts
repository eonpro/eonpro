/**
 * Diagnostic: verify the $24,900.00 patient-portal display issue is purely
 * a (now-fixed) display bug and not stored DB corruption.
 *
 * Checks:
 *   1. The specific invoice in the user-supplied screenshot: INV-12479,
 *      Tirzepatide Injections (Monthly), Mar 30 2026.
 *   2. Any Invoice rows where amount / amountPaid / amountDue >= $10,000
 *      (1,000,000 cents) on the WellMedR clinic — values that high almost
 *      certainly indicate a stored-cents-times-100 corruption rather than
 *      a legitimate charge.
 *
 * READ-ONLY. No mutations.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// $10,000 = 1,000,000 cents. Higher than any realistic single GLP-1 charge.
const SUSPICIOUS_CENTS_THRESHOLD = 1_000_000;

function fmt(cents: number | null | undefined): string {
  if (cents == null) return 'null';
  return `${cents}c ($${(cents / 100).toFixed(2)})`;
}

async function main() {
  console.log('='.repeat(80));
  console.log('STEP 1 — Locate WellMedR clinic');
  console.log('='.repeat(80));

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'WellMedR', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    console.log('No WellMedR clinic found. Aborting.');
    return;
  }
  console.log(`Clinic: id=${clinic.id} name="${clinic.name}" subdomain=${clinic.subdomain}`);

  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — Look up INV-12479 (the invoice in the screenshot)');
  console.log('='.repeat(80));

  // The patient portal renders invoice.number as `inv.stripeInvoiceNumber || `INV-${inv.id}``.
  // So "INV-12479" could be either the literal Stripe invoice number OR Invoice.id = 12479.
  const candidates = await prisma.invoice.findMany({
    where: {
      OR: [
        { stripeInvoiceNumber: 'INV-12479' },
        { stripeInvoiceNumber: '12479' },
        { id: 12479 },
      ],
    },
    select: {
      id: true,
      clinicId: true,
      stripeInvoiceId: true,
      stripeInvoiceNumber: true,
      description: true,
      amount: true,
      amountDue: true,
      amountPaid: true,
      currency: true,
      status: true,
      createdAt: true,
      paidAt: true,
      patientId: true,
    },
  });

  if (candidates.length === 0) {
    console.log('No invoice matches INV-12479 (neither stripeInvoiceNumber nor id=12479).');
  } else {
    for (const inv of candidates) {
      console.log('---');
      console.log(`Invoice.id            = ${inv.id}`);
      console.log(`clinicId              = ${inv.clinicId}`);
      console.log(`stripeInvoiceId       = ${inv.stripeInvoiceId}`);
      console.log(`stripeInvoiceNumber   = ${inv.stripeInvoiceNumber}`);
      console.log(`description           = ${inv.description}`);
      console.log(`status                = ${inv.status}`);
      console.log(`createdAt             = ${inv.createdAt.toISOString()}`);
      console.log(`paidAt                = ${inv.paidAt?.toISOString() ?? 'null'}`);
      console.log(`amount      (raw)     = ${fmt(inv.amount)}`);
      console.log(`amountDue   (raw)     = ${fmt(inv.amountDue)}`);
      console.log(`amountPaid  (raw)     = ${fmt(inv.amountPaid)}`);
      console.log(`currency              = ${inv.currency}`);
      console.log(`patientId             = ${inv.patientId}`);

      // Diagnostic verdict
      const display = inv.amountPaid || inv.amount || inv.amountDue || 0;
      const dollars = display / 100;
      console.log(`-> patient portal would display: $${dollars.toFixed(2)}`);
      if (dollars >= 10_000) {
        console.log(`   STATUS: STORED VALUE IS CORRUPT (display would still be wrong post-fix).`);
      } else {
        console.log(`   STATUS: Stored value is sane; the screenshot was the API double-multiply bug.`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(
    `STEP 3 — Scan all WellMedR invoices for stored values >= $${(SUSPICIOUS_CENTS_THRESHOLD / 100).toFixed(0)} (likely corrupt)`
  );
  console.log('='.repeat(80));

  const oversized = await prisma.invoice.findMany({
    where: {
      clinicId: clinic.id,
      OR: [
        { amount: { gte: SUSPICIOUS_CENTS_THRESHOLD } },
        { amountPaid: { gte: SUSPICIOUS_CENTS_THRESHOLD } },
        { amountDue: { gte: SUSPICIOUS_CENTS_THRESHOLD } },
      ],
    },
    select: {
      id: true,
      stripeInvoiceNumber: true,
      description: true,
      amount: true,
      amountDue: true,
      amountPaid: true,
      status: true,
      createdAt: true,
      patientId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  console.log(`Found ${oversized.length} invoice rows with stored cents >= ${SUSPICIOUS_CENTS_THRESHOLD}.`);
  if (oversized.length > 0) {
    console.log('-'.repeat(80));
    for (const inv of oversized) {
      console.log(
        `id=${inv.id} number=${inv.stripeInvoiceNumber ?? '(none)'} ` +
          `status=${inv.status} created=${inv.createdAt.toISOString().slice(0, 10)} ` +
          `patientId=${inv.patientId}`
      );
      console.log(
        `  amount=${fmt(inv.amount)}  amountPaid=${fmt(inv.amountPaid)}  amountDue=${fmt(inv.amountDue)}`
      );
      console.log(`  description=${inv.description ?? ''}`);
    }
  } else {
    console.log('No oversized invoices. The $24,900.00 screenshot was purely the (now-fixed) display bug.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — Sanity check: 5 most recent WellMedR PAID invoices');
  console.log('='.repeat(80));

  const recent = await prisma.invoice.findMany({
    where: { clinicId: clinic.id, status: 'PAID' },
    select: {
      id: true,
      stripeInvoiceNumber: true,
      amountPaid: true,
      amount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const inv of recent) {
    const display = inv.amountPaid || inv.amount || 0;
    console.log(
      `id=${inv.id} number=${inv.stripeInvoiceNumber ?? '(none)'} ` +
        `created=${inv.createdAt.toISOString().slice(0, 10)} ` +
        `amountPaid=${fmt(inv.amountPaid)} -> display=$${(display / 100).toFixed(2)}`
    );
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
