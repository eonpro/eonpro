/**
 * Count how many profiles (patients) have been tagged with TEAMSAV on ot.eonpro.io (OT clinic).
 * Also reports AffiliateTouch and ReferralTracking counts so we can see why the dashboard may show 0.
 *
 * Usage: npx tsx scripts/count-teamsav-tagged-profiles.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REF_CODE = 'TEAMSAV';
const OT_SUBDOMAIN = 'ot';

async function main() {
  console.log('\n=== TEAMSAV usage on ot.eonpro.io (Overtime Mens Health) ===\n');

  // Resolve OT clinic
  const clinic = await prisma.clinic.findUnique({
    where: { subdomain: OT_SUBDOMAIN },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    console.error(`Clinic with subdomain "${OT_SUBDOMAIN}" not found.`);
    process.exit(1);
  }

  console.log(`Clinic: ${clinic.name} (id=${clinic.id}, ${clinic.subdomain}.eonpro.io)\n`);

  const normalizedCode = REF_CODE.trim().toUpperCase();

  // 1. Profiles tagged = Patient.attributionRefCode (source of truth for "tagged with this code")
  const taggedByAttribution = await prisma.patient.count({
    where: {
      clinicId: clinic.id,
      attributionRefCode: { equals: normalizedCode, mode: 'insensitive' },
    },
  });

  // 1b. Profiles with code in tags only (e.g. legacy or intake-added tag without attribution)
  const withTagOnly = await prisma.patient.findMany({
    where: {
      clinicId: clinic.id,
      OR: [
        { tags: { array_contains: [normalizedCode] } },
        { tags: { array_contains: [`affiliate:${normalizedCode}`] } },
        { tags: { array_contains: [`influencer:${normalizedCode}`] } },
      ],
    },
    select: { id: true, attributionRefCode: true },
  });
  const taggedByTagOnly = withTagOnly.length;
  const taggedCount = taggedByAttribution + taggedByTagOnly;
  const taggedByBoth = withTagOnly.filter((p) => (p.attributionRefCode || '').toUpperCase() === normalizedCode).length;
  const taggedByTagOnlyUnique = taggedByTagOnly - taggedByBoth;

  // Also count with attributionAffiliateId set (linked to affiliate)
  const taggedWithAffiliateCount = await prisma.patient.count({
    where: {
      clinicId: clinic.id,
      attributionRefCode: { equals: normalizedCode, mode: 'insensitive' },
      attributionAffiliateId: { not: null },
    },
  });

  // 2. AffiliateTouch count for this ref code + clinic (all time) — what dashboard "uses" is based on
  const touchCount = await prisma.affiliateTouch.count({
    where: {
      clinicId: clinic.id,
      refCode: normalizedCode,
    },
  });

  const touchCountConverted = await prisma.affiliateTouch.count({
    where: {
      clinicId: clinic.id,
      refCode: normalizedCode,
      convertedAt: { not: null },
    },
  });

  // 3. Legacy ReferralTracking (promoCode) for this code — no clinicId on ReferralTracking, so we count all
  const referralTrackingCount = await prisma.referralTracking.count({
    where: {
      promoCode: { equals: normalizedCode, mode: 'insensitive' },
    },
  });

  // 4. AffiliateRefCode for TEAMSAV (this clinic and any clinic)
  const refCodeRecord = await prisma.affiliateRefCode.findFirst({
    where: {
      clinicId: clinic.id,
      refCode: normalizedCode,
    },
    include: { affiliate: { select: { displayName: true, status: true } } },
  });

  const refCodeAllClinics = await prisma.affiliateRefCode.findMany({
    where: { refCode: normalizedCode },
    include: { clinic: { select: { id: true, name: true, subdomain: true } }, affiliate: { select: { displayName: true } } },
  });

  console.log('--- Results ---');
  console.log(`Profiles tagged with "${normalizedCode}" on OT clinic (total): ${taggedCount}`);
  console.log(`  - By attributionRefCode: ${taggedByAttribution}`);
  console.log(`  - By tags only (TEAMSAV / affiliate:TEAMSAV / influencer:TEAMSAV): ${taggedByTagOnlyUnique} (${taggedByTagOnly} including overlap)`);
  console.log(`  - With attributionAffiliateId set: ${taggedWithAffiliateCount}`);
  console.log('');
  console.log(`AffiliateTouch records (refCode="${normalizedCode}", clinicId=${clinic.id}): ${touchCount}`);
  console.log(`  (converted touches): ${touchCountConverted}`);
  console.log('');
  console.log(`ReferralTracking records (promoCode="${normalizedCode}"): ${referralTrackingCount}`);
  console.log('');
  if (refCodeRecord) {
    console.log(`AffiliateRefCode (this clinic): exists → ${refCodeRecord.affiliate.displayName} (${refCodeRecord.affiliate.status})`);
  } else {
    console.log('AffiliateRefCode (this clinic): not found.');
  }
  if (refCodeAllClinics.length > 0) {
    console.log(`AffiliateRefCode elsewhere: ${refCodeAllClinics.map((r) => `${r.clinic.name} (${r.clinic.subdomain}.eonpro.io)`).join(', ')}`);
  }

  console.log('\n--- Why the dashboard may show 0 ---');
  console.log('The super-admin dashboard "uses" and "conversions" come from AffiliateTouch + ReferralTracking');
  console.log('within the selected date range (default: last 30 days).');
  if (taggedCount > 0 && touchCount === 0 && referralTrackingCount === 0) {
    console.log('Profiles were tagged (e.g. via intake or backfill) but no touch/referral records exist.');
    console.log('Consider running the backfill script to create AffiliateTouch from existing Patient attribution.');
  } else if (taggedCount > 0 && (touchCount > 0 || referralTrackingCount > 0)) {
    console.log('Try setting the dashboard date range to "All time" to see historical uses.');
  }

  console.log('');
}

main().catch(console.error).finally(() => prisma.$disconnect());
