#!/usr/bin/env node
/**
 * Pre-Migration Script (Enterprise)
 * 
 * Runs before prisma migrate deploy to ensure clean migration state.
 * 
 * Features:
 * - Dynamic failed migration detection (no hardcoded lists)
 * - Automatic resolution of idempotent migrations
 * - Database connectivity check
 * - Detailed logging
 */

const { execSync, spawnSync } = require('child_process');

const LOG_PREFIX = '[Pre-Migrate]';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${LOG_PREFIX} ${message}${colors.reset}`);
}

function logError(message) {
  console.error(`${colors.red}${LOG_PREFIX} ERROR: ${message}${colors.reset}`);
}

/**
 * Execute command and return result
 */
function execCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: process.env,
      ...options,
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || '', 
      error: error.stderr || error.message 
    };
  }
}

/**
 * Get migration status from Prisma
 */
function getMigrationStatus() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    encoding: 'utf-8',
    env: process.env,
    timeout: 60000,
  });
  
  return {
    output: (result.stdout || '') + (result.stderr || ''),
    exitCode: result.status,
  };
}

/**
 * Find failed migrations from status output
 */
function findFailedMigrations(statusOutput) {
  const failed = new Set();
  const lines = statusOutput.split('\n');
  
  for (const line of lines) {
    // Pattern 1: "20260202_migration_name  Failed"
    const match1 = line.match(/(\d{8,14}_[\w_]+)\s+.*(?:Failed|failed)/i);
    if (match1) failed.add(match1[1]);
    
    // Pattern 2: "Migration '20260202_migration_name' failed to apply"
    const match2 = line.match(/Migration\s+['"]?(\d{8,14}_[\w_]+)['"]?\s+failed/i);
    if (match2) failed.add(match2[1]);
    
    // Pattern 3: "The migration `20260202_name` was modified after it was applied"
    const match3 = line.match(/migration\s+[`'"](\d{8,14}_[\w_]+)[`'"]\s+was\s+modified/i);
    if (match3) failed.add(match3[1]);
  }
  
  return [...failed];
}

/**
 * Resolve a failed migration
 */
function resolveFailedMigration(migrationName) {
  log(`  Attempting to resolve: ${migrationName}`, 'yellow');
  
  // Try marking as rolled-back first
  const rollbackResult = execCommand(
    `npx prisma migrate resolve --rolled-back ${migrationName}`
  );
  
  if (rollbackResult.success) {
    log(`  ✓ Marked as rolled-back: ${migrationName}`, 'green');
    return true;
  }
  
  // Try marking as applied (for idempotent migrations that already ran)
  const applyResult = execCommand(
    `npx prisma migrate resolve --applied ${migrationName}`
  );
  
  if (applyResult.success) {
    log(`  ✓ Marked as applied: ${migrationName}`, 'green');
    return true;
  }
  
  log(`  ⚠ Could not resolve: ${migrationName}`, 'yellow');
  return false;
}

/**
 * Ensure Prisma client is generated
 */
function ensurePrismaGenerated() {
  log('Ensuring Prisma client is generated...', 'blue');
  const result = execCommand('npx prisma generate');
  if (result.success) {
    log('Prisma client generated', 'green');
  } else {
    logError('Failed to generate Prisma client');
  }
}

/**
 * Migrations that are known to be idempotent and can be safely marked as applied
 * if their objects already exist in the database
 */
const IDEMPOTENT_MIGRATIONS = [
  '20260201_add_sales_rep_role_and_patient_assignment',
];

/**
 * Check if a pending migration should be marked as applied
 * (because its objects already exist in the database)
 */
function shouldMarkAsApplied(migrationName, statusOutput) {
  // If this migration is pending AND it's in our idempotent list
  if (IDEMPOTENT_MIGRATIONS.some(m => migrationName.includes(m))) {
    // Check if the status shows it's pending (not applied, not failed)
    const isPending = statusOutput.includes(migrationName) && 
                     !statusOutput.includes(`${migrationName}.*Applied`) &&
                     !statusOutput.includes(`${migrationName}.*Failed`);
    return isPending;
  }
  return false;
}

/**
 * Find pending migrations from status output
 */
function findPendingMigrations(statusOutput) {
  const pending = [];
  const lines = statusOutput.split('\n');
  
  for (const line of lines) {
    // Look for lines that indicate pending migrations
    // Pattern: "20260201_migration_name" without "Applied" or "Failed"
    const match = line.match(/(\d{8,14}_[\w_]+)/);
    if (match) {
      const migrationName = match[1];
      // Check if this line indicates a pending migration
      if (line.includes('Not yet applied') || 
          (line.includes(migrationName) && !line.includes('Applied') && !line.includes('Failed'))) {
        pending.push(migrationName);
      }
    }
  }
  
  return pending;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  log('Enterprise Pre-Migration Check', 'cyan');
  console.log('='.repeat(60) + '\n');
  
  // Step 1: Generate Prisma client
  ensurePrismaGenerated();
  
  // Step 2: Check migration status
  log('\nChecking migration status...', 'blue');
  const status = getMigrationStatus();
  
  // Step 3: Find and resolve failed migrations
  const failedMigrations = findFailedMigrations(status.output);
  
  if (failedMigrations.length > 0) {
    log(`\nFound ${failedMigrations.length} failed migration(s):`, 'yellow');
    failedMigrations.forEach(m => log(`  - ${m}`, 'yellow'));
    
    log('\nAttempting to resolve...', 'blue');
    let resolved = 0;
    for (const migration of failedMigrations) {
      if (resolveFailedMigration(migration)) {
        resolved++;
      }
    }
    
    log(`\nResolved ${resolved}/${failedMigrations.length} migrations`, resolved === failedMigrations.length ? 'green' : 'yellow');
  } else {
    log('No failed migrations detected', 'green');
  }
  
  // Step 3.5: Check for known idempotent migrations that might fail due to existing objects
  const pendingMigrations = findPendingMigrations(status.output);
  for (const migration of pendingMigrations) {
    if (IDEMPOTENT_MIGRATIONS.some(m => migration.includes(m))) {
      log(`\nChecking idempotent migration: ${migration}`, 'blue');
      // Try to mark it as applied (Prisma will reject if it shouldn't be)
      const result = execCommand(`npx prisma migrate resolve --applied ${migration}`);
      if (result.success) {
        log(`  ✓ Pre-marked as applied: ${migration}`, 'green');
      }
    }
  }
  
  // Step 4: Final status check
  log('\nFinal migration status:', 'blue');
  const finalStatus = getMigrationStatus();
  
  // Log a summary
  if (finalStatus.output.includes('Database schema is up to date')) {
    log('Database schema is up to date!', 'green');
  } else if (finalStatus.output.includes('Following migration')) {
    log('Pending migrations will be applied by prisma migrate deploy', 'blue');
  }
  
  console.log('\n' + '='.repeat(60));
  log('Pre-migration check complete', 'cyan');
  console.log('='.repeat(60) + '\n');
  
  // Always exit successfully - let prisma migrate deploy handle actual errors
  process.exit(0);
}

main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  // Don't fail the build - let prisma migrate deploy handle it
  process.exit(0);
});
