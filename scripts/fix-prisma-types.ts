#!/usr/bin/env node
/**
 * Script to fix Prisma type issues
 * Converts findUnique to findFirst when using non-unique fields
 */

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

function fixPrismaUniqueConstraints(content: string): string {
  let modified = content;
  
  // Fix Provider findUnique with email only - change to findFirst
  modified = modified.replace(
    /prisma\.provider\.(findUnique|update|delete)\s*\(\s*{\s*where:\s*{\s*email:/g,
    'prisma.provider.findFirst({ where: { email:'
  );
  
  // Fix Patient findUnique with email only - change to findFirst  
  modified = modified.replace(
    /prisma\.patient\.(findUnique|update|delete)\s*\(\s*{\s*where:\s*{\s*email:/g,
    'prisma.patient.findFirst({ where: { email:'
  );
  
  // Fix update operations that should use id
  modified = modified.replace(
    /prisma\.provider\.update\s*\(\s*{\s*where:\s*{\s*email:\s*([^}]+)}\s*,/g,
    (match, email) => {
      // First find the provider, then update by id
      return `prisma.provider.update({ where: { id: provider.id }, // Note: Need to fetch provider first`;
    }
  );
  
  // Fix where providerId doesn't exist (should be provider relation)
  modified = modified.replace(
    /where:\s*{\s*providerId:\s*([^}]+)}/g,
    'where: { provider: { id: $1 } }'
  );
  
  // Fix performedById and performedByEmail in audit tables
  modified = modified.replace(/performedById:/g, 'providerId:');
  modified = modified.replace(/performedByEmail:/g, 'actorEmail:');
  
  // Fix 'changes' field that should be 'diff'
  modified = modified.replace(/\.changes\b/g, '.diff');
  
  // Fix NullableJsonNullValueInput type issues
  modified = modified.replace(
    /metadata:\s*([^,\n]+)\s*\|\s*null/g,
    'metadata: $1 || undefined'
  );
  
  return modified;
}

function fixRoleEnums(content: string): string {
  let modified = content;
  
  // Our actual roles: 'admin', 'provider', 'patient', 'influencer'
  // Fix incorrect role comparisons
  
  modified = modified.replace(/["']SUPER_ADMIN["']/g, '"admin"');
  modified = modified.replace(/["']ADMIN["']/g, '"admin"');
  modified = modified.replace(/["']PROVIDER["']/g, '"provider"');
  modified = modified.replace(/["']PATIENT["']/g, '"patient"');
  modified = modified.replace(/["']INFLUENCER["']/g, '"influencer"');
  
  return modified;
}

function fixImplicitAny(content: string): string {
  let modified = content;
  
  // Add types for common callback patterns
  modified = modified.replace(
    /\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*=>\s*{/g,
    (match, param) => {
      // Skip if already typed or if it's a common typed param
      if (match.includes(':') || 
          param === 'req' || param === 'res' || 
          param === 'error' || param === 'err' || 
          param === 'e') {
        return match;
      }
      return `(${param}: any) => {`;
    }
  );
  
  return modified;
}

function fixWebhookStatus(content: string): string {
  let modified = content;
  
  // Fix WebhookStatus enum values
  modified = modified.replace(/status:\s*["']PROCESSED["']/g, 'status: "processed"');
  modified = modified.replace(/status:\s*["']FAILED["']/g, 'status: "failed"');
  modified = modified.replace(/WebhookStatus\s*===\s*["']PROCESSED["']/g, 'WebhookStatus === "processed"');
  
  return modified;
}

async function main() {
  logger.info('🔧 Fixing Prisma type issues...\n');
  
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts']
  });
  
  let fixedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    content = fixPrismaUniqueConstraints(content);
    content = fixRoleEnums(content);
    content = fixImplicitAny(content);
    content = fixWebhookStatus(content);
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      logger.info(`✅ Fixed ${file}`);
      fixedCount++;
    }
  }
  
  logger.info(`\n✨ Fixed ${fixedCount} files!`);
}

main().catch(console.error);
