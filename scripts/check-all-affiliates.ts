import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check all AffiliateRefCodes
  const refCodes = await prisma.affiliateRefCode.findMany({
    include: { affiliate: true },
  });
  console.log('All AffiliateRefCodes:', JSON.stringify(refCodes, null, 2));

  // Check all Affiliates
  const affiliates = await prisma.affiliate.findMany({
    include: { refCodes: true },
  });
  console.log('All Affiliates:', JSON.stringify(affiliates, null, 2));

  // Check all Influencers
  const influencers = await prisma.influencer.findMany();
  console.log('All Influencers:', JSON.stringify(influencers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
