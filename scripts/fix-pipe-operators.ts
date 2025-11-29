#!/usr/bin/env node
/**
 * Fix broken pipe operators from previous automated fixes
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

async function main() {
  logger.info('🔧 Fixing broken pipe operators...\n');
  
  // Get all TypeScript files
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**']
  });
  
  let fixedCount = 0;
  let totalFixed = 0;
  
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    // Fix broken pipe operators
    // Pattern: "| ||" should be "||"
    const brokenPipes = content.match(/\| \|\|/g);
    if (brokenPipes) {
      content = content.replace(/\| \|\|/g, '||');
      const count = brokenPipes.length;
      totalFixed += count;
      logger.info(`✅ Fixed ${count} broken operators in ${file}`);
    }
    
    // Also fix "| |" if it exists
    if (content.includes('| |')) {
      content = content.replace(/\| \|/g, '||');
    }
    
    // Fix broken optional chaining with spaces
    if (content.includes(' ? .')) {
      content = content.replace(/ \? \./g, '?.');
    }
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      fixedCount++;
    }
  }
  
  logger.info(`\n✨ Fixed ${fixedCount} files (${totalFixed} total replacements)!`);
}

main().catch(console.error);
