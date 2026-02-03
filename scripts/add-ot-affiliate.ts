/**
 * Add OT Affiliate
 *
 * Creates an affiliate in the modern system for the OT clinic with their ref code.
 *
 * Usage:
 *   npx tsx scripts/add-ot-affiliate.ts --name="John Doe" --email="john@example.com" --code="JOHND"
 *
 * Options:
 *   --name     Display name for the affiliate (required)
 *   --email    Email address for the affiliate (required)
 *   --code     Referral code (required, will be uppercased)
 *   --rate     Commission rate percentage (default: 10)
 *   --dry-run  Show what would be created without actually creating
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OVERTIME_SUBDOMAIN = 'ot';

function parseArgs(): {
  name?: string;
  email?: string;
  code?: string;
  rate: number;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const result: {
    name?: string;
    email?: string;
    code?: string;
    rate: number;
    dryRun: boolean;
  } = {
    rate: 10,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--name=')) {
      result.name = arg.replace('--name=', '').replace(/^["']|["']$/g, '');
    } else if (arg.startsWith('--email=')) {
      result.email = arg.replace('--email=', '').replace(/^["']|["']$/g, '');
    } else if (arg.startsWith('--code=')) {
      result.code = arg.replace('--code=', '').replace(/^["']|["']$/g, '').toUpperCase();
    } else if (arg.startsWith('--rate=')) {
      result.rate = parseFloat(arg.replace('--rate=', ''));
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ADD OT AFFILIATE`);
  console.log(`${'='.repeat(60)}\n`);

  // Validate required args
  if (!args.name || !args.email || !args.code) {
    console.log('Usage:');
    console.log('  npx tsx scripts/add-ot-affiliate.ts --name="John Doe" --email="john@example.com" --code="JOHND"');
    console.log();
    console.log('Options:');
    console.log('  --name     Display name for the affiliate (required)');
    console.log('  --email    Email address for the affiliate (required)');
    console.log('  --code     Referral code (required, will be uppercased)');
    console.log('  --rate     Commission rate percentage (default: 10)');
    console.log('  --dry-run  Show what would be created without actually creating');
    console.log();
    console.log('Example:');
    console.log('  npx tsx scripts/add-ot-affiliate.ts --name="Mike Smith" --email="mike@gmail.com" --code="MIKES" --rate=15');
    return;
  }

  console.log(`Name: ${args.name}`);
  console.log(`Email: ${args.email}`);
  console.log(`Ref Code: ${args.code}`);
  console.log(`Commission Rate: ${args.rate}%`);
  console.log(`Mode: ${args.dryRun ? '👀 DRY-RUN' : '🚀 LIVE'}`);
  console.log();

  // Find OT Clinic
  const otClinic = await prisma.clinic.findFirst({
    where: { subdomain: OVERTIME_SUBDOMAIN },
  });

  if (!otClinic) {
    console.error('❌ OT clinic not found!');
    return;
  }

  console.log(`✅ Found OT Clinic: ID=${otClinic.id}`);

  // Check if ref code already exists
  const existingRefCode = await prisma.affiliateRefCode.findFirst({
    where: {
      clinicId: otClinic.id,
      refCode: args.code,
    },
    include: {
      affiliate: true,
    },
  });

  if (existingRefCode) {
    console.log(`\n⚠️  Ref code "${args.code}" already exists!`);
    console.log(`   Affiliate: ${existingRefCode.affiliate.displayName}`);
    console.log(`   Active: ${existingRefCode.isActive}`);
    return;
  }

  // Check for existing influencer with this code (legacy)
  const existingInfluencer = await prisma.influencer.findFirst({
    where: { promoCode: args.code },
  });

  if (existingInfluencer) {
    console.log(`\nℹ️  Found legacy influencer with code "${args.code}": ${existingInfluencer.name}`);
  }

  if (args.dryRun) {
    console.log(`\n👀 DRY-RUN: Would create:`);
    console.log(`   1. User with email: ${args.email}`);
    console.log(`   2. Affiliate for OT clinic`);
    console.log(`   3. Ref code: ${args.code}`);
    console.log(`   4. Commission plan assignment at ${args.rate}%`);
    console.log(`\n💡 Remove --dry-run to actually create`);
    return;
  }

  // Create or find user
  console.log(`\nCreating affiliate...`);

  let user = await prisma.user.findUnique({
    where: { email: args.email.toLowerCase() },
  });

  if (!user) {
    console.log(`  Creating user...`);
    user = await prisma.user.create({
      data: {
        email: args.email.toLowerCase(),
        name: args.name,
        role: 'affiliate',
        clinicId: otClinic.id,
      },
    });
    console.log(`  ✅ Created user ID: ${user.id}`);
  } else {
    console.log(`  Using existing user ID: ${user.id}`);
  }

  // Check if affiliate exists for this user
  let affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.id },
  });

  if (!affiliate) {
    affiliate = await prisma.affiliate.create({
      data: {
        clinicId: otClinic.id,
        userId: user.id,
        displayName: args.name,
        status: 'ACTIVE',
      },
    });
    console.log(`  ✅ Created affiliate ID: ${affiliate.id}`);
  } else {
    console.log(`  Using existing affiliate ID: ${affiliate.id}`);
  }

  // Create ref code
  const refCode = await prisma.affiliateRefCode.create({
    data: {
      clinicId: otClinic.id,
      affiliateId: affiliate.id,
      refCode: args.code,
      description: `Created via add-ot-affiliate script`,
      isActive: true,
    },
  });
  console.log(`  ✅ Created ref code: ${refCode.refCode}`);

  // Get or create commission plan
  let plan = await prisma.affiliateCommissionPlan.findFirst({
    where: {
      clinicId: otClinic.id,
      percentBps: args.rate * 100,
      isActive: true,
    },
  });

  if (!plan) {
    plan = await prisma.affiliateCommissionPlan.create({
      data: {
        clinicId: otClinic.id,
        name: `${args.rate}% Commission`,
        description: `${args.rate}% commission on all payments`,
        planType: 'PERCENT',
        percentBps: args.rate * 100,
        appliesTo: 'ALL_PAYMENTS',
        isActive: true,
      },
    });
    console.log(`  ✅ Created commission plan: ${plan.name}`);
  }

  // Assign to plan
  await prisma.affiliatePlanAssignment.create({
    data: {
      clinicId: otClinic.id,
      affiliateId: affiliate.id,
      commissionPlanId: plan.id,
    },
  });
  console.log(`  ✅ Assigned to commission plan: ${plan.name}`);

  // Also create in legacy system for backward compatibility
  const existingLegacyInfluencer = await prisma.influencer.findFirst({
    where: { promoCode: args.code },
  });

  if (!existingLegacyInfluencer) {
    try {
      await prisma.influencer.create({
        data: {
          clinicId: otClinic.id,
          email: args.email.toLowerCase(),
          name: args.name,
          promoCode: args.code,
          commissionRate: args.rate / 100,
          status: 'ACTIVE',
        },
      });
      console.log(`  ✅ Created legacy influencer for backward compatibility`);
    } catch (e) {
      // Email might be duplicate, that's OK
      console.log(`  ℹ️  Legacy influencer not created (email might be duplicate)`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ SUCCESS! Affiliate "${args.name}" created with code "${args.code}"`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nWhen patients use code "${args.code}" in their intake form,`);
  console.log(`it will now be tracked for this affiliate.`);
  console.log();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
