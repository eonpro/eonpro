/**
 * Backfill Affiliate Commissions Script
 *
 * Retroactively creates AffiliateCommissionEvent records for paid invoices
 * where the patient has affiliate attribution but no commission was ever created.
 *
 * This fixes the gap where invoice.payment_succeeded webhook events were NOT
 * triggering commission processing (the handler only updated invoice status).
 *
 * Usage:
 *   npx tsx scripts/backfill-affiliate-commissions.ts
 *
 * Options:
 *   --dry-run       Preview changes without writing to database
 *   --clinic=ID     Only process invoices for a specific clinic
 *   --limit=N       Limit the number of invoices to process
 *   --verbose       Show detailed output for each invoice
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const clinicArg = args.find(a => a.startsWith('--clinic='));
const limitArg = args.find(a => a.startsWith('--limit='));
const targetClinicId = clinicArg ? parseInt(clinicArg.split('=')[1], 10) : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

interface BackfillResult {
  invoiceId: number;
  patientId: number;
  affiliateId: number;
  amountPaidCents: number;
  commissionAmountCents: number;
  status: 'created' | 'skipped' | 'error';
  reason: string;
}

const results: BackfillResult[] = [];

async function main() {
  console.log('='.repeat(70));
  console.log('Affiliate Commission Backfill');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (targetClinicId) console.log(`Clinic filter: ${targetClinicId}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log('');

  // Step 1: Find all PAID invoices for patients with affiliate attribution
  // that DON'T already have a commission event
  console.log('Step 1: Finding paid invoices with attributed patients missing commissions...');

  const paidInvoices = await prisma.invoice.findMany({
    where: {
      status: 'PAID',
      amountPaid: { gt: 0 },
      ...(targetClinicId ? { clinicId: targetClinicId } : {}),
      patient: {
        attributionAffiliateId: { not: null },
      },
    },
    include: {
      patient: {
        select: {
          id: true,
          attributionAffiliateId: true,
          attributionRefCode: true,
        },
      },
    },
    orderBy: { paidAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Found ${paidInvoices.length} paid invoices for attributed patients`);

  // Step 2: For each invoice, check if a commission event already exists
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const invoice of paidInvoices) {
    const affiliateId = invoice.patient!.attributionAffiliateId!;
    const patientId = invoice.patient!.id;
    const amountPaidCents = invoice.amountPaid || 0;

    // Check if commission already exists for this invoice
    const existingCommission = await prisma.affiliateCommissionEvent.findFirst({
      where: {
        affiliateId,
        stripeObjectId: invoice.stripeInvoiceId || `invoice-${invoice.id}`,
        clinicId: invoice.clinicId || 0,
      },
    });

    if (existingCommission) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - commission already exists (event #${existingCommission.id})`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: `Commission already exists (event #${existingCommission.id})`,
      });
      skipped++;
      continue;
    }

    // Also check by a broader match (stripeEventId pattern)
    const existingByEventId = await prisma.affiliateCommissionEvent.findFirst({
      where: {
        affiliateId,
        clinicId: invoice.clinicId || 0,
        stripeEventId: {
          startsWith: invoice.stripeInvoiceId
            ? `invoice_paid_${invoice.stripeInvoiceId}`
            : `backfill_invoice_${invoice.id}`,
        },
      },
    });

    if (existingByEventId) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - commission already exists by event ID (event #${existingByEventId.id})`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: `Commission exists by event ID (event #${existingByEventId.id})`,
      });
      skipped++;
      continue;
    }

    // Get the affiliate and verify it's active
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliateId,
        clinicId: invoice.clinicId || undefined,
        status: 'ACTIVE',
      },
    });

    if (!affiliate) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - affiliate #${affiliateId} not active`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: `Affiliate #${affiliateId} not active`,
      });
      skipped++;
      continue;
    }

    // Get effective commission plan
    const occurredAt = invoice.paidAt || invoice.updatedAt;
    const planAssignment = await prisma.affiliatePlanAssignment.findFirst({
      where: {
        affiliateId,
        clinicId: invoice.clinicId || undefined,
        effectiveFrom: { lte: occurredAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: occurredAt } }],
      },
      include: {
        commissionPlan: true,
      },
      orderBy: {
        effectiveFrom: 'desc',
      },
    });

    const plan = planAssignment?.commissionPlan;

    if (!plan || !plan.isActive) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - no active commission plan for affiliate #${affiliateId}`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: 'No active commission plan',
      });
      skipped++;
      continue;
    }

    // Calculate commission
    let commissionAmountCents = 0;
    if (plan.planType === 'FLAT') {
      commissionAmountCents = plan.flatAmountCents || 0;
    } else if (plan.planType === 'PERCENT' && plan.percentBps) {
      commissionAmountCents = Math.round((amountPaidCents * plan.percentBps) / 10000);
    }

    if (commissionAmountCents <= 0) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - zero commission (plan: ${plan.planType}, bps: ${plan.percentBps}, flat: ${plan.flatAmountCents})`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: `Zero commission calculated`,
      });
      skipped++;
      continue;
    }

    // Determine if this was the first payment for the patient
    const priorPaymentCount = await prisma.payment.count({
      where: {
        patientId,
        status: 'SUCCEEDED',
        invoiceId: { not: invoice.id },
        paidAt: { lt: occurredAt },
      },
    });

    const isFirstPayment = priorPaymentCount === 0;

    // Check first_payment_only restriction
    if (plan.appliesTo === 'FIRST_PAYMENT_ONLY' && !isFirstPayment) {
      if (verbose) {
        console.log(`  SKIP Invoice #${invoice.id} - plan only applies to first payment, this is payment #${priorPaymentCount + 1}`);
      }
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents: 0,
        status: 'skipped',
        reason: 'Plan applies to first payment only',
      });
      skipped++;
      continue;
    }

    const stripeEventId = invoice.stripeInvoiceId
      ? `backfill_invoice_paid_${invoice.stripeInvoiceId}`
      : `backfill_invoice_${invoice.id}`;

    console.log(
      `  ${dryRun ? 'WOULD CREATE' : 'CREATE'} commission for Invoice #${invoice.id}: ` +
      `$${(amountPaidCents / 100).toFixed(2)} payment → $${(commissionAmountCents / 100).toFixed(2)} commission ` +
      `(${plan.planType === 'PERCENT' ? `${plan.percentBps! / 100}%` : `$${(plan.flatAmountCents || 0) / 100}`}) ` +
      `for affiliate #${affiliateId} (${affiliate.displayName})`
    );

    if (!dryRun) {
      try {
        // Create commission event + update lifetime stats in a transaction
        await prisma.$transaction(async (tx) => {
          await tx.affiliateCommissionEvent.create({
            data: {
              clinicId: invoice.clinicId || 0,
              affiliateId,
              stripeEventId,
              stripeObjectId: invoice.stripeInvoiceId || `invoice-${invoice.id}`,
              stripeEventType: 'invoice.payment_succeeded',
              eventAmountCents: amountPaidCents,
              commissionAmountCents,
              baseCommissionCents: commissionAmountCents,
              tierBonusCents: 0,
              promotionBonusCents: 0,
              productAdjustmentCents: 0,
              commissionPlanId: plan.id,
              isRecurring: false,
              recurringMonth: null,
              attributionModel: 'STORED',
              status: 'APPROVED', // Backfilled commissions are pre-approved
              occurredAt,
              holdUntil: null,
              approvedAt: new Date(),
              metadata: {
                backfilled: true,
                backfilledAt: new Date().toISOString(),
                planName: plan.name,
                planType: plan.planType,
                refCode: invoice.patient!.attributionRefCode,
                isFirstPayment,
              },
            },
          });

          // Update affiliate's lifetime stats
          await tx.affiliate.update({
            where: { id: affiliateId },
            data: {
              lifetimeConversions: { increment: 1 },
              lifetimeRevenueCents: { increment: amountPaidCents },
            },
          });
        });

        results.push({
          invoiceId: invoice.id,
          patientId,
          affiliateId,
          amountPaidCents,
          commissionAmountCents,
          status: 'created',
          reason: `${plan.planType} plan: ${plan.planType === 'PERCENT' ? `${plan.percentBps! / 100}%` : `$${(plan.flatAmountCents || 0) / 100}`}`,
        });
        created++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`  ERROR Invoice #${invoice.id}: ${errMsg}`);
        results.push({
          invoiceId: invoice.id,
          patientId,
          affiliateId,
          amountPaidCents,
          commissionAmountCents,
          status: 'error',
          reason: errMsg,
        });
        errors++;
      }
    } else {
      results.push({
        invoiceId: invoice.id,
        patientId,
        affiliateId,
        amountPaidCents,
        commissionAmountCents,
        status: 'created',
        reason: `DRY RUN - would create`,
      });
      created++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Total invoices checked: ${paidInvoices.length}`);
  console.log(`Commissions ${dryRun ? 'would be ' : ''}created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (created > 0) {
    const totalCommissionCents = results
      .filter(r => r.status === 'created')
      .reduce((sum, r) => sum + r.commissionAmountCents, 0);
    const totalRevenueCents = results
      .filter(r => r.status === 'created')
      .reduce((sum, r) => sum + r.amountPaidCents, 0);

    console.log('');
    console.log(`Total revenue from backfilled payments: $${(totalRevenueCents / 100).toFixed(2)}`);
    console.log(`Total commissions ${dryRun ? 'to be ' : ''}created: $${(totalCommissionCents / 100).toFixed(2)}`);
  }

  // Per-affiliate breakdown
  const affiliateMap = new Map<number, { name: string; count: number; commissionCents: number; revenueCents: number }>();
  for (const r of results.filter(r => r.status === 'created')) {
    const existing = affiliateMap.get(r.affiliateId) || { name: '', count: 0, commissionCents: 0, revenueCents: 0 };
    existing.count++;
    existing.commissionCents += r.commissionAmountCents;
    existing.revenueCents += r.amountPaidCents;
    affiliateMap.set(r.affiliateId, existing);
  }

  if (affiliateMap.size > 0) {
    console.log('');
    console.log('Per-affiliate breakdown:');
    for (const [affId, stats] of affiliateMap) {
      console.log(
        `  Affiliate #${affId}: ${stats.count} conversions, ` +
        `$${(stats.revenueCents / 100).toFixed(2)} revenue, ` +
        `$${(stats.commissionCents / 100).toFixed(2)} commission`
      );
    }
  }

  if (dryRun) {
    console.log('');
    console.log('*** DRY RUN - No changes were made. Run without --dry-run to apply. ***');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
