#!/usr/bin/env npx tsx
/**
 * Fix the intake form template by associating it with a provider
 */

import { prisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function fixIntakeFormProvider() {
  try {
    logger.info('Fixing intake form template provider association...');

    // Find or create a provider
    let provider = await prisma.provider.findFirst({
      where: {
        email: 'provider@lifefile.com'
      }
    });

    if (!provider) {
      logger.info('Creating provider...');
      provider = await prisma.provider.create({
        data: {
          email: 'provider@lifefile.com',
          firstName: 'Test',
          lastName: 'Provider',
          npi: '1234567890',
          specialty: 'General Practice'
        }
      });
    }

    logger.info(`Using provider ID: ${provider.id}`);

    // Update all intake form templates without a providerId
    const result = await prisma.intakeFormTemplate.updateMany({
      where: {
        providerId: null
      },
      data: {
        providerId: provider.id
      }
    });

    logger.info(`✅ Updated ${result.count} intake form template(s)`);

    // Get all templates to show their IDs
    const templates = await prisma.intakeFormTemplate.findMany({
      select: {
        id: true,
        name: true,
        providerId: true
      }
    });

    logger.info('\nCurrent intake form templates:');
    templates.forEach(template => {
      logger.info(`  - ID: ${template.id}, Name: ${template.name}, Provider ID: ${template.providerId}`);
    });

  } catch (error) {
    logger.error('Failed to fix intake form provider', error);
    logger.error('❌ Failed to fix intake form provider:', error);
    process.exit(1);
  }
}

// Run the function
fixIntakeFormProvider()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });
