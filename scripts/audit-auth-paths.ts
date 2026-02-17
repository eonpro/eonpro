#!/usr/bin/env npx tsx
/**
 * Static Audit Script: verifyAuth Usage Scanner
 *
 * Scans the repository for `verifyAuth(` usage and outputs a report:
 *   - File path + line number + count per file
 *   - Summary totals
 *
 * Exit codes:
 *   0 — no verifyAuth usages found (or ALLOW_VERIFYAUTH=1 override)
 *   1 — verifyAuth usages detected and override not set
 *
 * Usage:
 *   npx tsx scripts/audit-auth-paths.ts
 *
 * CI integration:
 *   Add to your CI pipeline to enforce migration from verifyAuth to withAuth/withAdminAuth.
 *   Override with: ALLOW_VERIFYAUTH=1 npx tsx scripts/audit-auth-paths.ts
 *
 * NOTE: This script excludes:
 *   - The verifyAuth definition itself (middleware.ts)
 *   - Re-export barrel files (auth/index.ts)
 *   - Test files
 *   - Documentation files
 *   - node_modules
 *   - This script itself
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT_DIR = path.resolve(process.cwd());
const PATTERN = /verifyAuth\s*\(/g;

/** Files where verifyAuth is defined or re-exported (not usage) */
const DEFINITION_FILES = new Set([
  'src/lib/auth/middleware.ts',
  'src/lib/auth/index.ts',
]);

/** Directory/pattern exclusions */
const EXCLUDED_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.git',
  'scripts/audit-auth-paths.ts',
];

const EXCLUDED_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.json',
  '.lock',
  '.css',
  '.scss',
  '.svg',
  '.png',
  '.jpg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
]);

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

interface UsageEntry {
  file: string;
  line: number;
  content: string;
}

function isExcluded(filePath: string): boolean {
  const relative = path.relative(ROOT_DIR, filePath);

  if (EXCLUDED_DIRS.some((d) => relative.startsWith(d) || relative.includes(`/${d}`))) {
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true;
  }

  // Exclude test files
  if (
    relative.includes('__tests__') ||
    relative.includes('.test.') ||
    relative.includes('.spec.') ||
    relative.startsWith('tests/')
  ) {
    return true;
  }

  // Exclude documentation
  if (relative.startsWith('docs/') || relative.startsWith('doc/')) {
    return true;
  }

  return false;
}

function isDefinitionFile(filePath: string): boolean {
  const relative = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  return DEFINITION_FILES.has(relative);
}

function walkDir(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (EXCLUDED_DIRS.some((d) => entry.name === d)) continue;

      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Permission errors, etc. — skip
  }

  return files;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanFile(filePath: string): UsageEntry[] {
  const usages: UsageEntry[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip import/export lines (re-exports are definitions, not usage)
      if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) {
        continue;
      }
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
        continue;
      }
      if (PATTERN.test(line)) {
        usages.push({
          file: path.relative(ROOT_DIR, filePath),
          line: i + 1,
          content: line.trim(),
        });
      }
      // Reset regex lastIndex since we use /g flag
      PATTERN.lastIndex = 0;
    }
  } catch {
    // Unreadable file — skip
  }

  return usages;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  verifyAuth Usage Audit Report');
  console.log('  Generated:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  const allFiles = walkDir(ROOT_DIR);
  const sourceFiles = allFiles.filter((f) => !isExcluded(f) && !isDefinitionFile(f));

  console.log(`Scanned ${sourceFiles.length} source files (excluding tests, docs, definitions)\n`);

  const allUsages: UsageEntry[] = [];
  const fileUsageCounts: Map<string, number> = new Map();

  for (const file of sourceFiles) {
    const usages = scanFile(file);
    if (usages.length > 0) {
      allUsages.push(...usages);
      fileUsageCounts.set(
        path.relative(ROOT_DIR, file),
        usages.length
      );
    }
  }

  // Print report
  if (allUsages.length === 0) {
    console.log('✅ No verifyAuth() usage found in source files.');
    console.log('   All routes have been migrated to withAuth/withAdminAuth wrappers.\n');
    process.exit(0);
  }

  console.log(`⚠️  Found ${allUsages.length} verifyAuth() usages across ${fileUsageCounts.size} files:\n`);

  // Sort files by usage count (highest first)
  const sortedFiles = [...fileUsageCounts.entries()].sort((a, b) => b[1] - a[1]);

  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  File                                                    Count  │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  for (const [file, count] of sortedFiles) {
    const paddedFile = file.padEnd(55).slice(0, 55);
    const paddedCount = String(count).padStart(3);
    console.log(`│  ${paddedFile}  ${paddedCount}  │`);
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');

  console.log('\nDetailed locations:');
  console.log('───────────────────');
  let lastFile = '';
  for (const usage of allUsages) {
    if (usage.file !== lastFile) {
      console.log(`\n  📄 ${usage.file}`);
      lastFile = usage.file;
    }
    console.log(`     L${usage.line}: ${usage.content.slice(0, 80)}`);
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${allUsages.length} usages in ${fileUsageCounts.size} files`);
  console.log('───────────────────────────────────────────────────────────────');

  console.log('\n📋 Migration guide:');
  console.log('   Replace:  const { user } = await verifyAuth(request);');
  console.log('   With:     export const GET = withAuth(async (req, user) => { ... });');
  console.log('   Or:       export const GET = withAdminAuth(async (req, user) => { ... });');

  // Check for override
  if (process.env.ALLOW_VERIFYAUTH === '1') {
    console.log('\n⚠️  ALLOW_VERIFYAUTH=1 is set — exiting with code 0 (override active)');
    console.log('   Remove this override once migration is complete.\n');
    process.exit(0);
  }

  console.log('\n❌ Exiting with code 1 — verifyAuth usage detected.');
  console.log('   Set ALLOW_VERIFYAUTH=1 to temporarily bypass this check.\n');
  process.exit(1);
}

main();
