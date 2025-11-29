#!/usr/bin/env node
/**
 * Script to fix incorrectly placed import statements
 * Run with: npx ts-node scripts/fix-imports.ts
 */

import * as fs from 'fs';
import { glob } from 'glob';

async function fixFile(filePath: string): boolean {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  // Pattern to find misplaced logger imports within other imports
  const pattern = /import\s*{\s*\nimport\s*{\s*logger\s*}\s*from\s*['"]@\/lib\/logger['"]\s*;\s*/g;
  
  if (pattern.test(content)) {
    // Fix the pattern
    content = content.replace(pattern, 'import { \n');
    
    // Add logger import at the proper location
    if (!content.includes("import { logger } from '@/lib/logger'")) {
      // Find the last import statement
      const lines = content.split('\n');
      let lastImportIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') && !lines[i].includes('{ logger }')) {
          lastImportIndex = i;
        }
        // Look for the end of multi-line imports
        if (lastImportIndex > -1 && lines[i].includes('} from')) {
          lastImportIndex = i;
        }
      }
      
      if (lastImportIndex > -1) {
        lines.splice(lastImportIndex + 1, 0, "import { logger } from '@/lib/logger';");
        content = lines.join('\n');
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  
  return false;
}

async function main() {
  logger.info('🔧 Fixing import issues...\n');
  
  const files = await glob('src/**/*.{ts,tsx}');
  let fixedCount = 0;
  
  for (const file of files) {
    if (await fixFile(file)) {
      logger.info(`✅ Fixed: ${file}`);
      fixedCount++;
    }
  }
  
  logger.info(`\n✅ Fixed ${fixedCount} files`);
}

main().catch(console.error);
