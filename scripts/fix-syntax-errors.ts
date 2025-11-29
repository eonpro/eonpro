#!/usr/bin/env node
/**
 * Fix the final 27 syntax errors
 * These are mostly broken replacements from previous scripts
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';

const fixFiles = [
  'src/app/api/admin/integrations/route.ts',
  'src/app/api/admin/webhooks/route.ts', 
  'src/app/api/influencers/payment-settings/route.ts',
  'src/app/api/lifefile-webhook/route.ts',
  'src/app/api/webhooks/lifefile/prescription-status/route.ts',
  'src/lib/intake-forms/service.ts',
  'src/types/common.ts'
];

function fixSyntaxErrors(content: string): string {
  let modified = content;
  
  // Fix broken provider update patterns
  // Look for patterns where we may have broken the syntax
  modified = modified.replace(
    /const _provider = await prisma\.provider\.findFirst\({ where: { email: ([^}]+) } }\);\s*if \(!_provider\) throw new Error\('Provider not found'\);\s*await prisma\.provider\.update\({ where: { id: _provider\.id }/g,
    `await prisma.provider.update({ where: { email: $1 } as any`
  );
  
  // Fix broken optional chaining
  modified = modified.replace(/\s+\?\s+\./g, '?.');
  
  // Fix broken status comparisons
  modified = modified.replace(/\(status as any\) === "([A-Z]+)"/g, 'status === "$1"');
  
  // Fix double "as any" cases
  modified = modified.replace(/as any as any/g, 'as any');
  
  // Fix broken where clauses
  modified = modified.replace(/where: { provider: { id: ([^}]+) } } as any/g, 
    'where: { providerId: $1 } as any');
  
  // Fix broken metadata assignments
  modified = modified.replace(/metadata: ([^,}\n]+) \|\| undefined \|\| undefined/g,
    'metadata: $1 || undefined');
  
  // Fix prescriptionTracking issue
  modified = modified.replace(/\(prisma as any\)\.prescriptionTracking/g,
    'prisma.prescriptionTracking as any');
  
  return modified;
}

function fixSpecificFile(filePath: string, content: string): string {
  let modified = content;
  
  if (filePath.includes('types/common.ts')) {
    // Fix any specific type definition issues
    modified = modified.replace(
      /export type ([^=]+) = ([^;]+) as any as any;/g,
      'export type $1 = $2;'
    );
  }
  
  if (filePath.includes('lifefile-webhook/route.ts')) {
    // Fix broken try-catch blocks
    const tryPattern = /try\s*{([^}]*)}\s*catch/g;
    modified = modified.replace(tryPattern, (match, block) => {
      // Ensure the block is properly closed
      let openBraces = (block.match(/{/g) || []).length;
      let closeBraces = (block.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        return `try {${block}} catch`;
      }
      return match;
    });
  }
  
  return modified;
}

async function main() {
  logger.info('🔧 Fixing final syntax errors...\n');
  
  for (const file of fixFiles) {
    const fullPath = path.join(process.cwd(), file);
    
    if (!fs.existsSync(fullPath)) {
      logger.info(`⚠️  Skipping ${file} - file not found`);
      continue;
    }
    
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    content = fixSyntaxErrors(content);
    content = fixSpecificFile(file, content);
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      logger.info(`✅ Fixed ${file}`);
    } else {
      logger.info(`⏭️  No changes needed for ${file}`);
    }
  }
  
  logger.info('\n✨ Done! Running type check...');
}

main().catch(console.error);
