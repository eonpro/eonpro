#!/usr/bin/env npx tsx
/**
 * sync-shared-types.ts
 *
 * Copies portable TypeScript types, Zod validation schemas, and constants
 * from the web app (../src/) into mobile/shared/ for use by the mobile app.
 *
 * Run: npm run sync-types (from mobile/)
 *
 * The copied files are committed to git so the mobile app always builds
 * independently without needing the web app source at build time.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { resolve, dirname } from 'path';

const WEB_SRC = resolve(__dirname, '../../src');
const SHARED_DIR = resolve(__dirname, '../shared');

const HEADER = `// AUTO-GENERATED — do not edit manually.
// Source: web app (../src/). Run \`npm run sync-types\` to update.
// Last synced: ${new Date().toISOString()}

`;

interface CopySpec {
  from: string;
  to: string;
  transforms?: Array<(content: string) => string>;
}

const stripAtImports = (content: string): string =>
  content.replace(/from\s+['"]@\//g, "from '../");

const stripNextImports = (content: string): string =>
  content
    .replace(/^import.*from\s+['"]next\/.*['"];?\s*$/gm, '')
    .replace(/^import.*from\s+['"]@\/lib\/utils\/ssr-safe['"];?\s*$/gm, '');

const stripReactImports = (content: string): string =>
  content.replace(/^import\s+React.*from\s+['"]react['"];?\s*$/gm, '');

const FILES: CopySpec[] = [
  // Core types
  {
    from: 'types/models.ts',
    to: 'types/models.ts',
    transforms: [stripAtImports],
  },
  {
    from: 'types/common.ts',
    to: 'types/common.ts',
    transforms: [stripAtImports],
  },
  {
    from: 'types/prisma-enums.ts',
    to: 'types/prisma-enums.ts',
  },
  // Validation schemas (Zod — portable, no Next.js deps)
  {
    from: 'lib/validation/schemas.ts',
    to: 'validation/schemas.ts',
    transforms: [stripAtImports],
  },
  // Constants
  {
    from: 'lib/usStates.ts',
    to: 'constants/usStates.ts',
  },
  {
    from: 'lib/pagination.ts',
    to: 'constants/pagination.ts',
    transforms: [stripAtImports],
  },
];

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function syncFile(spec: CopySpec): void {
  const srcPath = resolve(WEB_SRC, spec.from);
  const destPath = resolve(SHARED_DIR, spec.to);

  if (!existsSync(srcPath)) {
    console.warn(`  SKIP: ${spec.from} (not found)`);
    return;
  }

  let content = readFileSync(srcPath, 'utf-8');

  if (spec.transforms) {
    for (const transform of spec.transforms) {
      content = transform(content);
    }
  }

  ensureDir(destPath);
  writeFileSync(destPath, HEADER + content, 'utf-8');
  console.log(`  SYNC: ${spec.from} → shared/${spec.to}`);
}

console.log('Syncing shared types from web app...\n');

// Write README
ensureDir(resolve(SHARED_DIR, 'README.md'));
writeFileSync(
  resolve(SHARED_DIR, 'README.md'),
  `# Shared Types\n\nAuto-generated from the web app. Do NOT edit manually.\n\nRun \`npm run sync-types\` from \`mobile/\` to update.\n`,
  'utf-8'
);

for (const spec of FILES) {
  syncFile(spec);
}

console.log('\nDone. Shared types are up to date.');
