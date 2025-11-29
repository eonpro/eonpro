import { logger } from '../src/lib/logger';

#!/usr/bin/env node

/**
 * Script to set up a password for a provider
 * Usage: node scripts/setup-provider-password.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupProviderPassword() {
  try {
    // Get all providers
    const providers = await prisma.provider.findMany({
      orderBy: { id: 'asc' }
    });

    if (providers.length === 0) {
      logger.info('No providers found in the database');
      return;
    }

    logger.info('\n========== AVAILABLE PROVIDERS ==========\n');
    providers.forEach(p => {
      const hasPassword = !!p.passwordHash;
      logger.info(`${p.id}. Dr. ${p.firstName} ${p.lastName} (${p.npi}) ${hasPassword ? '[HAS PASSWORD]' : '[NO PASSWORD]'}`);
    });

    const providerId = await question('\nEnter provider ID to set password for: ');
    const provider = providers.find(p => p.id === parseInt(providerId));

    if (!provider) {
      logger.info('Invalid provider ID');
      return;
    }

    logger.info(`\nSetting password for Dr. ${provider.firstName} ${provider.lastName}`);
    
    const password = await question('Enter new password (min 8 characters): ');
    
    if (password.length < 8) {
      logger.info('❌ Password must be at least 8 characters');
      return;
    }

    const confirmPassword = await question('Confirm password: ');
    
    if (password !== confirmPassword) {
      logger.info('❌ Passwords do not match');
      return;
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update provider
    await prisma.provider.update({
      where: { id: provider.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    logger.info(`\n✅ Password set successfully for Dr. ${provider.firstName} ${provider.lastName}`);
    logger.info('Provider can now use this password to approve SOAP notes');

  } catch (error) {
    logger.error('Error:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

setupProviderPassword();
