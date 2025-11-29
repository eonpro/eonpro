import { logger } from '../src/lib/logger';

#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function main() {
  logger.info('\n=== Influencer Account Setup ===\n');

  try {
    // Get influencer details
    const name = await question('Influencer Name: ');
    const email = await question('Email: ');
    const promoCode = await question('Promo Code (will be uppercase): ');
    const commissionRateStr = await question('Commission Rate (default 10%): ');
    const password = await question('Password: ');

    const commissionRate = commissionRateStr ? parseFloat(commissionRateStr) / 100 : 0.10;

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Check if influencer already exists
    const existingByEmail = await prisma.influencer.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingByEmail) {
      logger.info('\n❌ An influencer with this email already exists.');
      const update = await question('Do you want to update the password? (y/n): ');
      
      if (update.toLowerCase() === 'y') {
        await prisma.influencer.update({
          where: { email: email.toLowerCase() },
          data: { passwordHash },
        });
        logger.info('✅ Password updated successfully!');
      }
      return;
    }

    const existingByCode = await prisma.influencer.findUnique({
      where: { promoCode: promoCode.toUpperCase() },
    });

    if (existingByCode) {
      logger.info('\n❌ This promo code is already taken.');
      return;
    }

    // Create the influencer
    const influencer = await prisma.influencer.create({
      data: {
        name,
        email: email.toLowerCase(),
        promoCode: promoCode.toUpperCase(),
        commissionRate,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    logger.info('\n✅ Influencer account created successfully!');
    logger.info('\nInfluencer Details:');
    logger.info('  ID:', influencer.id);
    logger.info('  Name:', influencer.name);
    logger.info('  Email:', influencer.email);
    logger.info('  Promo Code:', influencer.promoCode);
    logger.info('  Commission Rate:', (influencer.commissionRate * 100) + '%');
    logger.info('  Status:', influencer.status);
    logger.info('\n📱 Share this with the influencer:');
    logger.info('  Login URL: http://localhost:3005/influencer/login');
    logger.info('  Email:', influencer.email);
    logger.info('  Password: [the password you set]');
    logger.info('  Promo Code:', influencer.promoCode);

  } catch (error) {
    logger.error('\n❌ Error creating influencer:', error.message);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
