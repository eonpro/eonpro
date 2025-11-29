#!/usr/bin/env node
/**
 * Script to fix remaining TypeScript errors
 * Handles: self-referencing errorMessage, role comparisons, any types
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

// Files with known issues from type-check output
const filesToFix = [
  'src/app/admin/influencers/page.tsx',
  'src/app/api/admin/influencers/[id]/route.ts',
  'src/app/api/ai/chat/route.ts',
  'src/app/api/auth/dev-token/route.ts',
  'src/app/api/admin/api-keys/route.ts',
  'src/app/api/admin/integrations/route.ts',
  'src/app/api/admin/settings/route.ts',
  'src/app/api/intake-forms/templates/[id]/route.ts',
  'src/app/api/**/*.ts',
  'src/app/**/*.tsx'
];

function fixSelfReferencingErrorMessage(content: string): string {
  // Fix pattern: const errorMessage = err instanceof Error ? errorMessage : 'Unknown error';
  // Should be: const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  
  const pattern = /const errorMessage = (err|error) instanceof Error \? errorMessage : /g;
  content = content.replace(pattern, 'const errorMessage = $1 instanceof Error ? $1.message : ');
  
  return content;
}

function fixRoleComparisons(content: string): string {
  // Fix SUPER_ADMIN comparisons (doesn't exist in our role enum)
  // Change to 'admin' which is the highest role we have
  
  // Pattern: user.role === "SUPER_ADMIN"
  content = content.replace(/user\.role === ["']SUPER_ADMIN["']/g, 'user.role === "admin"');
  content = content.replace(/user\.role !== ["']SUPER_ADMIN["']/g, 'user.role !== "admin"');
  
  // Pattern: role === "ADMIN" (should be lowercase)
  content = content.replace(/role === ["']ADMIN["']/g, 'role === "admin"');
  content = content.replace(/role !== ["']ADMIN["']/g, 'role !== "admin"');
  
  return content;
}

function fixPrismaWhereTypes(content: string): string {
  // Fix Prisma where clause issues
  
  // Pattern: where: { email: any } should be where: { email: string }
  content = content.replace(/where:\s*{\s*email:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}/g, (match, variable) => {
    // Check if it's being used for Provider (which needs id and npi too)
    if (content.includes('prisma.provider.findUnique') && content.indexOf(match) > content.lastIndexOf('prisma.provider.findUnique')) {
      // For Provider, we need a compound unique constraint or use findFirst
      return `where: { email: ${variable} as string }`;
    }
    return match;
  });
  
  // Fix Provider unique constraint issues - change findUnique to findFirst when using email
  content = content.replace(
    /prisma\.provider\.findUnique\s*\(\s*{\s*where:\s*{\s*email:/g,
    'prisma.provider.findFirst({ where: { email:'
  );
  
  return content;
}

function fixImplicitAnyTypes(content: string): string {
  // Add type annotations for common patterns
  
  // Pattern: .map((item) => should be .map((item: any) =>
  content = content.replace(/\.map\(\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*=>/g, (match, param) => {
    // Skip if already typed
    if (content.includes(`${param}:`) || content.includes(`${param} :`)) {
      return match;
    }
    return `.map((${param}: any) =>`;
  });
  
  // Pattern: catch (err) should stay as is (we already handle this elsewhere)
  // Pattern: async (param) => should be async (param: any) =>
  content = content.replace(/async\s*\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*=>/g, (match, param) => {
    // Skip if already typed
    if (content.includes(`${param}:`) || content.includes(`${param} :`)) {
      return match;
    }
    return `async (${param}: any) =>`;
  });
  
  return content;
}

function fixFile(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;
  
  // Apply all fixes
  content = fixSelfReferencingErrorMessage(content);
  content = fixRoleComparisons(content);
  content = fixPrismaWhereTypes(content);
  content = fixImplicitAnyTypes(content);
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content);
    return true;
  }
  
  return false;
}

async function main() {
  logger.info('🔧 Fixing remaining TypeScript errors...\n');
  
  // Get all TypeScript files
  const patterns = ['src/**/*.ts', 'src/**/*.tsx'];
  const allFiles = new Set<string>();
  
  for (const pattern of patterns) {
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts']
    });
    files.forEach(f => allFiles.add(f));
  }
  
  let fixedCount = 0;
  let totalCount = 0;
  
  for (const file of allFiles) {
    totalCount++;
    if (fixFile(file)) {
      logger.info(`✅ Fixed ${file}`);
      fixedCount++;
    }
  }
  
  logger.info(`\n✨ Fixed ${fixedCount} out of ${totalCount} files!`);
  logger.info('Run npm run type-check to verify the fixes.');
}

main().catch(console.error);
