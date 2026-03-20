/**
 * Upsert a sales rep commission plan for OT (subdomain `ot`) with:
 * - 8% base initial rate
 * - Weekly initial-sale revenue tiers (Mon–Sun, clinic timezone):
 *   $17,300+ → 9%, $23,000+ → 10%, $29,000+ → 11%, $35,000+ → 12%
 *
 * Run (production DB):
 *   npx tsx scripts/upsert-ot-initial-sales-weekly-tiers.ts
 *
 * Then assign reps via Admin → Sales Rep → Commission Plans or existing assignments API.
 */

import { prisma } from '@/lib/db';

const TIER_CEILINGS_USD = [0, 17_300, 23_000, 29_000, 35_000] as const;
const TOTAL_PERCENT = [8, 9, 10, 11, 12] as const;

async function main() {
  const clinic = await prisma.clinic.findFirst({
    where: { subdomain: 'ot', status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (!clinic) {
    console.error('No active clinic with subdomain "ot".');
    process.exit(1);
  }

  const baseBps = 800;
  const planName = 'OT — Initial sales (weekly revenue tiers)';

  const existing = await prisma.salesRepCommissionPlan.findFirst({
    where: { clinicId: clinic.id, name: planName },
  });

  const data = {
    name: planName,
    description:
      'Initial sales commission: 8% base; weekly initial-sale revenue bumps to 9–12% per OT brackets.',
    planType: 'PERCENT' as const,
    flatAmountCents: null as number | null,
    percentBps: baseBps,
    initialPercentBps: baseBps,
    initialFlatAmountCents: null as number | null,
    recurringPercentBps: null as number | null,
    recurringFlatAmountCents: null as number | null,
    appliesTo: 'FIRST_PAYMENT_ONLY' as const,
    holdDays: 0,
    clawbackEnabled: true,
    recurringEnabled: true,
    recurringMonths: null as number | null,
    isActive: true,
    multiItemBonusEnabled: false,
    multiItemBonusType: null as string | null,
    multiItemBonusPercentBps: null as number | null,
    multiItemBonusFlatCents: null as number | null,
    multiItemMinQuantity: null as number | null,
    volumeTierEnabled: true,
    volumeTierBasis: 'WEEKLY_REVENUE_CENTS',
    volumeTierWindow: 'CALENDAR_WEEK_MON_SUN',
    volumeTierRetroactive: true,
    reactivationDays: null as number | null,
  };

  const plan = existing
    ? await prisma.salesRepCommissionPlan.update({
        where: { id: existing.id },
        data: {
          ...data,
          volumeTiers: {
            deleteMany: {},
            create: TIER_CEILINGS_USD.map((usdMin, idx) => ({
              minSales: idx + 1,
              maxSales: null,
              amountCents: 0,
              minRevenueCents: usdMin * 100,
              additionalPercentBps: TOTAL_PERCENT[idx]! * 100 - baseBps,
              sortOrder: idx,
            })),
          },
        },
      })
    : await prisma.salesRepCommissionPlan.create({
        data: {
          clinicId: clinic.id,
          ...data,
          volumeTiers: {
            create: TIER_CEILINGS_USD.map((usdMin, idx) => ({
              minSales: idx + 1,
              maxSales: null,
              amountCents: 0,
              minRevenueCents: usdMin * 100,
              additionalPercentBps: TOTAL_PERCENT[idx]! * 100 - baseBps,
              sortOrder: idx,
            })),
          },
        },
      });

  console.log(`Clinic ${clinic.id} (${clinic.name}): plan id ${plan.id} — ${plan.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
