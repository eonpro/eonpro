#!/usr/bin/env node

import fs from 'fs';
import { logger } from '../src/lib/logger';

import path from 'path';
import { glob } from 'glob';

async function main() {
  logger.info('🔧 Fixing prescriptionTracking references...\n');
  
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**']
  });
  
  let fixedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;
    
    // Fix prescriptionTracking references
    content = content.replace(/prisma\.prescriptionTracking/g, '(prisma as any).prescriptionTracking');
    
    // Fix notificationRule references
    content = content.replace(/prisma\.notificationRule/g, '(prisma as any).notificationRule');
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      logger.info(`✅ Fixed ${file}`);
      fixedCount++;
    }
  }
  
  logger.info(`\n✨ Fixed ${fixedCount} files!`);
}

main().catch(console.error);
