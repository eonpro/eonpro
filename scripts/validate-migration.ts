#!/usr/bin/env tsx
/**
 * Migration Validator (Enterprise)
 * 
 * Validates that migration SQL files follow idempotent patterns.
 * Can be run as:
 *   - Pre-commit hook
 *   - CI check
 *   - Manual validation
 * 
 * Usage:
 *   npx tsx scripts/validate-migration.ts [migration_file_or_dir]
 *   
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface ValidationResult {
  file: string;
  errors: string[];
  warnings: string[];
}

interface ValidationRule {
  name: string;
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

// Validation rules for idempotent migrations
const VALIDATION_RULES: ValidationRule[] = [
  {
    name: 'CREATE TABLE without IF NOT EXISTS',
    pattern: /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi,
    message: 'CREATE TABLE should use IF NOT EXISTS',
    severity: 'error',
    suggestion: 'CREATE TABLE IF NOT EXISTS "TableName" (...)',
  },
  {
    name: 'CREATE INDEX without IF NOT EXISTS',
    pattern: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)(?!CONCURRENTLY\s+IF)/gi,
    message: 'CREATE INDEX should use IF NOT EXISTS',
    severity: 'error',
    suggestion: 'CREATE INDEX IF NOT EXISTS "index_name" ON ...',
  },
  {
    name: 'CREATE TYPE without existence check',
    pattern: /CREATE\s+TYPE\s+"?\w+"?\s+AS\s+ENUM/gi,
    message: 'CREATE TYPE should be wrapped in DO block with existence check',
    severity: 'warning',
    suggestion: 'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = \'TypeName\') THEN CREATE TYPE ... END IF; END $$;',
  },
  {
    name: 'ALTER TABLE ADD COLUMN without existence check',
    pattern: /ALTER\s+TABLE\s+"?\w+"?\s+ADD\s+(?:COLUMN\s+)?(?!CONSTRAINT)"?\w+"?\s+(?!IF\s+NOT\s+EXISTS)/gi,
    message: 'ALTER TABLE ADD COLUMN should check if column exists',
    severity: 'warning',
    suggestion: 'Wrap in DO $$ block with information_schema.columns check',
  },
  {
    name: 'DROP TABLE without IF EXISTS',
    pattern: /DROP\s+TABLE\s+(?!IF\s+EXISTS)/gi,
    message: 'DROP TABLE should use IF EXISTS',
    severity: 'error',
    suggestion: 'DROP TABLE IF EXISTS "TableName"',
  },
  {
    name: 'DROP COLUMN without IF EXISTS',
    pattern: /DROP\s+COLUMN\s+(?!IF\s+EXISTS)/gi,
    message: 'DROP COLUMN should use IF EXISTS',
    severity: 'error',
    suggestion: 'DROP COLUMN IF EXISTS "column_name"',
  },
  {
    name: 'ADD CONSTRAINT without existence check',
    pattern: /ADD\s+CONSTRAINT\s+"?\w+"?\s+(?:FOREIGN\s+KEY|PRIMARY\s+KEY|UNIQUE|CHECK)/gi,
    message: 'ADD CONSTRAINT should check if constraint exists',
    severity: 'warning',
    suggestion: 'Wrap in DO $$ block with information_schema.table_constraints check',
  },
  {
    name: 'TRUNCATE statement detected',
    pattern: /\bTRUNCATE\s+/gi,
    message: 'TRUNCATE is destructive and should be avoided in migrations',
    severity: 'error',
    suggestion: 'Use DELETE with WHERE clause instead, or confirm this is intentional',
  },
  {
    name: 'DROP DATABASE detected',
    pattern: /DROP\s+DATABASE/gi,
    message: 'DROP DATABASE is extremely dangerous in migrations',
    severity: 'error',
    suggestion: 'Never drop database in migrations',
  },
];

// Patterns that indicate idempotent code (good patterns)
const IDEMPOTENT_PATTERNS = [
  /IF\s+NOT\s+EXISTS/gi,
  /IF\s+EXISTS/gi,
  /DO\s+\$\$/gi,
  /CREATE\s+.*\s+IF\s+NOT\s+EXISTS/gi,
  /DROP\s+.*\s+IF\s+EXISTS/gi,
];

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateMigrationFile(filePath: string): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(filePath)) {
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Skip template files
  if (filePath.includes('_template')) {
    return result;
  }

  // Check each rule
  for (const rule of VALIDATION_RULES) {
    // Reset regex state
    rule.pattern.lastIndex = 0;
    
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      // Find line number
      const upToMatch = content.substring(0, match.index);
      const lineNumber = upToMatch.split('\n').length;
      
      // Check if this is inside a comment
      const line = lines[lineNumber - 1] || '';
      if (line.trim().startsWith('--')) {
        continue; // Skip commented lines
      }

      // Check if there's an idempotent pattern nearby (within 5 lines)
      const startLine = Math.max(0, lineNumber - 5);
      const endLine = Math.min(lines.length, lineNumber + 5);
      const nearbyContent = lines.slice(startLine, endLine).join('\n');
      
      let hasIdempotentPattern = false;
      for (const idempotentPattern of IDEMPOTENT_PATTERNS) {
        idempotentPattern.lastIndex = 0;
        if (idempotentPattern.test(nearbyContent)) {
          hasIdempotentPattern = true;
          break;
        }
      }

      if (hasIdempotentPattern) {
        continue; // Skip if idempotent pattern found nearby
      }

      const message = `Line ${lineNumber}: ${rule.message}`;
      const fullMessage = rule.suggestion 
        ? `${message}\n    Suggestion: ${rule.suggestion}`
        : message;

      if (rule.severity === 'error') {
        result.errors.push(fullMessage);
      } else {
        result.warnings.push(fullMessage);
      }
    }
  }

  // Check for missing header
  if (!content.includes('Idempotent:') && !content.includes('idempotent')) {
    result.warnings.push('Missing idempotent documentation header');
  }

  return result;
}

function findMigrationFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Look for migration.sql in subdirectories
      const migrationFile = path.join(fullPath, 'migration.sql');
      if (fs.existsSync(migrationFile)) {
        files.push(migrationFile);
      }
      // Also recurse
      files.push(...findMigrationFiles(fullPath));
    } else if (entry.name.endsWith('.sql') && !entry.name.startsWith('_')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('Migration Validator (Enterprise)', 'cyan');
  console.log('='.repeat(60) + '\n');

  const args = process.argv.slice(2);
  let filesToValidate: string[] = [];

  if (args.length > 0) {
    // Validate specific file or directory
    for (const arg of args) {
      const fullPath = path.resolve(arg);
      if (fs.statSync(fullPath).isDirectory()) {
        filesToValidate.push(...findMigrationFiles(fullPath));
      } else {
        filesToValidate.push(fullPath);
      }
    }
  } else {
    // Validate all migrations
    const migrationsDir = path.resolve(__dirnameSafe, '../prisma/migrations');
    filesToValidate = findMigrationFiles(migrationsDir);
  }

  if (filesToValidate.length === 0) {
    log('No migration files found to validate', 'yellow');
    process.exit(0);
  }

  log(`Validating ${filesToValidate.length} migration file(s)...\n`, 'blue');

  let totalErrors = 0;
  let totalWarnings = 0;
  const results: ValidationResult[] = [];

  for (const file of filesToValidate) {
    const result = validateMigrationFile(file);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // Print results
  for (const result of results) {
    if (result.errors.length === 0 && result.warnings.length === 0) {
      continue; // Skip files with no issues
    }

    const relativePath = path.relative(process.cwd(), result.file);
    console.log(`\n${colors.cyan}${relativePath}${colors.reset}`);

    for (const error of result.errors) {
      log(`  ❌ ${error}`, 'red');
    }

    for (const warning of result.warnings) {
      log(`  ⚠️  ${warning}`, 'yellow');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  log('Validation Summary', 'cyan');
  console.log('='.repeat(60));
  
  log(`Files checked: ${filesToValidate.length}`, 'blue');
  
  if (totalErrors > 0) {
    log(`Errors: ${totalErrors}`, 'red');
  } else {
    log(`Errors: 0`, 'green');
  }
  
  if (totalWarnings > 0) {
    log(`Warnings: ${totalWarnings}`, 'yellow');
  } else {
    log(`Warnings: 0`, 'green');
  }

  console.log('='.repeat(60) + '\n');

  if (totalErrors > 0) {
    log('❌ Validation failed - please fix errors before committing', 'red');
    process.exit(1);
  } else if (totalWarnings > 0) {
    log('⚠️  Validation passed with warnings - review before committing', 'yellow');
    process.exit(0);
  } else {
    log('✅ All migrations are valid and idempotent!', 'green');
    process.exit(0);
  }
}

main().catch(error => {
  log(`Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
