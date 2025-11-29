/**
 * Verify new shipping methods are properly configured
 */

import { SHIPPING_METHODS } from '../src/lib/shipping';

import { logger } from '../src/lib/logger';

logger.info('=== Lifefile Shipping Methods Verification ===\n');
logger.info('Total shipping methods available:', SHIPPING_METHODS.length);
logger.info('\n📦 Complete list of shipping methods:\n');

// Display all shipping methods
SHIPPING_METHODS.forEach(method => {
  const isNew = method.id === 8200 || method.id === 8097;
  const marker = isNew ? '✨ NEW' : '     ';
  logger.info(`${marker} [${method.id}] ${method.label}`);
});

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

// Location configuration reminder
logger.info('\n=== Location Configuration ===\n');
logger.info('Lifefile Location ID: 110396 (logospharmacy)');
logger.info('This should be set in LIFEFILE_LOCATION_ID environment variable');

// Summary
logger.info('\n=== Summary ===\n');
logger.info(`Total Shipping Methods: ${SHIPPING_METHODS.length}`);
logger.info(`Standard Methods: ${SHIPPING_METHODS.length - 2}`);
logger.info(`New Methods Added: 2`);

logger.info('\n=== Test Result ===\n');
if (allTestsPassed) {
  logger.info('✅ All shipping methods are correctly configured!');
  logger.info('\nNew shipping methods ready to use:');
  logger.info('  - UPS - SECOND DAY AIR (ID: 8200)');
  logger.info('  - UPS - NEXT DAY - FLORIDA (ID: 8097)');
  process.exit(0);
} else {
  logger.info('❌ Some tests failed. Please check the configuration.');
  process.exit(1);
}
