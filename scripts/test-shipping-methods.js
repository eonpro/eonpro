import { logger } from '../src/lib/logger';

/**
 * Test script to verify new shipping methods are properly configured
 */

const { SHIPPING_METHODS } = require('../src/lib/shipping');

logger.info('=== Lifefile Shipping Methods Test ===\n');
logger.info('Total shipping methods available:', SHIPPING_METHODS.length);
logger.info('\nComplete list of shipping methods:\n');

// Display all shipping methods in a table format
logger.info('┌─────────┬─────────────────────────────────────┐');
logger.info('│ ID      │ Service Name                        │');
logger.info('├─────────┼─────────────────────────────────────┤');

SHIPPING_METHODS.forEach(method => {
  const idStr = method.id.toString().padEnd(7);
  const labelStr = method.label.padEnd(35);
  logger.info(`│ ${idStr} │ ${labelStr} │`);
});

logger.info('└─────────┴─────────────────────────────────────┘');

// Verify new methods exist
logger.info('\n=== Verification of New Methods ===\n');

const newMethods = [
  { id: 8200, expectedLabel: 'UPS - SECOND DAY AIR' },
  { id: 8097, expectedLabel: 'UPS - NEXT DAY - FLORIDA' }
];

let allTestsPassed = true;

newMethods.forEach(({ id, expectedLabel }) => {
  const found = SHIPPING_METHODS.find(m => m.id === id);
  if (found) {
    if (found.label === expectedLabel) {
      logger.info(`✅ ${id}: "${expectedLabel}" - FOUND and CORRECT`);
    } else {
      logger.info(`⚠️  ${id}: Expected "${expectedLabel}", but found "${found.label}"`);
      allTestsPassed = false;
    }
  } else {
    logger.info(`❌ ${id}: "${expectedLabel}" - NOT FOUND`);
    allTestsPassed = false;
  }
});

// Check for required environment variable documentation
logger.info('\n=== Environment Variable Reminder ===\n');
logger.info('Make sure the following environment variables are set:');
logger.info('- LIFEFILE_LOCATION_ID=110396  (for logospharmacy)');
logger.info('- LIFEFILE_VENDOR_ID');
logger.info('- LIFEFILE_PRACTICE_ID');
logger.info('- LIFEFILE_NETWORK_ID');
logger.info('- LIFEFILE_API_URL');

logger.info('\n=== Test Result ===\n');
if (allTestsPassed) {
  logger.info('✅ All shipping methods are correctly configured!');
  process.exit(0);
} else {
  logger.info('❌ Some tests failed. Please check the configuration.');
  process.exit(1);
}
