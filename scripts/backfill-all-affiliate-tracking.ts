/**
 * Backfill All Affiliate Tracking Script
 *
 * This script retroactively creates tracking records for patients
 * who have promo codes in their intake data or ReferralTracking records
 * but don't have proper attribution in the modern affiliate system.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/backfill-all-affiliate-tracking.ts
 *
 * Or with tsx:
 *   npx tsx scripts/backfill-all-affiliate-tracking.ts
 *
 * Options:
 *   --dry-run       Preview changes without writing to database
 *   --clinic=ID     Only process patients for a specific clinic
 *   --limit=N       Limit the number of patients to process
 *   --verbose       Show detailed output for each patient
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
  patientId: number;
  promoCode: string;
  status: 'attributed' | 'touch_only' | 'skipped' | 'error';
  message: string;
  affiliateId?: number;
}

const results: BackfillResult[] = [];

async function findRefCodeForPromoCode(
  promoCode: string,
  clinicId: number
): Promise<{
  id: number;
  affiliateId: number;
  affiliateName: string;
} | null> {
  const normalizedCode = promoCode.trim().toUpperCase();

  // Try to find in the same clinic first
  let refCode = await prisma.affiliateRefCode.findFirst({
    where: {
      refCode: normalizedCode,
      clinicId,
      isActive: true,
    },
    include: {
      affiliate: {
        select: {
          id: true,
          displayName: true,
          status: true,
        },
      },
    },
  });

  // If not found, try any clinic (for cross-clinic codes)
  if (!refCode) {
    refCode = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode: normalizedCode,
        isActive: true,
      },
      include: {
        affiliate: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
    });
  }

  if (!refCode || refCode.affiliate.status !== 'ACTIVE') {
    return null;
  }

  return {
    id: refCode.id,
    affiliateId: refCode.affiliateId,
    affiliateName: refCode.affiliate.displayName,
  };
}

async function backfillPatient(
  patientId: number,
  promoCode: string,
  clinicId: number
): Promise<BackfillResult> {
  try {
    // Get patient's current attribution status
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        clinicId: true,
        attributionAffiliateId: true,
        attributionRefCode: true,
        tags: true,
      },
    });

    if (!patient) {
      return {
        patientId,
        promoCode,
        status: 'skipped',
        message: 'Patient not found',
      };
    }

    // Find the affiliate ref code
    const refCodeInfo = await findRefCodeForPromoCode(promoCode, clinicId);

    if (!refCodeInfo) {
      return {
        patientId,
        promoCode,
        status: 'skipped',
        message: `No active AffiliateRefCode found for "${promoCode}"`,
      };
    }

    const hasExistingAttribution = !!patient.attributionAffiliateId;

    // Check if we already have a touch record for this patient/code combo
    const existingTouch = await prisma.affiliateTouch.findFirst({
      where: {
        convertedPatientId: patientId,
        refCode: promoCode.toUpperCase(),
      },
    });

    if (existingTouch) {
      return {
        patientId,
        promoCode,
        status: 'skipped',
        message: 'Touch record already exists',
        affiliateId: refCodeInfo.affiliateId,
      };
    }

    if (dryRun) {
      return {
        patientId,
        promoCode,
        status: hasExistingAttribution ? 'touch_only' : 'attributed',
        message: `[DRY RUN] Would ${hasExistingAttribution ? 'create touch only' : 'attribute and create touch'}`,
        affiliateId: refCodeInfo.affiliateId,
      };
    }

    // Create the touch record
    const touch = await prisma.affiliateTouch.create({
      data: {
        clinicId: patient.clinicId,
        affiliateId: refCodeInfo.affiliateId,
        refCode: promoCode.toUpperCase(),
        touchType: 'POSTBACK',
        landingPage: '/intake/backfill',
        utmSource: 'backfill',
        utmMedium: 'script',
        utmCampaign: 'historical',
        convertedPatientId: patientId,
        convertedAt: hasExistingAttribution ? null : new Date(),
        visitorFingerprint: `backfill-${patientId}-${Date.now()}`,
      },
    });

    // Update patient attribution if they don't have one
    if (!hasExistingAttribution) {
      const existingTags = Array.isArray(patient.tags) ? patient.tags as string[] : [];
      const affiliateTag = `affiliate:${promoCode.toUpperCase()}`;
      const shouldAddTag = !existingTags.includes(affiliateTag);

      await prisma.patient.update({
        where: { id: patientId },
        data: {
          attributionAffiliateId: refCodeInfo.affiliateId,
          attributionRefCode: promoCode.toUpperCase(),
          attributionFirstTouchAt: new Date(),
          ...(shouldAddTag ? { tags: { push: affiliateTag } } : {}),
        },
      });

      // Increment affiliate's lifetime conversions
      await prisma.affiliate.update({
        where: { id: refCodeInfo.affiliateId },
        data: {
          lifetimeConversions: { increment: 1 },
        },
      });

      return {
        patientId,
        promoCode,
        status: 'attributed',
        message: `Attributed to ${refCodeInfo.affiliateName} (touch #${touch.id})`,
        affiliateId: refCodeInfo.affiliateId,
      };
    } else {
      return {
        patientId,
        promoCode,
        status: 'touch_only',
        message: `Created touch #${touch.id} (already attributed to affiliate ${patient.attributionAffiliateId})`,
        affiliateId: refCodeInfo.affiliateId,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      patientId,
      promoCode,
      status: 'error',
      message,
    };
  }
}

async function backfill() {
  console.log('='.repeat(80));
  console.log('AFFILIATE TRACKING BACKFILL');
  console.log('='.repeat(80));
  console.log('');

  if (dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }

  if (targetClinicId) {
    console.log(`Targeting clinic ID: ${targetClinicId}\n`);
  }

  if (limit) {
    console.log(`Limiting to ${limit} patients\n`);
  }

  // Step 1: Find patients with ReferralTracking records that don't have modern attribution
  console.log('Step 1: Finding patients with legacy ReferralTracking records...\n');

  const referralTrackingRecords = await prisma.referralTracking.findMany({
    where: {
      ...(targetClinicId ? { clinicId: targetClinicId } : {}),
    },
    include: {
      patient: {
        select: {
          id: true,
          clinicId: true,
          attributionAffiliateId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Found ${referralTrackingRecords.length} ReferralTracking records\n`);

  // Step 2: Process each record
  let processed = 0;
  const batchSize = 50;

  for (const record of referralTrackingRecords) {
    if (!record.patient) {
      results.push({
        patientId: record.patientId,
        promoCode: record.promoCode,
        status: 'skipped',
        message: 'Patient record not found',
      });
      continue;
    }

    const result = await backfillPatient(
      record.patientId,
      record.promoCode,
      record.patient.clinicId
    );

    results.push(result);
    processed++;

    if (verbose) {
      const icon = result.status === 'attributed' ? '✓' :
                   result.status === 'touch_only' ? '○' :
                   result.status === 'skipped' ? '·' : '✗';
      const color = result.status === 'attributed' ? '\x1b[32m' :
                    result.status === 'touch_only' ? '\x1b[33m' :
                    result.status === 'skipped' ? '\x1b[90m' : '\x1b[31m';
      console.log(`${color}${icon}\x1b[0m Patient #${record.patientId} (${record.promoCode}): ${result.message}`);
    }

    // Progress indicator
    if (processed % batchSize === 0) {
      console.log(`Processed ${processed}/${referralTrackingRecords.length}...`);
    }
  }

  // Step 3: Look for patients with promo codes in tags that might be missing
  console.log('\nStep 2: Looking for patients with affiliate tags but no attribution...\n');

  // Tags is a JSON field, so we need to use raw query or fetch all and filter
  // For simplicity, we'll fetch patients without attribution and filter client-side
  const patientsWithoutAttribution = await prisma.patient.findMany({
    where: {
      attributionAffiliateId: null,
      tags: {
        not: { equals: null },
      },
      ...(targetClinicId ? { clinicId: targetClinicId } : {}),
    },
    select: {
      id: true,
      clinicId: true,
      tags: true,
    },
    ...(limit ? { take: limit * 5 } : { take: 1000 }), // Fetch more since we filter client-side
  });

  // Filter for patients with affiliate tags
  const patientsWithAffiliateTags = patientsWithoutAttribution.filter(p => {
    if (!Array.isArray(p.tags)) return false;
    return (p.tags as string[]).some(t => typeof t === 'string' && t.startsWith('affiliate:'));
  }).slice(0, limit || 1000);

  console.log(`Found ${patientsWithAffiliateTags.length} patients with affiliate tags but no attribution\n`);

  for (const patient of patientsWithAffiliateTags) {
    const tags = Array.isArray(patient.tags) ? patient.tags as string[] : [];
    const affiliateTag = tags.find(t => t.startsWith('affiliate:'));

    if (affiliateTag) {
      const promoCode = affiliateTag.replace('affiliate:', '');

      // Check if we already processed this patient
      if (results.some(r => r.patientId === patient.id)) {
        continue;
      }

      const result = await backfillPatient(patient.id, promoCode, patient.clinicId);
      results.push(result);

      if (verbose) {
        const icon = result.status === 'attributed' ? '✓' :
                     result.status === 'touch_only' ? '○' :
                     result.status === 'skipped' ? '·' : '✗';
        const color = result.status === 'attributed' ? '\x1b[32m' :
                      result.status === 'touch_only' ? '\x1b[33m' :
                      result.status === 'skipped' ? '\x1b[90m' : '\x1b[31m';
        console.log(`${color}${icon}\x1b[0m Patient #${patient.id} (${promoCode}): ${result.message}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('BACKFILL SUMMARY');
  console.log('='.repeat(80) + '\n');

  const attributed = results.filter(r => r.status === 'attributed').length;
  const touchOnly = results.filter(r => r.status === 'touch_only').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`Total processed: ${results.length}`);
  console.log(`\x1b[32m✓ Newly attributed: ${attributed}\x1b[0m`);
  console.log(`\x1b[33m○ Touch only (already attributed): ${touchOnly}\x1b[0m`);
  console.log(`\x1b[90m· Skipped: ${skipped}\x1b[0m`);
  console.log(`\x1b[31m✗ Errors: ${errors}\x1b[0m`);

  if (errors > 0) {
    console.log('\nErrors:');
    results.filter(r => r.status === 'error').slice(0, 10).forEach(r => {
      console.log(`  - Patient #${r.patientId} (${r.promoCode}): ${r.message}`);
    });
    if (errors > 10) {
      console.log(`  ... and ${errors - 10} more errors`);
    }
  }

  // Show unique promo codes that couldn't be matched
  const unmatchedCodes = new Set(
    results
      .filter(r => r.status === 'skipped' && r.message.includes('No active AffiliateRefCode'))
      .map(r => r.promoCode)
  );

  if (unmatchedCodes.size > 0) {
    console.log('\nUnmatched promo codes (need to be migrated or created):');
    Array.from(unmatchedCodes).slice(0, 20).forEach(code => {
      console.log(`  - ${code}`);
    });
    if (unmatchedCodes.size > 20) {
      console.log(`  ... and ${unmatchedCodes.size - 20} more codes`);
    }
    console.log('\nRun: npx tsx scripts/migrate-influencers-to-affiliates.ts');
  }

  if (dryRun) {
    console.log('\n*** This was a dry run. Run without --dry-run to apply changes. ***');
  }

  console.log('\n');
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
