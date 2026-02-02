#!/usr/bin/env node
/**
 * Pre-migration script
 * Resolves any failed migrations before deploying new ones
 */

const { execSync } = require('child_process');

const FAILED_MIGRATIONS = [
  '20260202_add_profile_status',
  '20260202_add_notifications',
];

console.log('🔧 Checking for failed migrations to resolve...');

for (const migration of FAILED_MIGRATIONS) {
  try {
    console.log(`  Marking ${migration} as rolled-back...`);
    execSync(`npx prisma migrate resolve --rolled-back ${migration}`, {
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`  ✓ ${migration} marked as rolled-back`);
  } catch (error) {
    // Migration might not be in failed state, that's ok
    console.log(`  ⚠ Could not resolve ${migration} (might not be failed): ${error.message}`);
  }
}

console.log('✅ Pre-migration check complete');
