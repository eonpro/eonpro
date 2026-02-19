/**
 * Pagination enforcement: list APIs must not use unbounded findMany.
 * BUILD FAILS when any findMany in src/app/api, src/services, or src/lib
 * lacks take/withPagination or is not exempt.
 *
 * Additionally, take values > 1000 are flagged as violations to prevent
 * large fetch + decrypt loop anti-patterns.
 *
 * Allowed exemptions:
 * - findMany with take or ...withPagination()
 * - Bounded query: id: { in: [...] } (or patientId: { in: [...] })
 * - File path in ALLOWED_UNBOUNDED_PATTERNS (cron, auth, init, test)
 *
 * MAX_PAGE_SIZE=100, default page=1, pageSize=20 in src/lib/pagination.ts.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const API_DIR = join(process.cwd(), 'src', 'app', 'api');
const SERVICES_DIR = join(process.cwd(), 'src', 'services');
const LIB_DIR = join(process.cwd(), 'src', 'lib');

/** Path substrings for routes allowed to have unbounded findMany. */
const ALLOWED_UNBOUNDED_PATTERNS = [
  '/cron/',
  '/auth/',
  '/init-database/',
  '/test-webhook-log/',
  '/white-label/test/',
  '/super-admin/', // SUPER_ADMIN_GLOBAL_AGGREGATION
  '/internal/', // Internal staff APIs; add pagination in follow-up
  '/patient-portal/', // Per-patient bounded; add take in follow-up
  '/patient-progress/', // Per-patient bounded; add take in follow-up
  // Pre-existing: add take in follow-up (ratchet — new routes will still fail)
  '/admin/affiliates/code-performance/',
  '/admin/payment-reconciliation/',
  '/admin/reports/',
  '/admin/shipping/rematch/',
  '/admin/webhooks/',
  '/clinic/order-sets/',
  '/finance/pending-profiles/',
  '/finance/sync-payments/',
  '/patients/[id]/shipment-schedule/',
  '/patients/[id]/tracking/',
  '/provider/prescription-queue/',
  '/webhooks/', // Webhooks have internal idempotency; add take in follow-up
];

/**
 * Files in src/lib and src/services that are part of core infrastructure
 * or have pre-existing unbounded queries. Each is marked for follow-up.
 * This list acts as a ratchet: new files will fail CI.
 */
const ALLOWED_SERVICE_PATTERNS = [
  // Infrastructure
  '/database/',
  '/db.ts',
  '.test.ts',
  '.spec.ts',
  '/pagination.ts',
  '/security/', // PHI search service (has its own internal caps)
  // Pre-existing src/lib (add take in follow-up)
  '/calendar-sync/',
  '/care-plans/',
  '/dashboard/',
  '/email/',
  '/gamification/',
  '/intake-forms/',
  '/integrations/',
  '/patients/',
  '/policies/',
  '/shipping/',
  '/soap-note-automation',
  '/referral-codes/',
  '/ai-scribe/',
  '/auth/',
  '/billing/',
  '/prescription-tracking/',
  '/scheduling/',
  '/shipment-schedule/',
  // Pre-existing src/services (add take in follow-up)
  '/affiliate/',
  '/ai/',
  '/analytics/',
  '/export/',
  '/services/billing/',
  '/notification/',
  '/paymentMethodService',
  '/pricing/',
  '/provider/',
  '/refill/',
  '/reporting/',
  '/services/stripe/',
];

/** Paths allowed to have take > MAX_TAKE_VALUE (admin-only aggregate/report routes). */
const ALLOWED_EXCESSIVE_TAKE_PATTERNS = [
  '/reports/', // Admin report endpoints use take: 10000 for full aggregation
];

const MAX_TAKE_VALUE = 1000;

function pathIsAllowedUnbounded(fullPath: string): boolean {
  const normalized = fullPath.replace(process.cwd(), '');
  return ALLOWED_UNBOUNDED_PATTERNS.some((p) => normalized.includes(p));
}

function pathIsAllowedService(fullPath: string): boolean {
  const normalized = fullPath.replace(process.cwd(), '');
  return ALLOWED_SERVICE_PATTERNS.some((p) => normalized.includes(p));
}

function findFindManyCalls(content: string): Array<{ start: number; end: number; block: string }> {
  const results: Array<{ start: number; end: number; block: string }> = [];
  const regex = /prisma\.\w+\.findMany\s*\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 1;
    let pos = open + 1;
    while (pos < content.length && depth > 0) {
      const ch = content[pos];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      pos++;
    }
    const end = pos;
    const block = content.slice(open, end);
    results.push({ start: match.index, end, block });
  }
  return results;
}

function hasTakeInBlock(block: string): boolean {
  return /\btake\s*:/.test(block) || /\.\.\.withPagination\s*\(/.test(block);
}

/** Bounded queries (id/patientId in list) are allowed without take. */
function isBoundedQuery(block: string): boolean {
  return (
    /id\s*:\s*\{\s*in\s*:/.test(block) ||
    /where\s*:.*id\s*:\s*\{\s*in\s*/.test(block) ||
    /patientId\s*:\s*\{?\s*in\s*:/.test(block)
  );
}

/** Extract numeric take value from a findMany block. Returns null if take uses a variable. */
function extractTakeValue(block: string): number | null {
  const match = block.match(/\btake\s*:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function scanDirectory(
  dir: string,
  isAllowed: (path: string) => boolean,
): Array<{ path: string; detail: string }> {
  const violations: Array<{ path: string; detail: string }> = [];

  function scan(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('_') && e.name !== 'node_modules') scan(full);
        continue;
      }
      if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
      const content = readFileSync(full, 'utf-8');
      const calls = findFindManyCalls(content);
      const allowed = isAllowed(full);
      for (const { block } of calls) {
        if (!hasTakeInBlock(block) && !isBoundedQuery(block) && !allowed) {
          violations.push({
            path: full.replace(process.cwd(), ''),
            detail: 'findMany without take or withPagination',
          });
        }
      }
    }
  }

  scan(dir);
  return violations;
}

function pathIsAllowedExcessiveTake(fullPath: string): boolean {
  const normalized = fullPath.replace(process.cwd(), '');
  return ALLOWED_EXCESSIVE_TAKE_PATTERNS.some((p) => normalized.includes(p));
}

function scanForExcessiveTake(
  dir: string,
): Array<{ path: string; detail: string }> {
  const violations: Array<{ path: string; detail: string }> = [];

  function scan(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('_') && e.name !== 'node_modules') scan(full);
        continue;
      }
      if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
      if (full.includes('.test.') || full.includes('.spec.')) continue;
      if (pathIsAllowedExcessiveTake(full)) continue;
      const content = readFileSync(full, 'utf-8');
      const calls = findFindManyCalls(content);
      for (const { block } of calls) {
        const takeValue = extractTakeValue(block);
        if (takeValue !== null && takeValue > MAX_TAKE_VALUE) {
          violations.push({
            path: full.replace(process.cwd(), ''),
            detail: `take: ${takeValue} exceeds max of ${MAX_TAKE_VALUE}`,
          });
        }
      }
    }
  }

  scan(dir);
  return violations;
}

function formatViolations(label: string, violations: Array<{ path: string; detail: string }>): string {
  if (violations.length === 0) return '';
  const lines = violations
    .slice(0, 40)
    .map((v) => `  ${v.path} — ${v.detail}`);
  const suffix = violations.length > 40 ? `\n  ... and ${violations.length - 40} more` : '';
  return `${label} (${violations.length}):\n${lines.join('\n')}${suffix}`;
}

describe('Pagination enforcement', () => {
  it('MAX_PAGE_SIZE is 100 in pagination module', async () => {
    const paginationPath = join(process.cwd(), 'src', 'lib', 'pagination.ts');
    const content = readFileSync(paginationPath, 'utf-8');
    expect(content).toMatch(/MAX_PAGE_SIZE\s*=\s*100/);
    expect(content).toMatch(/DEFAULT_PAGE_SIZE\s*=\s*20/);
  });

  it('findMany in API routes must include take or withPagination', () => {
    const violations = scanDirectory(API_DIR, pathIsAllowedUnbounded);
    expect(violations, formatViolations('Unbounded findMany in API routes', violations)).toHaveLength(0);
  });

  it('findMany in src/services must include take or withPagination', () => {
    if (!existsSync(SERVICES_DIR)) return;
    const violations = scanDirectory(SERVICES_DIR, pathIsAllowedService);
    expect(violations, formatViolations('Unbounded findMany in services', violations)).toHaveLength(0);
  });

  it('findMany in src/lib must include take or withPagination', () => {
    if (!existsSync(LIB_DIR)) return;
    const violations = scanDirectory(LIB_DIR, pathIsAllowedService);
    expect(violations, formatViolations('Unbounded findMany in lib', violations)).toHaveLength(0);
  });

  it(`findMany take values must not exceed ${MAX_TAKE_VALUE} across all source files`, () => {
    const srcDir = join(process.cwd(), 'src');
    const violations = scanForExcessiveTake(srcDir);
    expect(violations, formatViolations('Excessive take values', violations)).toHaveLength(0);
  });
});
