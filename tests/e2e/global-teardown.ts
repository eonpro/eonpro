/**
 * Playwright Global Teardown
 * Runs once after all tests complete
 */

import type { FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('🧹 Starting E2E test teardown...');
  
  // Clean up authentication state
  await cleanupAuthState();
  
  // Clean up test data
  await cleanupTestData();
  
  console.log('✅ E2E test teardown complete');
}

async function cleanupAuthState(): Promise<void> {
  const authFile = path.join(__dirname, '.auth/user.json');
  
  try {
    await fs.unlink(authFile);
  } catch {
    // File may not exist, that's okay
  }
}

async function cleanupTestData(): Promise<void> {
  // In production, this would clean up test data from the database
  console.log('📦 Test data cleaned up');
}

export default globalTeardown;
