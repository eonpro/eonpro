#!/usr/bin/env npx tsx
import { PrismaClient } from '@prisma/client';

import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

async function main() {
  const influencer = await prisma.influencer.findUnique({
    where: { email: 'test.influencer@example.com' }
  });
  
  if (influencer) {
    logger.info('Influencer found:');
    logger.info('  ID:', influencer.id);
    logger.info('  Name:', influencer.name);
    logger.info('  Email:', influencer.email);
    logger.info('  Status:', influencer.status);
    logger.info('  Has password:', !!influencer.passwordHash);
    logger.info('  Commission Rate:', influencer.commissionRate);
  } else {
    logger.info('No influencer found with email test.influencer@example.com');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
