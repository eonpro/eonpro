/**
 * Check and Migrate OT Affiliates
 *
 * This script:
 * 1. Finds the OT clinic ID
 * 2. Lists all influencers in the legacy system
 * 3. Lists all affiliates in the modern system
 * 4. Shows which influencers are missing from the modern system
 * 5. Can optionally migrate legacy influencers to modern affiliates
 *
 * Usage:
 *   npx tsx scripts/check-and-migrate-ot-affiliates.ts [--migrate]
 *
 *   --migrate: Actually perform the migration (default: dry-run)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OVERTIME_SUBDOMAIN = 'ot';

async function main() {
  const migrate = process.argv.includes('--migrate');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`OT AFFILIATE CHECK & MIGRATION TOOL`);
  console.log(`Mode: ${migrate ? '🚀 LIVE MIGRATION' : '👀 DRY-RUN (use --migrate to execute)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Find OT Clinic
  const otClinic = await prisma.clinic.findFirst({
    where: { subdomain: OVERTIME_SUBDOMAIN },
  });

  if (!otClinic) {
    console.error('❌ OT clinic not found! Make sure the clinic with subdomain "ot" exists.');
    return;
  }

  console.log(`✅ Found OT Clinic: ID=${otClinic.id}, Name="${otClinic.name}"`);
  console.log();

  // Step 2: Get all legacy influencers
  const legacyInfluencers = await prisma.influencer.findMany({
    where: {
      OR: [
        { clinicId: otClinic.id },
        { clinicId: null }, // Some influencers might be global
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`📋 LEGACY INFLUENCERS (${legacyInfluencers.length} total):`);
  console.log('-'.repeat(60));

  if (legacyInfluencers.length === 0) {
    console.log('  (none found)');
  } else {
    for (const inf of legacyInfluencers) {
      console.log(`  ID: ${inf.id}`);
      console.log(`    Name: ${inf.name}`);
      console.log(`    Email: ${inf.email}`);
      console.log(`    Promo Code: ${inf.promoCode}`);
      console.log(`    Status: ${inf.status}`);
      console.log(`    Commission Rate: ${(inf.commissionRate * 100).toFixed(1)}%`);
      console.log(`    Clinic ID: ${inf.clinicId || '(global)'}`);
      console.log();
    }
  }

  // Step 3: Get all modern affiliates for OT clinic
  const modernAffiliates = await prisma.affiliate.findMany({
    where: { clinicId: otClinic.id },
    include: {
      refCodes: true,
      user: {
        select: { email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📋 MODERN AFFILIATES (${modernAffiliates.length} total for OT clinic):`);
  console.log('-'.repeat(60));

  if (modernAffiliates.length === 0) {
    console.log('  (none found)');
  } else {
    for (const aff of modernAffiliates) {
      console.log(`  ID: ${aff.id}`);
      console.log(`    Display Name: ${aff.displayName}`);
      console.log(`    Email: ${aff.user?.email || '(no user linked)'}`);
      console.log(`    Status: ${aff.status}`);
      console.log(`    Lifetime Conversions: ${aff.lifetimeConversions}`);
      console.log(`    Ref Codes: ${aff.refCodes.map((rc: { refCode: string }) => rc.refCode).join(', ') || '(none)'}`);
      console.log();
    }
  }

  // Step 4: Get all ref codes for OT clinic
  const allRefCodes = await prisma.affiliateRefCode.findMany({
    where: { clinicId: otClinic.id },
    include: {
      affiliate: {
        select: { displayName: true },
      },
    },
  });

  console.log(`\n📋 ALL REF CODES FOR OT (${allRefCodes.length} total):`);
  console.log('-'.repeat(60));

  if (allRefCodes.length === 0) {
    console.log('  (none found)');
  } else {
    for (const rc of allRefCodes) {
      console.log(`  ${rc.refCode} -> ${rc.affiliate.displayName} (active: ${rc.isActive})`);
    }
  }

  // Step 5: Find legacy influencers NOT in modern system
  const modernRefCodeSet = new Set(allRefCodes.map((rc: { refCode: string }) => rc.refCode.toUpperCase()));

  const missingInfluencers = legacyInfluencers.filter(
    (inf) => !modernRefCodeSet.has(inf.promoCode.toUpperCase())
  );

  console.log(`\n⚠️  LEGACY INFLUENCERS MISSING FROM MODERN SYSTEM (${missingInfluencers.length}):`);
  console.log('-'.repeat(60));

  if (missingInfluencers.length === 0) {
    console.log('  ✅ All legacy influencers are already in the modern system!');
  } else {
    for (const inf of missingInfluencers) {
      console.log(`  ❌ ${inf.promoCode} (${inf.name}, ${inf.email})`);
    }

    // Step 6: Migration
    if (migrate) {
      console.log(`\n🚀 MIGRATING ${missingInfluencers.length} INFLUENCERS TO MODERN SYSTEM...`);
      console.log('-'.repeat(60));

      // Get or create default commission plan
      let defaultPlan = await prisma.affiliateCommissionPlan.findFirst({
        where: {
          clinicId: otClinic.id,
          isActive: true,
        },
      });

      if (!defaultPlan) {
        console.log('  Creating default commission plan...');
        defaultPlan = await prisma.affiliateCommissionPlan.create({
          data: {
            clinicId: otClinic.id,
            name: 'Default 10%',
            description: 'Default commission plan for migrated affiliates',
            planType: 'PERCENT',
            percentBps: 1000, // 10%
            appliesTo: 'ALL_PAYMENTS',
            isActive: true,
          },
        });
        console.log(`  ✅ Created default plan: "${defaultPlan.name}" (ID: ${defaultPlan.id})`);
      } else {
        console.log(`  Using existing plan: "${defaultPlan.name}" (ID: ${defaultPlan.id})`);
      }

      for (const inf of missingInfluencers) {
        console.log(`\n  Migrating: ${inf.promoCode} (${inf.name})...`);

        try {
          // Check if user exists with this email
          let user = await prisma.user.findUnique({
            where: { email: inf.email.toLowerCase() },
          });

          if (!user) {
            // Create a new user for this affiliate
            console.log(`    Creating user for ${inf.email}...`);
            user = await prisma.user.create({
              data: {
                email: inf.email.toLowerCase(),
                name: inf.name,
                role: 'affiliate',
                clinicId: otClinic.id,
                passwordHash: inf.passwordHash || null,
              },
            });
            console.log(`    ✅ Created user ID: ${user.id}`);
          } else {
            console.log(`    Using existing user ID: ${user.id}`);
          }

          // Check if affiliate already exists for this user
          const existingAffiliate = await prisma.affiliate.findUnique({
            where: { userId: user.id },
          });

          let affiliate: { id: number; displayName: string };

          if (existingAffiliate) {
            affiliate = existingAffiliate;
            console.log(`    Using existing affiliate ID: ${affiliate.id}`);
          } else {
            // Create affiliate
            affiliate = await prisma.affiliate.create({
              data: {
                clinicId: otClinic.id,
                userId: user.id,
                displayName: inf.name,
                status: inf.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
              },
            });
            console.log(`    ✅ Created affiliate ID: ${affiliate.id}`);
          }

          // Create ref code
          const refCode = await prisma.affiliateRefCode.create({
            data: {
              clinicId: otClinic.id,
              affiliateId: affiliate.id,
              refCode: inf.promoCode.toUpperCase(),
              description: `Migrated from legacy influencer ID: ${inf.id}`,
              isActive: inf.status === 'ACTIVE',
            },
          });
          console.log(`    ✅ Created ref code: ${refCode.refCode}`);

          // Assign to default plan
          await prisma.affiliatePlanAssignment.create({
            data: {
              clinicId: otClinic.id,
              affiliateId: affiliate.id,
              commissionPlanId: defaultPlan.id,
            },
          });
          console.log(`    ✅ Assigned to commission plan`);

          console.log(`  ✅ Successfully migrated: ${inf.promoCode}`);
        } catch (error) {
          console.error(`  ❌ Failed to migrate ${inf.promoCode}:`, error);
        }
      }

      console.log(`\n✅ Migration complete!`);
    } else {
      console.log(`\n💡 Run with --migrate flag to perform the migration:`);
      console.log(`   npx tsx scripts/check-and-migrate-ot-affiliates.ts --migrate`);
    }
  }

  // Step 7: Check recent referral tracking
  console.log(`\n📊 RECENT REFERRAL ACTIVITY (last 30 days):`);
  console.log('-'.repeat(60));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Legacy referrals
  const legacyReferrals = await prisma.referralTracking.count({
    where: {
      createdAt: { gte: thirtyDaysAgo },
      influencer: {
        OR: [
          { clinicId: otClinic.id },
          { clinicId: null },
        ],
      },
    },
  });

  // Modern touches
  const modernTouches = await prisma.affiliateTouch.count({
    where: {
      clinicId: otClinic.id,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const modernConversions = await prisma.affiliateTouch.count({
    where: {
      clinicId: otClinic.id,
      createdAt: { gte: thirtyDaysAgo },
      convertedAt: { not: null },
    },
  });

  console.log(`  Legacy referrals: ${legacyReferrals}`);
  console.log(`  Modern touches: ${modernTouches}`);
  console.log(`  Modern conversions: ${modernConversions}`);

  // Check patients with attribution
  const patientsWithAttribution = await prisma.patient.count({
    where: {
      clinicId: otClinic.id,
      attributionAffiliateId: { not: null },
    },
  });

  console.log(`  Patients with modern attribution: ${patientsWithAttribution}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done!`);
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
