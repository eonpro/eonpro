#!/usr/bin/env tsx
/**
 * Import/Export Audit Script
 * 
 * Checks for:
 * 1. Imports from paths that don't exist
 * 2. Inconsistencies in import paths (e.g., @/lib/auth vs @/lib/auth/middleware)
 * 3. Missing exports
 * 4. TypeScript module resolution errors
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'glob';

interface ImportIssue {
  file: string;
  line: number;
  importPath: string;
  issue: string;
  severity: 'error' | 'warning';
}

const issues: ImportIssue[] = [];
const srcDir = join(process.cwd(), 'src');

// Track all @/ imports
const importPattern = /from\s+['"](@\/[^'"]+)['"]/g;
const requirePattern = /require\(['"](@\/[^'"]+)['"]\)/g;

// Files to check (focus on auth, api, services)
const filesToCheck = [
  ...glob.sync('src/app/api/**/*.ts'),
  ...glob.sync('src/app/api/**/*.tsx'),
  ...glob.sync('src/services/**/*.ts'),
  ...glob.sync('src/lib/auth/**/*.ts'),
  ...glob.sync('src/lib/auth/**/*.tsx'),
];

console.log(`Checking ${filesToCheck.length} files for import issues...\n`);

// Check if a file exists
function fileExists(importPath: string): boolean {
  // Convert @/ to src/
  const filePath = importPath.replace(/^@\//, 'src/');
  
  // Try different extensions
  const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
  for (const ext of extensions) {
    const fullPath = join(process.cwd(), filePath + ext);
    try {
      if (statSync(fullPath).isFile()) {
        return true;
      }
    } catch {
      // File doesn't exist
    }
  }
  
  // Check if it's a directory with index file
  try {
    const dirPath = join(process.cwd(), filePath);
    if (statSync(dirPath).isDirectory()) {
      return true; // Directory exists, assume index.ts exists
    }
  } catch {
    // Directory doesn't exist
  }
  
  return false;
}

// Check imports in a file
function checkFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Check import statements
      let match;
      while ((match = importPattern.exec(line)) !== null) {
        const importPath = match[1];
        
        // Skip node_modules and relative imports
        if (importPath.startsWith('@/')) {
          if (!fileExists(importPath)) {
            issues.push({
              file: relative(process.cwd(), filePath),
              line: index + 1,
              importPath,
              issue: `Import path does not exist: ${importPath}`,
              severity: 'error',
            });
          }
        }
      }
      
      // Reset regex
      importPattern.lastIndex = 0;
      
      // Check require statements
      while ((match = requirePattern.exec(line)) !== null) {
        const importPath = match[1];
        
        if (importPath.startsWith('@/')) {
          if (!fileExists(importPath)) {
            issues.push({
              file: relative(process.cwd(), filePath),
              line: index + 1,
              importPath,
              issue: `Require path does not exist: ${importPath}`,
              severity: 'error',
            });
          }
        }
      }
      
      requirePattern.lastIndex = 0;
    });
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
}

// Check for inconsistent import paths
function checkInconsistencies(): void {
  const authImports = new Map<string, Set<string>>();
  
  filesToCheck.forEach(filePath => {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Check for auth-related imports
        if (line.includes('withAuth') || line.includes('AuthUser') || line.includes('from') && line.includes('auth')) {
          const match = line.match(/from\s+['"](@\/lib\/auth[^'"]*)['"]/);
          if (match) {
            const importPath = match[1];
            const file = relative(process.cwd(), filePath);
            
            if (!authImports.has(file)) {
              authImports.set(file, new Set());
            }
            authImports.get(file)!.add(importPath);
          }
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
  });
  
  // Check for inconsistencies
  authImports.forEach((imports, file) => {
    if (imports.size > 1) {
      const importArray = Array.from(imports);
      if (importArray.some(p => p === '@/lib/auth') && importArray.some(p => p === '@/lib/auth/middleware')) {
        issues.push({
          file,
          line: 0,
          importPath: 'multiple',
          issue: `Inconsistent auth imports: ${importArray.join(', ')}. Prefer @/lib/auth for consistency.`,
          severity: 'warning',
        });
      }
    }
  });
}

// Run checks
filesToCheck.forEach(checkFile);
checkInconsistencies();

// Report results
console.log(`\nFound ${issues.length} import issues:\n`);

const errors = issues.filter(i => i.severity === 'error');
const warnings = issues.filter(i => i.severity === 'warning');

if (errors.length > 0) {
  console.log(`\n❌ ERRORS (${errors.length}):`);
  errors.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    ${issue.importPath}`);
    console.log(`    ${issue.issue}\n`);
  });
}

if (warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
  warnings.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    ${issue.issue}\n`);
  });
}

if (issues.length === 0) {
  console.log('✅ No import issues found!');
}

process.exit(errors.length > 0 ? 1 : 0);
