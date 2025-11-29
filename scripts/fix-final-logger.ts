#!/usr/bin/env node
/**
 * Fix final logger issues - wrap object properties in objects
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

async function main() {
  logger.info('🔧 Fixing final logger issues...\n');
  
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**']
  });
  
  let fixedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    // Fix pattern: logger.method('message', variable.property)
    content = content.replace(
      /logger\.(debug|info|warn|error|api|db|webhook|security)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)\)/g,
      (match, method, message, property) => {
        // Check if it's already wrapped
        if (match.includes('{')) return match;
        return `logger.${method}(${message}, { value: ${property} })`;
      }
    );
    
    // Fix pattern: logger.method('message', variable[property])
    content = content.replace(
      /logger\.(debug|info|warn|error|api|db|webhook|security)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\[[^\]]+\])\)/g,
      (match, method, message, property) => {
        // Check if it's already wrapped
        if (match.includes('{')) return match;
        return `logger.${method}(${message}, { value: ${property} })`;
      }
    );
    
    // Fix pattern: logger.method('message', functionCall())
    content = content.replace(
      /logger\.(debug|info|warn|error|api|db|webhook|security)\(([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*\([^)]*\))\)/g,
      (match, method, message, funcCall) => {
        // Check if it's already wrapped
        if (match.includes('{')) return match;
        return `logger.${method}(${message}, { value: ${funcCall} })`;
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
