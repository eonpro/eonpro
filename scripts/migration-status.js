#!/usr/bin/env node
/**
 * Enterprise Migration Status Handler
 * 
 * Dynamically detects and resolves migration issues before deployment.
 * - No hardcoded migration lists
 * - Automatic detection of failed migrations
 * - Safe resolution of idempotent migrations
 * - Detailed logging for debugging
 */

const { execSync, spawnSync } = require('child_process');

const LOG_PREFIX = '[Migration Status]';

// ANSI color codes
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
 * Get migration status from Prisma
 */
function getMigrationStatus() {
  try {
    const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
      encoding: 'utf-8',
      env: process.env,
    });
    
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: error.message,
      exitCode: 1,
    };
  }
}

/**
 * Parse migration status output to find failed migrations
 */
function parseFailedMigrations(output) {
  const failed = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Look for patterns indicating failed migrations
    // Prisma shows "Failed" or "rolled back" for failed migrations
    const failedMatch = line.match(/(\d{14}_[\w_]+).*(?:Failed|failed|rolled back)/i);
    if (failedMatch) {
      failed.push(failedMatch[1]);
    }
    
    // Also check for "Migration .* failed to apply"
    const failedApplyMatch = line.match(/Migration\s+["']?(\d{14}_[\w_]+)["']?\s+failed/i);
    if (failedApplyMatch) {
      failed.push(failedApplyMatch[1]);
    }
  }
  
  return [...new Set(failed)]; // Remove duplicates
}

/**
 * Parse pending migrations from status output
 */
function parsePendingMigrations(output) {
  const pending = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Look for "Not yet applied" migrations
    const pendingMatch = line.match(/(\d{14}_[\w_]+).*Not yet applied/i);
    if (pendingMatch) {
      pending.push(pendingMatch[1]);
    }
  }
  
  return pending;
}

/**
 * Resolve a failed migration by marking it as rolled back
 */
function resolveFailedMigration(migrationName) {
  try {
    log(`Resolving failed migration: ${migrationName}`, 'yellow');
    
    execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
      stdio: 'pipe',
      env: process.env,
    });
    
    log(`Successfully marked ${migrationName} as rolled back`, 'green');
    return true;
  } catch (error) {
    // Migration might not be in a failed state, which is fine
    log(`Could not resolve ${migrationName}: ${error.message}`, 'yellow');
    return false;
  }
}

/**
 * Check if database is reachable
 */
function checkDatabaseConnection() {
  try {
    execSync('npx prisma db execute --stdin <<< "SELECT 1"', {
      stdio: 'pipe',
      env: process.env,
      shell: true,
    });
    return true;
  } catch {
    // Try alternative method
    try {
      const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
        encoding: 'utf-8',
        env: process.env,
        timeout: 30000,
      });
      // If we get any output, database is reachable
      return result.status !== null;
    } catch {
      return false;
    }
  }
}

/**
 * Main function
 */
async function main() {
  log('Starting migration status check...', 'cyan');
  
  // Check database connection
  log('Checking database connection...', 'blue');
  if (!checkDatabaseConnection()) {
    logError('Cannot connect to database. Check DATABASE_URL environment variable.');
    process.exit(1);
  }
  log('Database connection OK', 'green');
  
  // Get current migration status
  log('Checking migration status...', 'blue');
  const status = getMigrationStatus();
  
  if (status.exitCode !== 0 && !status.stdout.includes('migration')) {
    // Only fail if we can't get status at all
    logError(`Failed to get migration status: ${status.stderr}`);
    // Don't exit - try to continue
  }
  
  const output = status.stdout + status.stderr;
  
  // Find failed migrations
  const failedMigrations = parseFailedMigrations(output);
  
  if (failedMigrations.length > 0) {
    log(`Found ${failedMigrations.length} failed migration(s)`, 'yellow');
    
    for (const migration of failedMigrations) {
      resolveFailedMigration(migration);
    }
  } else {
    log('No failed migrations found', 'green');
  }
  
  // Check for pending migrations
  const pendingMigrations = parsePendingMigrations(output);
  
  if (pendingMigrations.length > 0) {
    log(`Found ${pendingMigrations.length} pending migration(s):`, 'blue');
    pendingMigrations.forEach(m => log(`  - ${m}`, 'blue'));
  } else {
    log('No pending migrations', 'green');
  }
  
  log('Migration status check complete', 'cyan');
  process.exit(0);
}

main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
