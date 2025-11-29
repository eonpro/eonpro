#!/usr/bin/env node
/**
 * Fix ALL remaining logger issues comprehensively
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

async function main() {
  logger.info('🔧 Fixing ALL logger issues comprehensively...\n');
  
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**']
  });
  
  let fixedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    // Fix logger.debug with primitive values
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*(typeof\s+[a-zA-Z_][a-zA-Z0-9_]*)\)/g,
      'logger.$1($2, { type: $3 })'
    );
    
    // Fix logger calls with Object.keys
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*(Object\.keys\([^)]+\))\)/g,
      'logger.$1($2, { keys: $3 })'
    );
    
    // Fix logger.debug(JSON.stringify(...))
    content = content.replace(
      /logger\.(debug|info|warn|error)\((JSON\.stringify\([^)]+\))\);/g,
      'logger.$1("Data:", { json: $2 });'
    );
    
    // Fix logger calls with array access
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\[[^\]]+\])\)/g,
      'logger.$1($2, { value: $3 })'
    );
    
    // Fix logger calls with ternary expressions
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\s*\?[^:]+:[^)]+)\)/g,
      'logger.$1($2, { value: $3 })'
    );
    
    // Fix logger calls with property access
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)\)/g,
      (match, method, message, property) => {
        if (match.includes('{')) return match; // Already fixed
        return `logger.${method}(${message}, { value: ${property} })`;
      }
    );
    
    // Fix remaining problematic calls with string literals
    content = content.replace(
      /logger\.(debug|info|warn|error)\(([^,]+),\s*([\'\"][^\'\"]+[\'\"])\)/g,
      (match, method, message, str) => {
        if (match.includes('{')) return match; // Already fixed
        return `logger.${method}(${message}, { value: ${str} })`;
      }
    );
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      logger.info(`✅ Fixed ${file}`);
      fixedCount++;
    }
  }
  
  logger.info(`\n✨ Fixed ${fixedCount} files!`);
}

main().catch(console.error);
