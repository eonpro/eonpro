/**
 * Decrypt-loop performance guard.
 *
 * Detects the dangerous anti-pattern: large `findMany` (take >= THRESHOLD)
 * followed by a loop that calls PHI decryption functions. This pattern
 * caused P95 > 10s in production (paymentMatchingService with take: 5000).
 *
 * The test scans all .ts files under src/ and flags violations.
 * Use the searchIndex fast path instead of decrypt loops.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const SRC = join(process.cwd(), 'src');
const TAKE_THRESHOLD = 1000;

const DECRYPT_FUNCTIONS = [
  'safeDecrypt',
  'safeDecryptField',
  'decryptPHI',
  'decryptPatientRecord',
  'decryptPatientSummary',
];

const DECRYPT_PATTERN = new RegExp(
  `\\b(${DECRYPT_FUNCTIONS.join('|')})\\s*\\(`,
);

/**
 * Known exemptions — files where the decrypt loop is intentional/mitigated.
 * Each must have a justification comment.
 */
const EXEMPTIONS = [
  '/lib/security/phi-search.ts', // Core PHI search service — internally capped
  '/lib/security/phi-encryption.ts', // Decryption utility module
  '/admin/patients/route.ts', // Capped at MAX_FALLBACK=500 with warning log
  '/admin/backfill-search-index/', // One-time backfill operation
];

function isExempt(filePath: string): boolean {
  const normalized = filePath.replace(process.cwd(), '');
  return EXEMPTIONS.some((p) => normalized.includes(p));
}

interface Violation {
  path: string;
  takeValue: number;
  decryptFn: string;
}

/**
 * For each file, find findMany calls with take >= THRESHOLD, then check
 * if the surrounding ~80 lines contain a decrypt function call inside a loop.
 */
function scanFile(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];

  const findManyRegex = /prisma\.\w+\.findMany\s*\(\s*\{/g;
  let findManyMatch: RegExpExecArray | null;

  while ((findManyMatch = findManyRegex.exec(content)) !== null) {
    const blockStart = findManyMatch.index;

    // Extract the findMany block
    let depth = 0;
    let pos = blockStart + findManyMatch[0].length - 1;
    depth = 1;
    pos++;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      else if (content[pos] === '}') depth--;
      pos++;
    }

    const block = content.slice(blockStart, pos);

    // Check take value
    const takeMatch = block.match(/\btake\s*:\s*(\d+)/);
    if (!takeMatch) continue;
    const takeValue = parseInt(takeMatch[1], 10);
    if (takeValue < TAKE_THRESHOLD) continue;

    // Look at the next 80 lines after the findMany for a decrypt call inside a loop
    const afterBlock = content.slice(pos, pos + 3000);

    // Check for loop + decrypt pattern
    const loopPatterns = [
      /\bfor\s*\(/, // for loop
      /\bfor\s*\.\.\.\s*of/, // for...of
      /\.forEach\s*\(/, // forEach
      /\.map\s*\(/, // map
      /\.filter\s*\(/, // filter
    ];

    const hasLoop = loopPatterns.some((p) => p.test(afterBlock));
    if (!hasLoop) continue;

    const decryptMatch = afterBlock.match(DECRYPT_PATTERN);
    if (!decryptMatch) continue;

    violations.push({
      path: filePath.replace(process.cwd(), ''),
      takeValue,
      decryptFn: decryptMatch[1],
    });
  }

  return violations;
}

function scanDirectory(dir: string): Violation[] {
  const all: Violation[] = [];

  function scan(d: string) {
    if (!existsSync(d)) return;
    const entries = readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && !e.name.startsWith('.')) scan(full);
        continue;
      }
      if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
      if (e.name.includes('.test.') || e.name.includes('.spec.')) continue;
      if (isExempt(full)) continue;
      const content = readFileSync(full, 'utf-8');
      all.push(...scanFile(full, content));
    }
  }

  scan(dir);
  return all;
}

describe('Decrypt-loop performance guard', () => {
  it(`findMany with take >= ${TAKE_THRESHOLD} must not be followed by decrypt loops`, () => {
    const violations = scanDirectory(SRC);

    const message =
      violations.length > 0
        ? `Decrypt-loop anti-pattern detected (${violations.length}):\n${violations
            .map(
              (v) =>
                `  ${v.path}: take: ${v.takeValue} + ${v.decryptFn}() in loop`,
            )
            .join('\n')}\n\nUse searchIndex fast path instead of decrypt loops. See .cursor/rules/phi-encrypted-search.mdc`
        : '';

    expect(violations, message).toHaveLength(0);
  });
});
