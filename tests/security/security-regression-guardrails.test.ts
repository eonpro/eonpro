/**
 * Security regression guardrails (build fails when invariants are violated).
 *
 * 1. No API route uses basePrisma for clinic-scoped models unless allowlisted.
 * 2. Prisma wrapper throws when tenant context is missing for clinic-scoped models.
 * 3. prisma.<tenantModel>.findUnique/findFirst used only with tenant context (runWithClinicContext or withAuth).
 * 4. (Integration) Tenant mismatch returns 403/404 — covered by tenant-404-normalization tests.
 *
 * Align with src/lib/db.ts: BASE_PRISMA_ALLOWLIST and CLINIC_ISOLATED_MODELS.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const SRC_API = join(process.cwd(), 'src', 'app', 'api');

/** Models that may be used with basePrisma in API routes (must match db.ts allowlist). */
const BASE_PRISMA_ALLOWLIST = new Set([
  'clinic',
  'user',
  'userclinic',
  'providerclinic',
  'provider',
  'patient',
  'hipaaauditentry',
  'affiliate',
  'affiliateapplication',
  'affiliatecommissionplan',
  'affiliateplanassignment',
  'platformfeeevent',
].map((s) => s.toLowerCase()));

/** Path substrings where basePrisma is acceptable for cron/webhooks/super-admin (allowlist). */
const ALLOWED_BASE_PRISMA_PATTERNS = [
  '/cron/',
  '/webhooks/',
  '/auth/',
  '/super-admin/',
  '/internal/',
  '/init-database/',
  '/patient-portal/', // resolve clinic
];

function pathIsAllowedForBasePrisma(fullPath: string): boolean {
  const normalized = fullPath.replace(process.cwd(), '');
  return ALLOWED_BASE_PRISMA_PATTERNS.some((p) => normalized.includes(p));
}

function findBasePrismaUsages(content: string): string[] {
  const models = new Set<string>();
  const regex = /basePrisma\.(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    models.add(match[1].toLowerCase());
  }
  return Array.from(models);
}

describe('Security regression guardrails', () => {
  it('no API route uses basePrisma for clinic-scoped models unless allowlisted', () => {
    const violations: Array<{ path: string; models: string[] }> = [];

    function scan(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('_') && e.name !== 'node_modules') scan(full);
          continue;
        }
        if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
        const content = readFileSync(full, 'utf-8');
        const models = findBasePrismaUsages(content);
        if (models.length === 0) continue;
        if (pathIsAllowedForBasePrisma(full)) continue;
        const disallowed = models.filter((m) => !BASE_PRISMA_ALLOWLIST.has(m));
        if (disallowed.length > 0) {
          violations.push({
            path: full.replace(process.cwd(), ''),
            models: disallowed,
          });
        }
      }
    }

    scan(SRC_API);

    expect(
      violations,
      `basePrisma must not be used for clinic-scoped models outside allowlist. Violations: ${JSON.stringify(violations)}`
    ).toHaveLength(0);
  });

  it('prisma findUnique/findFirst on tenant models only in files with runWithClinicContext or withAuth', () => {
    const dbContent = readFileSync(join(process.cwd(), 'src', 'lib', 'db.ts'), 'utf-8');
    const match = dbContent.match(/(?:CLINIC_ISOLATED_MODELS|clinicisolatedmodels)[^[]*\[([\s\S]*?)\]/i);
    const modelList = match
      ? match[1]
          .split(',')
          .map((s) => s.replace(/['"]/g, '').trim().toLowerCase())
          .filter(Boolean)
      : ['patient', 'order', 'invoice', 'subscription', 'payment', 'refillqueue'];
    const CLINIC_MODELS = new Set(modelList);

    const violations: Array<{ path: string; models: string[] }> = [];

    function scan(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('_') && e.name !== 'node_modules') scan(full);
          continue;
        }
        if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
        const content = readFileSync(full, 'utf-8');
        if (pathIsAllowedForBasePrisma(full)) continue;
        const hasContext = /runWithClinicContext/.test(content) || /withAuth/.test(content);
        if (hasContext) continue;
        const regex = /prisma\.(\w+)\.(findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow)\b/g;
        let m: RegExpExecArray | null;
        const models = new Set<string>();
        while ((m = regex.exec(content)) !== null) {
          const model = m[1].toLowerCase();
          if (CLINIC_MODELS.has(model)) models.add(model);
        }
        if (models.size > 0) {
          violations.push({ path: full.replace(process.cwd(), ''), models: Array.from(models) });
        }
      }
    }

    scan(SRC_API);

    expect(
      violations,
      `prisma.<tenantModel>.findUnique/findFirst must be in files that use runWithClinicContext or withAuth. Violations: ${JSON.stringify(violations)}`
    ).toHaveLength(0);
  });

  it('prisma throws when tenant context is missing for clinic-scoped model', async () => {
    const { prisma } = await import('@/lib/db');
    const { TenantContextRequiredError } = await import('@/lib/tenant-context');

    await expect(
      (async () => {
        await prisma.patient.findMany({ take: 1 });
      })()
    ).rejects.toThrow(TenantContextRequiredError);
  });
});
