#!/usr/bin/env node
/**
 * Script to fix logger calls that pass primitive values instead of LogContext objects
 * Fixes: Argument of type 'string' is not assignable to parameter of type 'LogContext'
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

// Pattern to find logger calls with string/number arguments
const patterns = [
  // logger.info('message', 'string') -> logger.info('message', { value: 'string' })
  /logger\.(info|debug|warn|error|api|db|webhook|security)\s*\(\s*([^,]+),\s*(['"`][^'"`]*['"`]|[^,\)]+)\s*\)/g,
];

function fixLoggerCalls(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    logger.info(`Skipping ${filePath} - file not found`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;
  const originalContent = content;

  // Fix patterns like: logger.info('message', 'string value')
  content = content.replace(
    /logger\.(info|debug|warn|error|api|db|webhook|security)\s*\(\s*([^,]+),\s*(['"`][^'"`]*['"`])\s*\)/g,
    (match, method, message, stringValue) => {
      modified = true;
      return `logger.${method}(${message}, { value: ${stringValue} })`;
    }
  );

  // Fix patterns like: logger.info('message', variableName) where variableName is likely a primitive
  content = content.replace(
    /logger\.(info|debug|warn|error|api|db|webhook|security)\s*\(\s*([^,]+),\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g,
    (match, method, message, variable) => {
      // Check if this looks like it might already be an object
      if (variable === 'context' || variable === 'meta' || variable === 'data' || variable === 'error' || variable === 'err') {
        return match; // Keep as is
      }
      
      // Check if the variable is defined nearby as an object
      const lineIndex = originalContent.lastIndexOf(match);
      const precedingCode = originalContent.substring(Math.max(0, lineIndex - 500), lineIndex);
      
      // If it looks like an object definition, skip
      if (precedingCode.includes(`const ${variable} = {`) || 
          precedingCode.includes(`let ${variable} = {`) ||
          precedingCode.includes(`var ${variable} = {`)) {
        return match;
      }
      
      modified = true;
      return `logger.${method}(${message}, { value: ${variable} })`;
    }
  );

  // Fix patterns like: logger.info('message', someExpression)
  content = content.replace(
    /logger\.(info|debug|warn|error)\s*\(\s*([^,]+),\s*(\d+|true|false|null)\s*\)/g,
    (match, method, message, value) => {
      modified = true;
      return `logger.${method}(${message}, { value: ${value} })`;
    }
  );

  // Fix webhook logger calls with specific pattern
  content = content.replace(
    /logger\.webhook\s*\(\s*([^,]+),\s*([^,]+),\s*(['"`][^'"`]*['"`]|[a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\)/g,
    (match, event, source, value) => {
      // Check if value looks like it's already an object
      if (value === 'context' || value === 'data' || value === 'undefined' || value.startsWith('{')) {
        return match;
      }
      modified = true;
      return `logger.webhook(${event}, ${source}, { data: ${value} })`;
    }
  );

  if (modified) {
    fs.writeFileSync(fullPath, content);
    return true;
  }
  
  return false;
}

// Get all TypeScript files
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts']
});

logger.info(`🔧 Fixing logger calls in ${files.length} files...\n`);

let fixedCount = 0;
for (const file of files) {
  if (fixLoggerCalls(file)) {
    logger.info(`✅ Fixed ${file}`);
    fixedCount++;
  }
}

logger.info(`\n✨ Fixed ${fixedCount} files!`);
logger.info('Run npm run type-check to verify the fixes.');
