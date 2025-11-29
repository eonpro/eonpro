#!/usr/bin/env node
/**
 * Script to fix all logger import issues
 * Run with: npx ts-node scripts/fix-logger-imports.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const problematicFiles = [
  'src/app/api/soap-notes/route.ts',
  'src/app/communications/email/page.tsx',
  'src/app/documents/page.tsx',
  'src/app/telehealth/page.tsx',
  'src/app/test/languages/page.tsx',
  'src/app/test/s3/page.tsx',
  'src/app/test/ses/page.tsx',
  'src/app/test/zoom/page.tsx',
  'src/components/aws/FileUploader.tsx',
  'src/components/twilio/ChatWidget.tsx',
  'src/components/zoom/MeetingRoom.tsx',
  'src/lib/i18n/useTranslation.ts',
  'src/lib/integrations/aws/s3Service.ts',
  'src/lib/integrations/aws/sesService.ts',
  'src/lib/integrations/zoom/meetingService.ts',
  'src/services/paymentMethodService.ts'
];

function fixImportIssue(filePath: string): boolean {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Fix pattern: import {\nimport { logger } from '@/lib/logger';
    const badPattern = /import\s*{\s*\nimport\s*{\s*logger\s*}\s*from\s*['"]@\/lib\/logger['"]\s*;/g;
    
    if (badPattern.test(content)) {
      // Replace with proper pattern
      content = content.replace(badPattern, "import { logger } from '@/lib/logger';\nimport {");
      
      // Write back if changed
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error(`Error fixing ${filePath}:`, error);
    return false;
  }
}

async function main() {
  logger.info('🔧 Fixing logger import issues...\n');
  
  let fixedCount = 0;
  
  for (const file of problematicFiles) {
    if (fixImportIssue(file)) {
      logger.info(`✅ Fixed: ${file}`);
      fixedCount++;
    } else {
      // Try to read and manually fix
      try {
        let content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i].trim() === 'import {' && 
              lines[i + 1].startsWith("import { logger } from '@/lib/logger'")) {
            // Found the issue, fix it
            lines.splice(i, 1); // Remove the standalone 'import {'
            logger.info(`✅ Fixed: ${file} (manual fix)`);
            fs.writeFileSync(file, lines.join('\n'), 'utf-8');
            fixedCount++;
            break;
          }
        }
      } catch (error) {
        logger.error(`Could not fix ${file}:`, error);
      }
    }
  }
  
  logger.info(`\n✅ Fixed ${fixedCount} files`);
  logger.info('\nRunning TypeScript check...');
  
  // Check if TypeScript compiles now
  const { exec } = await import('child_process');
  exec('npx tsc --noEmit', (error, stdout, stderr) => {
    if (error) {
      logger.info('❌ TypeScript still has errors');
      logger.info('Run "npx tsc --noEmit" to see remaining issues');
    } else {
      logger.info('✅ TypeScript compilation successful!');
    }
  });
}

main().catch(console.error);
