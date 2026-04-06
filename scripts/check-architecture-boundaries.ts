#!/usr/bin/env tsx
/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';

type Finding = {
  file: string;
  reason: string;
};

const ROOT = process.cwd();
const ROUTES_ROOT = path.join(ROOT, 'src', 'app', 'api');
const ALLOW_DIRECT_PRISMA_MARKER = 'architecture-boundary: allow-direct-prisma';
const ALLOW_RAW_SQL_MARKER = 'architecture-boundary: allow-raw-sql';

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listRouteFiles(fullPath);
      }
      if (entry.isFile() && entry.name === 'route.ts') {
        return [fullPath];
      }
      return [];
    })
  );
  return nested.flat();
}

function relative(file: string): string {
  return path.relative(ROOT, file);
}

function hasDirectPrismaUsage(content: string): boolean {
  const importsDb =
    /from\s+['"]@\/lib\/db['"]/.test(content) || /from\s+['"]\.\.\/.*\/lib\/db['"]/.test(content);
  const usesPrismaToken =
    /\bprisma\./.test(content) || /\bbasePrisma\./.test(content) || /\b\$queryRaw\b/.test(content);
  return importsDb && usesPrismaToken;
}

function hasRawSqlUsage(content: string): boolean {
  return /\$queryRawUnsafe|\$queryRaw\b/.test(content);
}

async function run(): Promise<number> {
  let routeFiles: string[] = [];
  try {
    routeFiles = await listRouteFiles(ROUTES_ROOT);
  } catch {
    console.log('[architecture-boundary] No API route directory found. Skipping.');
    return 0;
  }

  const findings: Finding[] = [];
  for (const file of routeFiles) {
    const content = await fs.readFile(file, 'utf8');
    const rel = relative(file);

    if (hasDirectPrismaUsage(content) && !content.includes(ALLOW_DIRECT_PRISMA_MARKER)) {
      findings.push({
        file: rel,
        reason:
          'Direct Prisma usage in route handler. Prefer route -> service -> repository boundary.',
      });
    }

    if (hasRawSqlUsage(content) && !content.includes(ALLOW_RAW_SQL_MARKER)) {
      findings.push({
        file: rel,
        reason:
          'Raw SQL usage detected. Ensure explicit tenant predicates and documented exception marker.',
      });
    }
  }

  if (findings.length === 0) {
    console.log('[architecture-boundary] PASS: no findings.');
    return 0;
  }

  console.log(`[architecture-boundary] Findings: ${findings.length}`);
  for (const finding of findings) {
    console.log(`- ${finding.file}: ${finding.reason}`);
  }

  const strict = process.argv.includes('--strict');
  if (strict) {
    console.error('[architecture-boundary] FAIL: strict mode enabled.');
    return 1;
  }

  console.log(
    '[architecture-boundary] WARN-ONLY mode. Use --strict to enforce blocking behavior.'
  );
  return 0;
}

run()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('[architecture-boundary] Unexpected failure:', error);
    process.exit(1);
  });

