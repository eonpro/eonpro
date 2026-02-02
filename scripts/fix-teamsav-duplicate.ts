import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Fixing TEAMSAV Duplicate ===\n');

  // Check current state
  const influencers = await prisma.influencer.findMany({
    where: { promoCode: 'TEAMSAV' },
  });
  console.log(`Influencers with TEAMSAV: ${influencers.length}`);
  influencers.forEach(i => console.log(`  - ID ${i.id}: ${i.name}`));

  const refCodes = await prisma.affiliateRefCode.findMany({
    where: { refCode: 'TEAMSAV' },
    include: { affiliate: true },
  });
  console.log(`\nAffiliateRefCodes with TEAMSAV: ${refCodes.length}`);
  refCodes.forEach(rc => console.log(`  - ID ${rc.id}: ${rc.refCode} -> ${rc.affiliate.displayName}`));

  // Delete the duplicate Influencer we created (keep the AffiliateRefCode)
  if (influencers.length > 0) {
    // First, update the ReferralTracking to not require influencer
    // Or delete it since it's using the wrong model
    const tracking = await prisma.referralTracking.findMany({
      where: { promoCode: 'TEAMSAV' },
    });
    console.log(`\nReferralTracking with TEAMSAV: ${tracking.length}`);

    // Delete ReferralTracking (we'll use AffiliateTouch instead)
    if (tracking.length > 0) {
      await prisma.referralTracking.deleteMany({
        where: { promoCode: 'TEAMSAV' },
      });
      console.log('Deleted ReferralTracking records for TEAMSAV');
    }

    // Delete the duplicate Influencer
    await prisma.influencer.deleteMany({
      where: { promoCode: 'TEAMSAV' },
    });
    console.log('Deleted Influencer records for TEAMSAV');
  }

  // Check AffiliateTouch - update it to NOT be marked as converted
  // (conversion should only happen on payment)
  const touches = await prisma.affiliateTouch.findMany({
    where: { refCode: 'TEAMSAV' },
  });
  console.log(`\nAffiliateTouch with TEAMSAV: ${touches.length}`);
  
  for (const touch of touches) {
    if (touch.convertedAt) {
      await prisma.affiliateTouch.update({
        where: { id: touch.id },
        data: { convertedAt: null }, // Not converted yet - just a use
      });
      console.log(`Updated AffiliateTouch ${touch.id} - removed convertedAt (use, not conversion)`);
    }
  }

  console.log('\n=== Fix Complete ===');
  
  // Verify final state
  const finalInfluencers = await prisma.influencer.count({ where: { promoCode: 'TEAMSAV' } });
  const finalRefCodes = await prisma.affiliateRefCode.count({ where: { refCode: 'TEAMSAV' } });
  const finalTouches = await prisma.affiliateTouch.count({ where: { refCode: 'TEAMSAV' } });
  
  console.log(`\nFinal state:`);
  console.log(`  - Influencers: ${finalInfluencers}`);
  console.log(`  - AffiliateRefCodes: ${finalRefCodes}`);
  console.log(`  - AffiliateTouches (uses): ${finalTouches}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
