import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Production Database ===\n');

  // Check all AffiliateRefCodes
  const refCodes = await prisma.affiliateRefCode.findMany({
    include: { affiliate: true },
  });
  console.log(`AffiliateRefCodes (${refCodes.length}):`);
  refCodes.forEach(rc => console.log(`  - ${rc.refCode} -> ${rc.affiliate.displayName}`));

  // Check all Affiliates
  const affiliates = await prisma.affiliate.findMany({
    include: { refCodes: true, user: true },
  });
  console.log(`\nAffiliates (${affiliates.length}):`);
  affiliates.forEach(a => console.log(`  - ${a.displayName} (${a.user?.email || 'no user'}) - codes: ${a.refCodes.map(r => r.refCode).join(', ')}`));

  // Check all Influencers
  const influencers = await prisma.influencer.findMany();
  console.log(`\nInfluencers (${influencers.length}):`);
  influencers.forEach(i => console.log(`  - ${i.name} (${i.promoCode}) - ${i.status}`));

  // Check ReferralTracking for patient 1021
  const tracking = await prisma.referralTracking.findMany({
    where: { patientId: 1021 },
    include: { influencer: true },
  });
  console.log(`\nReferralTracking for patient 1021 (${tracking.length}):`);
  tracking.forEach(t => console.log(`  - ${t.promoCode} via ${t.influencer?.name}`));

  // Check patient 1021
  const patient = await prisma.patient.findUnique({
    where: { id: 1021 },
    select: { id: true, firstName: true, lastName: true, clinicId: true, source: true, sourceMetadata: true },
  });
  console.log(`\nPatient 1021:`, patient);
}

main().catch(console.error).finally(() => prisma.$disconnect());
