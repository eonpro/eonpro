/**
 * Verify shipping methods are properly configured
 */

import { SHIPPING_METHODS } from '../src/lib/shipping';

import { logger } from '../src/lib/logger';

logger.info('=== Lifefile Shipping Methods Verification ===\n');
logger.info('Total shipping methods available:', SHIPPING_METHODS.length);
logger.info('\n📦 Complete list of shipping methods:\n');

SHIPPING_METHODS.forEach(method => {
  logger.info(`  [${method.id}] ${method.label}`);
});

logger.info('\n=== Verification of Required Methods ===\n');

const requiredMethods = [
  { id: 8097, expectedLabel: 'UPS - NEXT DAY - FLORIDA' }
];

let allTestsPassed = true;

requiredMethods.forEach(({ id, expectedLabel }) => {
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

logger.info('\n=== Location Configuration ===\n');
logger.info('Lifefile Location ID: 110396 (logospharmacy)');
logger.info('This should be set in LIFEFILE_LOCATION_ID environment variable');

logger.info('\n=== Summary ===\n');
logger.info(`Total Shipping Methods: ${SHIPPING_METHODS.length}`);

logger.info('\n=== Test Result ===\n');
if (allTestsPassed) {
  logger.info('✅ All shipping methods are correctly configured!');
  process.exit(0);
} else {
  logger.info('❌ Some tests failed. Please check the configuration.');
  process.exit(1);
}
