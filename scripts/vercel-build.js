#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 * - Ensures DIRECT_DATABASE_URL is set (fallback to DATABASE_URL) so Prisma schema works when only DATABASE_URL is configured.
 * - Runs migrations then build (unless SKIP_MIGRATE_ON_BUILD=true).
 *
 * When Vercel build machines (e.g. iad1) cannot reliably reach RDS (e.g. us-east-2),
 * migrations may timeout (P1002). Set SKIP_MIGRATE_ON_BUILD=true in Vercel env and
 * run migrations separately (GitHub Actions migrate-database job, or manual).
 */
const { execSync } = require('child_process');

if (!process.env.DIRECT_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
}

const env = { ...process.env };
const skipMigrate = process.env.SKIP_MIGRATE_ON_BUILD === 'true' || process.env.SKIP_MIGRATE_ON_BUILD === '1';

function run(cmd, description) {
  console.log(`\n[vercel-build] ${description}...`);
  execSync(cmd, { stdio: 'inherit', env });
}

if (skipMigrate) {
  console.log('\n[vercel-build] Skipping migrations (SKIP_MIGRATE_ON_BUILD is set). Run migrations separately.');
} else {
  run('node scripts/pre-migrate.js && npx prisma migrate deploy', 'Migrations');
}
// Run next build --webpack directly (Next 16 defaults to Turbopack; explicit flag required)
run('rm -rf node_modules/.prisma && npx prisma generate && npx next build', 'Build');
