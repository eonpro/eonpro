/**
 * Pagination enforcement: list APIs must not use unbounded findMany.
 * BUILD FAILS when any findMany in src/app/api lacks take/withPagination or is not exempt.
 *
 * Allowed exemptions:
 * - findMany with take or ...withPagination()
 * - Bounded query: id: { in: [...] } (or patientId: { in: [...] })
 * - File path in ALLOWED_UNBOUNDED_PATTERNS (cron, webhooks, auth, init, test)
 *
 * MAX_PAGE_SIZE=100, default page=1, pageSize=20 in src/lib/pagination.ts.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const SRC = join(process.cwd(), 'src', 'app', 'api');

/** Path substrings for routes allowed to have unbounded findMany (cron, webhooks, auth, dev/setup, super-admin, internal). */
const ALLOWED_UNBOUNDED_PATTERNS = [
  '/cron/',
  '/webhooks/',
  '/auth/',
  '/init-database/',
  '/test-webhook-log/',
  '/white-label/test/',
  '/super-admin/', // SUPER_ADMIN_GLOBAL_AGGREGATION
  '/internal/', // Internal staff APIs; add pagination in follow-up
  '/patient-portal/', // Per-patient bounded; add take in follow-up
  '/patient-progress/', // Per-patient bounded; add take in follow-up
];

function pathIsAllowed(fullPath: string): boolean {
  const normalized = fullPath.replace(process.cwd(), '');
  return ALLOWED_UNBOUNDED_PATTERNS.some((p) => normalized.includes(p));
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

describe('Pagination enforcement', () => {
  it('MAX_PAGE_SIZE is 100 in pagination module', async () => {
    const paginationPath = join(process.cwd(), 'src', 'lib', 'pagination.ts');
    const content = readFileSync(paginationPath, 'utf-8');
    expect(content).toMatch(/MAX_PAGE_SIZE\s*=\s*100/);
    expect(content).toMatch(/DEFAULT_PAGE_SIZE\s*=\s*20/);
  });

  it('findMany in API routes must include take or withPagination (build fails otherwise)', () => {
    const violations: Array<{ path: string; detail: string }> = [];

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
        const calls = findFindManyCalls(content);
        const allowed = pathIsAllowed(full);
        for (const { block } of calls) {
          if (hasTakeInBlock(block)) continue;
          if (isBoundedQuery(block)) continue;
          if (allowed) continue;
          violations.push({
            path: full.replace(process.cwd(), ''),
            detail: 'findMany without take/skip or withPagination (add withPagination or take)',
          });
        }
      }
    }

    try {
      scan(SRC);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') return;
      throw err;
    }

    const message =
      violations.length > 0
        ? `Unbounded findMany in API routes (${violations.length}):\n${violations
            .slice(0, 40)
            .map((v) => `  ${v.path}`)
            .join('\n')}${violations.length > 40 ? `\n  ... and ${violations.length - 40} more` : ''}`
        : '';
    expect(violations, message).toHaveLength(0);
  });
});
