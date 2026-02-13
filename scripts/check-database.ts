#!/usr/bin/env npx tsx
/**
 * Database connectivity diagnostic
 * Run: npx tsx scripts/check-database.ts
 *
 * Uses DATABASE_URL from .env (or .env.local). Does not print secrets.
 */

import { PrismaClient } from '@prisma/client';

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}/${u.pathname.replace(/^\//, '')}?***`;
  } catch {
    return '[invalid URL]';
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Set it in .env or .env.local.');
    process.exit(1);
  }

  const kind = url.startsWith('file:') ? 'SQLite' : url.startsWith('prisma://') ? 'Prisma Accelerate' : 'PostgreSQL';
  console.log('Database type:', kind);
  console.log('Connection (redacted):', redactUrl(url));
  console.log('');

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    const ms = Date.now() - start;
    console.log('Result: OK (connected in', ms, 'ms)');
    const count = await prisma.patient.count().catch(() => null);
    if (count !== null) console.log('Patient count:', count);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('Result: FAILED');
    console.error('Error:', err.message);
    if (err.message.includes('P1001')) console.error('→ Cannot reach database server (check host/port/firewall/DB is running).');
    if (err.message.includes('P1002')) console.error('→ Connection timed out (check network or DB load).');
    if (err.message.includes('P1017')) console.error('→ Server closed connection (often auth or TLS).');
    if (err.message.includes('password') || err.message.includes('auth')) console.error('→ Check username/password in DATABASE_URL.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
