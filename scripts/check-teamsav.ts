import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check AffiliateRefCode
  const refCodes = await prisma.affiliateRefCode.findMany({
    where: {
      OR: [
        { refCode: { contains: 'TEAM', mode: 'insensitive' } },
        { refCode: { contains: 'SAV', mode: 'insensitive' } },
      ],
    },
    include: { affiliate: true },
  });
  console.log('AffiliateRefCodes:', refCodes);

  // Check Affiliate
  const affiliates = await prisma.affiliate.findMany({
    where: {
      displayName: { contains: 'Savannah', mode: 'insensitive' },
    },
    include: { refCodes: true },
  });
  console.log('Affiliates:', affiliates);

  // Check Influencer
  const influencers = await prisma.influencer.findMany({
    where: {
      OR: [
        { promoCode: { contains: 'TEAM', mode: 'insensitive' } },
        { name: { contains: 'Savannah', mode: 'insensitive' } },
      ],
    },
  });
  console.log('Influencers:', influencers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
