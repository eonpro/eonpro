/**
 * Script to set up the default clinic
 * Run: npx ts-node scripts/setup-clinic.ts
 */

import { setupDefaultClinic } from '../src/lib/clinic/setup-default-clinic';

import { logger } from '../src/lib/logger';

async function main() {
  logger.info('🏥 Setting up default clinic...\n');
  
  try {
    const clinic = await setupDefaultClinic();
    
    logger.info('\n✅ Default clinic setup complete!');
    logger.info(`   Name: ${clinic.name}`);
    logger.info(`   Subdomain: ${clinic.subdomain}`);
    logger.info(`   ID: ${clinic.id}`);
    logger.info('\nYou can now access the platform at:');
    logger.info(`   http://${clinic.subdomain}.localhost:3001`);
    logger.info('   or');
    logger.info('   http://localhost:3001 (with default clinic)');
    
    process.exit(0);
  } catch (error) {
    logger.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
