#!/usr/bin/env npx tsx
/**
 * Verify clinic IDs from the live platform via /api/clinic/resolve.
 * Use to keep env vars and docs in sync with production.
 *
 * Usage:
 *   npx tsx scripts/verify-clinic-ids.ts
 *   npx tsx scripts/verify-clinic-ids.ts --base https://app.eonpro.io
 */

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'https://ot.eonpro.io';

const DOMAINS = [
  'eonmeds.eonpro.io',
  'wellmedr.eonpro.io',
  'ot.eonpro.io',
];

async function resolve(domain: string): Promise<{ clinicId: number; name: string } | null> {
  const url = `https://${domain}/api/clinic/resolve?domain=${domain}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { clinicId?: number; name?: string };
    if (data.clinicId != null) return { clinicId: data.clinicId, name: data.name || '?' };
  } catch (e) {
    console.error(`  Error: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}

async function main() {
  console.log('Verifying clinic IDs from platform (/api/clinic/resolve)...\n');

  const results: { domain: string; clinicId?: number; name?: string }[] = [];

  for (const domain of DOMAINS) {
    process.stdout.write(`${domain}... `);
    const r = await resolve(domain);
    if (r) {
      results.push({ domain, clinicId: r.clinicId, name: r.name });
      console.log(`clinic ${r.clinicId} (${r.name})`);
    } else {
      results.push({ domain });
      console.log('(not found or error)');
    }
  }

  console.log('\n--- Env suggestion ---');
  const wellmedr = results.find((r) => r.domain.includes('wellmedr'));
  const ot = results.find((r) => r.domain.includes('ot.eonpro'));
  const eonmeds = results.find((r) => r.domain.includes('eonmeds'));

  if (wellmedr?.clinicId) console.log(`WELLMEDR_CLINIC_ID=${wellmedr.clinicId}`);
  if (ot?.clinicId) console.log(`OVERTIME_CLINIC_ID=${ot.clinicId}`);
  if (eonmeds?.clinicId) console.log(`# EONMEDS=${eonmeds.clinicId} (DEFAULT_CLINIC_ID if used)`);
}

main().catch(console.error);
