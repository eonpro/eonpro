/**
 * Migrate Influencers to Affiliates Script
 * 
 * This script migrates legacy Influencer records to the modern Affiliate system.
 * It creates:
 * - User with AFFILIATE role
 * - Affiliate record
 * - AffiliateRefCode record
 * - Default commission plan assignment (if a default plan exists)
 * 
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/migrate-influencers-to-affiliates.ts
 * 
 * Or with tsx:
 *   npx tsx scripts/migrate-influencers-to-affiliates.ts
 * 
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --clinic=ID  Only migrate influencers for a specific clinic
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const clinicArg = args.find(a => a.startsWith('--clinic='));
const targetClinicId = clinicArg ? parseInt(clinicArg.split('=')[1], 10) : null;

interface MigrationResult {
  influencerId: number;
  promoCode: string;
  status: 'created' | 'skipped' | 'error';
  message: string;
  affiliateId?: number;
}

const results: MigrationResult[] = [];

function generateTempPassword(): string {
  // Generate a secure temporary password
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

async function getOrCreateDefaultPlan(clinicId: number): Promise<number | null> {
  // Check if clinic has an active commission plan
  const existingPlan = await prisma.affiliateCommissionPlan.findFirst({
    where: {
      clinicId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existingPlan) {
    return existingPlan.id;
  }

  // Create a default 10% commission plan for the clinic
  if (!dryRun) {
    const plan = await prisma.affiliateCommissionPlan.create({
      data: {
        clinicId,
        name: 'Default 10% Commission',
        description: 'Auto-created default commission plan',
        planType: 'PERCENT',
        percentBps: 1000, // 10% = 1000 basis points
        appliesTo: 'FIRST_PAYMENT_ONLY',
        isActive: true,
      },
    });
    console.log(`  Created default commission plan for clinic ${clinicId}: ${plan.id}`);
    return plan.id;
  }

  return null;
}

async function migrateInfluencer(influencer: {
  id: number;
  email: string;
  name: string;
  promoCode: string;
  clinicId: number | null;
  commissionRate: number;
  status: string;
  phone: string | null;
  metadata: any;
}): Promise<MigrationResult> {
  const { id, email, name, promoCode, clinicId, commissionRate, phone } = influencer;

  // Skip if no clinic ID (can't create multi-tenant records)
  if (!clinicId) {
    return {
      influencerId: id,
      promoCode,
      status: 'skipped',
      message: 'No clinic ID associated with influencer',
    };
  }

  // Check if AffiliateRefCode already exists
  const existingRefCode = await prisma.affiliateRefCode.findFirst({
    where: {
      refCode: promoCode.toUpperCase(),
      clinicId,
    },
  });

  if (existingRefCode) {
    return {
      influencerId: id,
      promoCode,
      status: 'skipped',
      message: 'Ref code already exists in modern system',
      affiliateId: existingRefCode.affiliateId,
    };
  }

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  const tempPassword = generateTempPassword();

  if (dryRun) {
    console.log(`  [DRY RUN] Would create affiliate for: ${name} (${promoCode})`);
    return {
      influencerId: id,
      promoCode,
      status: 'created',
      message: '[DRY RUN] Would create user, affiliate, and ref code',
    };
  }

  try {
    // Use transaction to ensure atomic creation
    const result = await prisma.$transaction(async (tx) => {
      // Create or get user
      if (!user) {
        const passwordHash = await bcrypt.hash(tempPassword, 12);
        user = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash,
            firstName: name.split(' ')[0] || name,
            lastName: name.split(' ').slice(1).join(' ') || '',
            role: 'AFFILIATE',
            clinicId,
            status: 'ACTIVE',
          },
        });
        console.log(`  Created user: ${user.id} (${email})`);
      } else if (user.role !== 'AFFILIATE') {
        // User exists but isn't an affiliate - skip to avoid role conflicts
        throw new Error(`User ${email} already exists with role ${user.role}`);
      }

      // Check if affiliate already exists for this user
      let affiliate = await tx.affiliate.findUnique({
        where: { userId: user.id },
      });

      if (!affiliate) {
        affiliate = await tx.affiliate.create({
          data: {
            clinicId,
            userId: user.id,
            displayName: name,
            status: 'ACTIVE',
            metadata: {
              migratedFrom: 'influencer',
              originalInfluencerId: id,
              migratedAt: new Date().toISOString(),
            },
          },
        });
        console.log(`  Created affiliate: ${affiliate.id} (${name})`);
      }

      // Create ref code
      const refCode = await tx.affiliateRefCode.create({
        data: {
          clinicId,
          affiliateId: affiliate.id,
          refCode: promoCode.toUpperCase(),
          description: `Migrated from legacy Influencer ${id}`,
          isActive: true,
        },
      });
      console.log(`  Created ref code: ${refCode.refCode}`);

      // Assign commission plan
      const planId = await getOrCreateDefaultPlan(clinicId);
      if (planId) {
        // Check if assignment already exists
        const existingAssignment = await tx.affiliatePlanAssignment.findFirst({
          where: {
            affiliateId: affiliate.id,
            effectiveTo: null,
          },
        });

        if (!existingAssignment) {
          await tx.affiliatePlanAssignment.create({
            data: {
              clinicId,
              affiliateId: affiliate.id,
              commissionPlanId: planId,
              effectiveFrom: new Date(),
            },
          });
          console.log(`  Assigned commission plan: ${planId}`);
        }
      }

      return { affiliate, user };
    });

    return {
      influencerId: id,
      promoCode,
      status: 'created',
      message: `Created affiliate ${result.affiliate.id} with user ${result.user.id}`,
      affiliateId: result.affiliate.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      influencerId: id,
      promoCode,
      status: 'error',
      message,
    };
  }
}

async function migrate() {
  console.log('='.repeat(80));
  console.log('INFLUENCER TO AFFILIATE MIGRATION');
  console.log('='.repeat(80));
  console.log('');

  if (dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }

  if (targetClinicId) {
    console.log(`Targeting clinic ID: ${targetClinicId}\n`);
  }

  // Get all active influencers
  const influencers = await prisma.influencer.findMany({
    where: {
      status: 'ACTIVE',
      ...(targetClinicId ? { clinicId: targetClinicId } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${influencers.length} active influencers to migrate\n`);

  if (influencers.length === 0) {
    console.log('No influencers to migrate. Exiting.');
    return;
  }

  // Migrate each influencer
  for (const influencer of influencers) {
    console.log(`\nMigrating: ${influencer.name} (${influencer.promoCode})`);
    
    const result = await migrateInfluencer({
      id: influencer.id,
      email: influencer.email,
      name: influencer.name,
      promoCode: influencer.promoCode,
      clinicId: influencer.clinicId,
      commissionRate: influencer.commissionRate,
      status: influencer.status,
      phone: influencer.phone,
      metadata: influencer.metadata,
    });

    results.push(result);
    
    const icon = result.status === 'created' ? '✓' : result.status === 'skipped' ? '○' : '✗';
    const color = result.status === 'created' ? '\x1b[32m' : result.status === 'skipped' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${color}${icon}\x1b[0m ${result.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(80) + '\n');

  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`Total processed: ${results.length}`);
  console.log(`\x1b[32m✓ Created: ${created}\x1b[0m`);
  console.log(`\x1b[33m○ Skipped: ${skipped}\x1b[0m`);
  console.log(`\x1b[31m✗ Errors: ${errors}\x1b[0m`);

  if (errors > 0) {
    console.log('\nErrors:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  - ${r.promoCode}: ${r.message}`);
    });
  }

  if (dryRun) {
    console.log('\n*** This was a dry run. Run without --dry-run to apply changes. ***');
  }

  console.log('\n');
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
