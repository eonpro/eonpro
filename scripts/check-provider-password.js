import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Get provider with ID 1
    const provider = await prisma.provider.findUnique({
      where: { id: 1 },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        lastLogin: true
      }
    });

    if (provider) {
      logger.info('Provider Details:');
      logger.info('================');
      logger.info(`Name: Dr. ${provider.firstName} ${provider.lastName}`);
      logger.info(`Email: ${provider.email || 'Not set'}`);
      logger.info(`Password Set: ${provider.passwordHash ? '✅ YES' : '❌ NO'}`);
      if (provider.passwordHash) {
        logger.info(`Password Hash: ${provider.passwordHash.substring(0, 20)}...`);
      }
      logger.info(`Last Login: ${provider.lastLogin || 'Never'}`);
    } else {
      logger.info('Provider not found');
    }
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
