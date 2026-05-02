/**
 * /api/health regression — must NOT throw `TenantContextRequiredError`.
 *
 * The basic health check is a public endpoint that runs without auth context
 * and queries clinic-isolated models (Patient, Clinic, etc). The
 * `PrismaWithClinicFilter` proxy throws `TenantContextRequiredError` for
 * those models when no `clinicId` is in scope. The fix is to wrap the
 * cross-tenant queries in `withoutClinicFilter`.
 *
 * This test is deliberately implementation-aware: it scans the route source
 * to ensure every clinic-isolated `prisma.X.count(...)` call sits inside a
 * `noTenant(...)` (or `withoutClinicFilter(...)`) wrapper. Catching this at
 * unit-test time prevents another `"database":"unhealthy"` regression on
 * the next refactor.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE_PATH = path.resolve(process.cwd(), 'src/app/api/health/route.ts');

/** Models in `CLINIC_ISOLATED_MODELS` that the health route reads from. */
const CLINIC_ISOLATED_MODELS_USED_BY_HEALTH = [
  'patient',
  'clinic',
  'user',
  'invoice',
  'product',
  'affiliateCommissionEvent',
  'affiliatePayout',
  'affiliateFraudAlert',
];

describe('/api/health — tenant-context safety', () => {
  const source = readFileSync(ROUTE_PATH, 'utf8');

  it('imports the cross-tenant bypass utility', () => {
    expect(source).toMatch(/withoutClinicFilter/);
  });

  it('every clinic-isolated prisma read is wrapped in noTenant() or withoutClinicFilter()', () => {
    /**
     * Strip out comment lines so guidance comments mentioning bare
     * `prisma.X.count()` don't trigger false positives. JSDoc/// comments are
     * the only place we want to allow such mentions.
     */
    const stripped = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !(
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('/**')
        );
      })
      .join('\n');

    for (const model of CLINIC_ISOLATED_MODELS_USED_BY_HEALTH) {
      const callSitePattern = new RegExp(`\\bprisma\\.${model}\\.`, 'g');
      const matches = stripped.match(callSitePattern) ?? [];
      if (matches.length === 0) continue; // model not used; nothing to assert

      /**
       * Locate each occurrence and walk backwards up to ~600 chars looking
       * for an enclosing `noTenant(` or `withoutClinicFilter(`. This catches
       * both inline `noTenant(() => prisma.X.count())` and the
       * `noTenant(() => Promise.all([prisma.A.count(), prisma.B.count()]))`
       * pattern used for batch reads.
       */
      let from = 0;
      const occurrences: number[] = [];
      while (true) {
        const idx = stripped.indexOf(`prisma.${model}.`, from);
        if (idx === -1) break;
        occurrences.push(idx);
        from = idx + 1;
      }

      for (const idx of occurrences) {
        /**
         * Walk backwards from the call site, tracking paren depth. We want to
         * confirm we're inside an open `noTenant(...)` or `withoutClinicFilter(...)`
         * expression — i.e. there is some `noTenant(` upstream whose matching
         * `)` has not yet been seen. This handles both:
         *   - inline `noTenant(() => prisma.X.count())`
         *   - batched `noTenant(() => Promise.all([prisma.A, prisma.B, …]))`
         * regardless of how long the inner expression grows.
         */
        let depth = 0;
        let wrapped = false;
        for (let i = idx; i >= 0; i--) {
          const ch = stripped[i];
          if (ch === ')') depth += 1;
          else if (ch === '(') {
            if (depth === 0) {
              /** Found an unclosed `(` — check the identifier just before it. */
              const before = stripped.slice(Math.max(0, i - 30), i);
              if (/(?:noTenant|withoutClinicFilter)\s*$/.test(before)) {
                wrapped = true;
                break;
              }
              /** Not our wrapper; keep looking for an outer one. */
            } else {
              depth -= 1;
            }
          }
          /** Safety: don't walk more than 4 KB upstream. */
          if (idx - i > 4000) break;
        }
        expect(
          wrapped,
          `prisma.${model}.* at offset ${idx} is not wrapped in noTenant(...) — health check will throw TenantContextRequiredError without auth context`
        ).toBe(true);
      }
    }
  });
});
