#!/usr/bin/env node
/**
 * Script to fix TypeScript "error is of type 'unknown'" issues
 * Replaces catch (error) with proper type checking
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import glob from 'glob';

// Files to fix based on type-check output
const filesToFix = [
  'src/app/api/admin/influencers/[id]/route.ts',
  'src/app/api/ai/chat/route.ts',
  'src/app/api/auth/dev-token/route.ts',
  'src/app/api/auth/reset-password/route.ts',
  'src/app/api/commissions/process/route.ts',
  'src/app/api/influencers/auth/login/route.ts',
  'src/app/api/monitoring/ready/route.ts',
  'src/app/api/orders/[id]/route.ts',
  'src/app/api/patients/[id]/documents/[documentId]/download/route.ts',
  'src/app/api/patients/[id]/documents/[documentId]/route.ts',
  'src/app/api/patients/[id]/documents/route.ts',
  'src/app/api/patients/[id]/route.ts',
  'src/app/api/patients/[id]/subscriptions/route.ts',
  'src/app/api/patients/protected/route.ts',
  'src/app/api/payment-methods/default/route.ts',
  'src/app/api/payment-methods/route.ts',
  'src/app/admin/billing/page.tsx',
  'src/app/admin/influencers/page.tsx',
];

function fixErrorTypes(filePath: string) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    logger.info(`Skipping ${filePath} - file not found`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  // Pattern 1: catch (error: any) -> catch (error)
  if (content.includes('catch (error: any)') || content.includes('catch (err: any)')) {
    content = content.replace(/catch\s*\(\s*(error|err)\s*:\s*any\s*\)/g, 'catch ($1)');
    modified = true;
  }

  // Pattern 2: Add type checking after catch (error) where error is used directly
  const catchPattern = /catch\s*\(\s*(error|err)\s*\)\s*\{([^}]*?)\1\.message/gs;
  const matches = [...content.matchAll(catchPattern)];
  
  for (const match of matches) {
    const errorVar = match[1];
    const blockContent = match[2];
    
    // Check if we already have type checking
    if (!blockContent.includes(`${errorVar} instanceof Error`)) {
      // Find the catch block and add type checking
      const catchIndex = match.index!;
      const openBraceIndex = content.indexOf('{', catchIndex);
      
      // Insert type checking after the opening brace
      const insertion = `\n    const errorMessage = ${errorVar} instanceof Error ? ${errorVar}.message : 'Unknown error';`;
      content = content.slice(0, openBraceIndex + 1) + insertion + content.slice(openBraceIndex + 1);
      
      // Replace error.message with errorMessage
      const endOfCatch = content.indexOf('}', openBraceIndex);
      const catchBlock = content.slice(openBraceIndex, endOfCatch + 1);
      const updatedBlock = catchBlock.replace(new RegExp(`${errorVar}\\.message`, 'g'), 'errorMessage');
      content = content.slice(0, openBraceIndex) + updatedBlock + content.slice(endOfCatch + 1);
      
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, content);
    logger.info(`✅ Fixed ${filePath}`);
  } else {
    logger.info(`⏭️  No changes needed for ${filePath}`);
  }
}

logger.info('🔧 Fixing TypeScript error type issues...\n');

for (const file of filesToFix) {
  fixErrorTypes(file);
}

logger.info('\n✨ Done! Run npm run type-check to verify the fixes.');
