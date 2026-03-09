/**
 * Backfill Sales Rep Commissions
 *
 * For each patient assigned to a sales rep who has successful payments,
 * create SalesRepCommissionEvent records based on the rep's commission plan.
 *
 * Usage: npx tsx scripts/backfill-sales-rep-commissions.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function calculateBaseCommission(
  amountCents: number,
  planType: string,
  flatAmountCents: number | null,
  percentBps: number | null
): number {
  if (planType === 'FLAT') return flatAmountCents || 0;
  if (planType === 'PERCENT' && percentBps) return Math.round((amountCents * percentBps) / 10000);
  return 0;
}

async function main() {
  console.log('=== Sales Rep Commission Backfill ===\n');

  // Find all active sales rep -> patient assignments
  const assignments = await prisma.patientSalesRepAssignment.findMany({
    where: { isActive: true },
    select: {
      salesRepId: true,
      patientId: true,
      clinicId: true,
      assignedAt: true,
    },
  });

  console.log(`Found ${assignments.length} active patient-to-rep assignments\n`);

  let created = 0;
  let skipped = 0;
  let noplan = 0;
  let errors = 0;

  for (const assignment of assignments) {
    try {
      // Get the rep's current commission plan
      const planAssignment = await prisma.salesRepPlanAssignment.findFirst({
        where: {
          salesRepId: assignment.salesRepId,
          clinicId: assignment.clinicId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        include: { commissionPlan: true },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (!planAssignment?.commissionPlan || !planAssignment.commissionPlan.isActive) {
        noplan++;
        continue;
      }

      const plan = planAssignment.commissionPlan;

      // Find successful payments for this patient
      const payments = await prisma.payment.findMany({
        where: {
          patientId: assignment.patientId,
          status: 'SUCCEEDED',
          amount: { gt: 0 },
        },
        select: {
          id: true,
          amount: true,
          stripePaymentIntentId: true,
          createdAt: true,
          clinicId: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (payments.length === 0) {
        skipped++;
        continue;
      }

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        const clinicId = payment.clinicId || assignment.clinicId;

        // Check if commission already exists for this payment
        const existing = await prisma.salesRepCommissionEvent.findFirst({
          where: {
            salesRepId: assignment.salesRepId,
            clinicId,
            stripeObjectId: payment.stripePaymentIntentId || `payment-${payment.id}`,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const isFirstPayment = i === 0;

        // Check appliesTo policy
        if (plan.appliesTo === 'FIRST_PAYMENT_ONLY' && !isFirstPayment) {
          skipped++;
          continue;
        }

        // Use initial rates for first payment, default rates otherwise
        const effectivePercentBps = isFirstPayment
          ? (plan.initialPercentBps ?? plan.percentBps)
          : (plan.recurringPercentBps ?? plan.percentBps);
        const effectiveFlatCents = isFirstPayment
          ? (plan.initialFlatAmountCents ?? plan.flatAmountCents)
          : (plan.recurringFlatAmountCents ?? plan.flatAmountCents);

        if (!isFirstPayment && !plan.recurringEnabled) {
          skipped++;
          continue;
        }

        const commissionAmountCents = calculateBaseCommission(
          payment.amount,
          plan.planType,
          effectiveFlatCents,
          effectivePercentBps
        );

        if (commissionAmountCents <= 0) {
          skipped++;
          continue;
        }

        await prisma.salesRepCommissionEvent.create({
          data: {
            clinicId,
            salesRepId: assignment.salesRepId,
            stripeObjectId: payment.stripePaymentIntentId || `payment-${payment.id}`,
            stripeEventId: `backfill-${payment.id}`,
            stripeEventType: 'backfill',
            eventAmountCents: payment.amount,
            commissionAmountCents,
            baseCommissionCents: commissionAmountCents,
            commissionPlanId: plan.id,
            patientId: assignment.patientId,
            isRecurring: !isFirstPayment,
            status: 'APPROVED',
            occurredAt: payment.createdAt,
            isManual: false,
            notes: 'Backfilled from existing payment',
            metadata: {
              planName: plan.name,
              planType: plan.planType,
              source: 'backfill-script',
              paymentId: payment.id,
            },
          },
        });

        created++;
      }
    } catch (err) {
      errors++;
      console.error(`Error processing assignment salesRepId=${assignment.salesRepId} patientId=${assignment.patientId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`  Created:  ${created} commission events`);
  console.log(`  Skipped:  ${skipped} (already exists, no payments, or policy excluded)`);
  console.log(`  No plan:  ${noplan} reps without active commission plans`);
  console.log(`  Errors:   ${errors}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
