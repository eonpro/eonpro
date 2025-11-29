#!/usr/bin/env tsx
/**
 * Script to remove console.log statements and replace with logger
 * Run with: npx tsx scripts/remove-console-logs.ts
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

interface FileUpdate {
  file: string;
  originalContent: string;
  newContent: string;
  changes: number;
}

/**
 * Process a single file
 */
function processFile(filePath: string): FileUpdate | null {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let changes = 0;
  
  // Patterns to replace
  const replacements = [
    // console.log -> logger.info
    {
      pattern: /console\.log\(/g,
      replacement: 'logger.info(',
      count: 0
    },
    // console.error -> logger.error
    {
      pattern: /console\.error\(/g,
      replacement: 'logger.error(',
      count: 0
    },
    // console.warn -> logger.warn
    {
      pattern: /console\.warn\(/g,
      replacement: 'logger.warn(',
      count: 0
    },
    // console.debug -> logger.debug
    {
      pattern: /console\.debug\(/g,
      replacement: 'logger.debug(',
      count: 0
    },
    // console.info -> logger.info
    {
      pattern: /console\.info\(/g,
      replacement: 'logger.info(',
      count: 0
    }
  ];
  
  // Apply replacements
  replacements.forEach(({ pattern, replacement }) => {
    const matches = newContent.match(pattern);
    if (matches) {
      changes += matches.length;
      newContent = newContent.replace(pattern, replacement);
    }
  });
  
  // Skip if no changes
  if (changes === 0) {
    return null;
  }
  
  // Check if logger import is needed
  const hasLoggerImport = /import.*logger.*from.*['"].*logger['"]/.test(newContent);
  const usesLogger = /logger\.(info|error|warn|debug)/.test(newContent);
  
  if (usesLogger && !hasLoggerImport) {
    // Determine the correct import path
    const relativePath = path.relative(path.dirname(filePath), 'src/lib');
    const importPath = relativePath.startsWith('.') ? 
      relativePath.replace(/\\/g, '/') + '/logger' : 
      '@/lib/logger';
    
    // Add logger import at the top of the file
    const importStatement = `import { logger } from '${importPath}';\n`;
    
    // Find the right place to insert (after other imports)
    const importMatch = newContent.match(/^import[\s\S]*?from\s+['"].*?['"];?\s*$/m);
    if (importMatch) {
      const lastImportIndex = newContent.lastIndexOf(importMatch[0]) + importMatch[0].length;
      newContent = 
        newContent.slice(0, lastImportIndex) + 
        '\n' + importStatement +
        newContent.slice(lastImportIndex);
    } else {
      // No imports found, add at the beginning
      newContent = importStatement + '\n' + newContent;
    }
  }
  
  return {
    file: filePath,
    originalContent: content,
    newContent,
    changes
  };
}

/**
 * Main execution
 */
async function main() {
  logger.info('🔍 Scanning for console.log statements...\n');
  
  // Find all TypeScript and JavaScript files
  const patterns = [
    'src/**/*.ts',
    'src/**/*.tsx',
    'scripts/*.ts',
    'scripts/*.js'
  ];
  
  let totalFiles = 0;
  let filesUpdated = 0;
  let totalChanges = 0;
  const updates: FileUpdate[] = [];
  
  for (const pattern of patterns) {
    const files = glob.sync(pattern, {
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/lib/logger.ts' // Don't modify the logger itself
      ]
    });
    
    for (const file of files) {
      totalFiles++;
      const update = processFile(file);
      
      if (update) {
        updates.push(update);
        filesUpdated++;
        totalChanges += update.changes;
        
        if (VERBOSE) {
          logger.info(`  ✏️  ${file}: ${update.changes} replacements`);
        }
      }
    }
  }
  
  // Report findings
  logger.info('\n📊 Summary:');
  logger.info(`  Files scanned: ${totalFiles}`);
  logger.info(`  Files with console statements: ${filesUpdated}`);
  logger.info(`  Total console statements found: ${totalChanges}`);
  
  if (DRY_RUN) {
    logger.info('\n⚠️  DRY RUN - No files were modified');
    logger.info('Run without --dry-run to apply changes\n');
    
    if (VERBOSE && updates.length > 0) {
      logger.info('Files that would be updated:');
      updates.forEach(update => {
        logger.info(`  - ${update.file}`);
      });
    }
  } else if (updates.length > 0) {
    // Create backup directory
    const backupDir = `backup-console-logs-${Date.now()}`;
    fs.mkdirSync(backupDir, { recursive: true });
    
    logger.info(`\n💾 Creating backups in ${backupDir}/`);
    
    // Apply updates
    for (const update of updates) {
      // Backup original file
      const backupPath = path.join(backupDir, path.basename(update.file));
      fs.writeFileSync(backupPath, update.originalContent);
      
      // Write updated content
      fs.writeFileSync(update.file, update.newContent);
    }
    
    logger.info('\n✅ Console statements replaced with logger!');
    logger.info(`📁 Backups saved to: ${backupDir}/`);
    
    // Additional instructions
    logger.info('\n📝 Next steps:');
    logger.info('  1. Review the changes: git diff');
    logger.info('  2. Run tests to ensure nothing broke: npm test');
    logger.info('  3. Check that logger imports are correct');
    logger.info('  4. Commit the changes: git commit -m "Replace console.log with logger for HIPAA compliance"');
  } else {
    logger.info('\n✨ No console statements found - code is clean!');
  }
  
  // Security reminder
  logger.info('\n🔒 Security Reminder:');
  logger.info('  - Never log PHI (patient names, SSN, DOB, etc.)');
  logger.info('  - Use logger.debug() for development only');
  logger.info('  - Review all log statements for sensitive data');
  logger.info('  - Configure log retention policies');
}

// Run the script
main().catch(error => {
  logger.error('❌ Error:', error);
  process.exit(1);
});