#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 * - Ensures DIRECT_DATABASE_URL is set (fallback to DATABASE_URL) so Prisma schema works when only DATABASE_URL is configured.
 * - Runs migrations then build.
 */
const { execSync } = require('child_process');

if (!process.env.DIRECT_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
}

const env = { ...process.env };

function run(cmd, description) {
  console.log(`\n[vercel-build] ${description}...`);
  execSync(cmd, { stdio: 'inherit', env });
}

run('node scripts/pre-migrate.js && npx prisma migrate deploy', 'Migrations');
run('rm -rf node_modules/.prisma && npx prisma generate && npm run build', 'Build');
