#!/usr/bin/env npx tsx
/**
 * Print DATABASE_URL connection parameters (password masked)
 *
 * Run: npx tsx scripts/print-db-connection-params.ts
 *
 * Requires DATABASE_URL in .env (or .env.local). Like check-database.ts,
 * run from project root where env is loaded, or: source .env.local && npx tsx ...
 */

function main() {
  const url = process.env.DATABASE_URL || '';
  console.log('\n=== DATABASE_URL Connection Parameters (password masked) ===\n');

  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  // Mask password
  let masked = url;
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***MASKED***';
      masked = parsed.toString();
    }
  } catch {
    // If URL parse fails, just redact common patterns
    masked = url.replace(/:([^:@]+)@/, ':***MASKED***@');
  }

  console.log('DATABASE_URL (masked):', masked);
  console.log('');

  if (url.startsWith('file:') || url.startsWith('prisma://')) {
    console.log('SQLite or Prisma Accelerate - no connection params.');
    return;
  }

  try {
    const parsed = new URL(url);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      params[k] = v;
    });

    console.log('Host:', parsed.hostname);
    console.log('Port:', parsed.port || '5432');
    console.log('Database:', parsed.pathname?.slice(1) || '(default)');
    console.log('connection_limit:', params.connection_limit ?? '(not in URL, from serverless config)');
    console.log('pool_timeout:', params.pool_timeout ?? '(not in URL)');
    console.log('sslmode:', params.sslmode ?? '(not in URL)');
    console.log('connect_timeout:', params.connect_timeout ?? '(not in URL)');
    console.log('pgbouncer:', params.pgbouncer ?? '(not in URL)');
    console.log('');
    console.log('RDS Proxy:', url.includes('.proxy-') ? 'YES (host contains .proxy-)' : 'NO');
    console.log('PgBouncer:', params.pgbouncer === 'true' ? 'YES' : 'NO');
  } catch (e) {
    console.error('Failed to parse URL:', (e as Error).message);
  }

  console.log('\n========================================\n');
}

main();
