#!/usr/bin/env node
/**
 * Script to fix any types systematically
 * Run with: npx ts-node scripts/fix-any-types.ts
 */

import * as fs from 'fs';
import { logger } from '../src/lib/logger';

import * as path from 'path';
import { glob } from 'glob';

interface Replacement {
  file: string;
  line: number;
  before: string;
  after: string;
}

const replacements: Array<{ pattern: RegExp; replacement: string }> = [
  // Error handling - remove any from catch
  { 
    pattern: /catch\s*\(error:\s*any\)/g, 
    replacement: 'catch (error)' 
  },
  // JWT Payload
  {
    pattern: /payload\s*as\s*unknown\s*as\s*any/g,
    replacement: 'payload as JWTPayload'
  },
  // Form data
  {
    pattern: /const\s+body:\s*any\s*=/g,
    replacement: 'const body ='
  },
  // User/patient/provider objects
  {
    pattern: /let\s+user:\s*any\s*=/g,
    replacement: 'let user ='
  },
  {
    pattern: /let\s+patient:\s*any\s*=/g,
    replacement: 'let patient ='
  },
  {
    pattern: /let\s+provider:\s*any\s*=/g,
    replacement: 'let provider ='
  },
  // Response data
  {
    pattern: /const\s+data:\s*any\s*=/g,
    replacement: 'const data ='
  },
  // Generic objects
  {
    pattern: /:\s*Record<string,\s*any>/g,
    replacement: ': Record<string, unknown>'
  },
  // Function parameters
  {
    pattern: /\(([^:)]+):\s*any\)/g,
    replacement: '($1)'
  }
];

async function processFile(filePath: string): Promise<Replacement[]> {
  // Skip test files, scripts, and config files
  if (filePath.includes('.test.') || 
      filePath.includes('/scripts/') || 
      filePath.includes('.config.') ||
      filePath.includes('/types/')) {
    return [];
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const fileReplacements: Replacement[] = [];
  
  // Apply replacements
  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      const matches = content.match(pattern) || [];
      matches.forEach((match) => {
        fileReplacements.push({
          file: filePath,
          line: 0,
          before: match,
          after: replacement,
        });
      });
      content = content.replace(pattern, replacement);
    }
  });
  
  // Add type imports if needed
  if (content !== originalContent) {
    // Check if we need to add imports
    const needsCommonTypes = content.includes('Record<string, unknown>') && 
                             !content.includes("from '@/types/common'");
    const needsModelTypes = (content.includes('Patient') || 
                            content.includes('Provider') || 
                            content.includes('Order')) && 
                            !content.includes("from '@/types/models'");
    
    if (needsCommonTypes || needsModelTypes) {
      const lines = content.split('\n');
      let lastImportIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
          lastImportIndex = i;
        }
      }
      
      if (lastImportIndex > -1) {
        const imports: string[] = [];
        if (needsCommonTypes) {
          imports.push("import { AppError, ApiResponse } from '@/types/common';");
        }
        if (needsModelTypes) {
          imports.push("import { Patient, Provider, Order } from '@/types/models';");
        }
        lines.splice(lastImportIndex + 1, 0, ...imports);
        content = lines.join('\n');
      }
    }
    
    // Write back
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  
  return fileReplacements;
}

async function main() {
  logger.info('🔧 Fixing any types...\n');
  
  // Process TypeScript files
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/.next/**', '**/types/**'],
  });
  
  logger.info(`Found ${files.length} files to process\n`);
  
  let totalReplacements = 0;
  const allReplacements: Replacement[] = [];
  
  for (const file of files) {
    const replacements = await processFile(file);
    if (replacements.length > 0) {
      totalReplacements += replacements.length;
      allReplacements.push(...replacements);
      logger.info(`✅ ${file}: ${replacements.length} any types fixed`);
    }
  }
  
  // Summary
  logger.info('\n' + '='.repeat(60));
  logger.info('📊 ANY TYPE FIX SUMMARY');
  logger.info('='.repeat(60));
  logger.info(`Total files processed: ${files.length}`);
  logger.info(`Total any types fixed: ${totalReplacements}`);
  logger.info(`Files modified: ${new Set(allReplacements.map(r => r.file)).size}`);
  
  // Count remaining any types
  let remainingCount = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.match(/:\s*any\b/g);
    if (matches) {
      remainingCount += matches.length;
    }
  }
  
  logger.info(`\n⚠️  Remaining any types: ${remainingCount}`);
  
  if (remainingCount > 0) {
    logger.info('\nThese require manual review and specific type definitions.');
  }
  
  logger.info('\n✅ Done! Run TypeScript check: npx tsc --noEmit');
}

main().catch(console.error);
