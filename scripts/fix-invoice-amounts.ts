/**
 * Fix Invoice Amount Bug
 * 
 * This script fixes invoices where the amount was stored incorrectly due to
 * the cents/dollars conversion bug in the wellmedr-invoice webhook.
 * 
 * The bug: When price came as a number >= 1000 (e.g., 1134 for $1,134.00),
 * it was stored as 1134 cents ($11.34) instead of 113400 cents ($1,134.00).
 * 
 * Usage:
 *   npx ts-node scripts/fix-invoice-amounts.ts --dry-run     # Preview changes
 *   npx ts-node scripts/fix-invoice-amounts.ts               # Apply fixes
 *   npx ts-node scripts/fix-invoice-amounts.ts --invoice-id=123 --correct-cents=113400  # Fix specific invoice
 *   npx ts-node scripts/fix-invoice-amounts.ts --patient-email=kcrisp2014@gmail.com --correct-cents=113400  # Fix by email
 * 
 * For Production:
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/fix-invoice-amounts.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface InvoiceWithMetadata {
  id: number;
  patientId: number;
  amount: number | null;
  amountPaid: number;
  amountDue: number | null;
  status: string;
  createdAt: Date;
  metadata: {
    source?: string;
    stripePriceId?: string;
    product?: string;
    plan?: string;
    summary?: {
      total?: number;
      amountPaid?: number;
    };
  } | null;
  patient: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

// Known price mappings from Stripe price IDs (can be expanded)
const KNOWN_PRICES: Record<string, number> = {
  // Add known stripe_price_id -> amount in cents mappings here
  // e.g., 'price_1SvhJxDfH4PWyxxd': 113400, // $1,134.00
};

// Thresholds for detecting suspicious amounts
// GLP-1 medications typically cost $200-$2000
const MIN_EXPECTED_CENTS = 10000;  // $100 minimum (unlikely for GLP-1)
const MAX_REASONABLE_WRONG_AMOUNT = 9999;  // Values 1000-9999 are likely wrong (should be 100000-999900)

async function findSuspiciousInvoices(): Promise<InvoiceWithMetadata[]> {
  // Find wellmedr invoices with suspiciously low amounts
  const invoices = await prisma.invoice.findMany({
    where: {
      metadata: {
        path: ['source'],
        equals: 'wellmedr-airtable',
      },
      // Amount between 100-9999 cents ($1-$99.99) is suspicious for GLP-1 meds
      amount: {
        gte: 100,
        lte: MAX_REASONABLE_WRONG_AMOUNT,
      },
    },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invoices as unknown as InvoiceWithMetadata[];
}

async function findInvoiceById(invoiceId: number): Promise<InvoiceWithMetadata | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return invoice as unknown as InvoiceWithMetadata;
}

async function fixInvoiceAmount(
  invoiceId: number,
  correctAmountCents: number,
  dryRun: boolean
): Promise<void> {
  const invoice = await findInvoiceById(invoiceId);
  
  if (!invoice) {
    console.error(`Invoice ${invoiceId} not found`);
    return;
  }

  console.log(`\nFixing Invoice #${invoiceId}:`);
  console.log(`  Patient: ${invoice.patient.firstName} ${invoice.patient.lastName}`);
  console.log(`  Email: ${invoice.patient.email}`);
  console.log(`  Current amount: ${invoice.amount} cents ($${((invoice.amount || 0) / 100).toFixed(2)})`);
  console.log(`  Correct amount: ${correctAmountCents} cents ($${(correctAmountCents / 100).toFixed(2)})`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would update amount to ${correctAmountCents} cents`);
    return;
  }

  // Update the invoice
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amount: correctAmountCents,
      amountPaid: correctAmountCents,
      amountDue: 0,
      metadata: {
        ...(invoice.metadata || {}),
        amountFixedAt: new Date().toISOString(),
        amountFixedFrom: invoice.amount,
        amountFixedTo: correctAmountCents,
        summary: {
          ...((invoice.metadata?.summary) || {}),
          total: correctAmountCents,
          amountPaid: correctAmountCents,
        },
      },
    },
  });

  console.log(`  ✓ Updated successfully!`);
}

async function findInvoiceByPatientEmail(email: string): Promise<InvoiceWithMetadata | null> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      patient: {
        email: { equals: email, mode: 'insensitive' }
      },
      status: 'PAID',
    },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invoice as unknown as InvoiceWithMetadata;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const invoiceIdArg = args.find(a => a.startsWith('--invoice-id='));
  const patientEmailArg = args.find(a => a.startsWith('--patient-email='));
  const correctCentsArg = args.find(a => a.startsWith('--correct-cents='));

  console.log('='.repeat(60));
  console.log('Invoice Amount Fix Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will apply fixes)'}`);
  console.log('');

  // If specific invoice ID provided, fix just that one
  if (invoiceIdArg && correctCentsArg) {
    const invoiceId = parseInt(invoiceIdArg.split('=')[1]);
    const correctCents = parseInt(correctCentsArg.split('=')[1]);
    
    await fixInvoiceAmount(invoiceId, correctCents, dryRun);
    return;
  }

  // If patient email provided, find and fix their invoice
  if (patientEmailArg && correctCentsArg) {
    const email = patientEmailArg.split('=')[1];
    const correctCents = parseInt(correctCentsArg.split('=')[1]);
    
    console.log(`Looking for invoice for patient: ${email}`);
    const invoice = await findInvoiceByPatientEmail(email);
    
    if (!invoice) {
      console.error(`No paid invoice found for patient email: ${email}`);
      return;
    }
    
    await fixInvoiceAmount(invoice.id, correctCents, dryRun);
    return;
  }

  // Otherwise, find and list all suspicious invoices
  console.log('Finding suspicious invoices (wellmedr-airtable with amount < $100)...\n');
  
  const suspicious = await findSuspiciousInvoices();

  if (suspicious.length === 0) {
    console.log('No suspicious invoices found.');
    return;
  }

  console.log(`Found ${suspicious.length} suspicious invoice(s):\n`);

  for (const inv of suspicious) {
    const currentDollars = ((inv.amount || 0) / 100).toFixed(2);
    const likelyCorrectCents = (inv.amount || 0) * 100;
    const likelyCorrectDollars = (likelyCorrectCents / 100).toFixed(2);
    
    console.log(`Invoice #${inv.id}:`);
    console.log(`  Patient: ${inv.patient.firstName} ${inv.patient.lastName} (${inv.patient.email})`);
    console.log(`  Created: ${inv.createdAt.toISOString()}`);
    console.log(`  Product: ${inv.metadata?.product || 'N/A'} / Plan: ${inv.metadata?.plan || 'N/A'}`);
    console.log(`  Current: ${inv.amount} cents = $${currentDollars}`);
    console.log(`  Likely correct: ${likelyCorrectCents} cents = $${likelyCorrectDollars}`);
    console.log(`  Status: ${inv.status}`);
    console.log('');

    // Auto-fix if amount * 100 gives a reasonable value
    if (likelyCorrectCents >= MIN_EXPECTED_CENTS && likelyCorrectCents <= 500000) { // $100 - $5000
      if (!dryRun) {
        console.log(`  Auto-fixing: ${inv.amount} → ${likelyCorrectCents} cents`);
        await fixInvoiceAmount(inv.id, likelyCorrectCents, false);
      } else {
        console.log(`  [DRY RUN] Would auto-fix: ${inv.amount} → ${likelyCorrectCents} cents`);
      }
    } else {
      console.log(`  ⚠️  Cannot auto-fix - please review manually`);
      console.log(`  To fix: npx ts-node scripts/fix-invoice-amounts.ts --invoice-id=${inv.id} --correct-cents=AMOUNT`);
    }
    console.log('');
  }

  console.log('='.repeat(60));
  if (dryRun) {
    console.log('This was a DRY RUN. Run without --dry-run to apply fixes.');
  } else {
    console.log('Fixes applied.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
