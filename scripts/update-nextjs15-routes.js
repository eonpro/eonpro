import { logger } from '../src/lib/logger';

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const files = [
  'src/app/api/admin/influencers/[id]/route.ts',
  'src/app/api/influencers/bank-accounts/[id]/set-default/route.ts',
  'src/app/api/influencers/bank-accounts/[id]/route.ts',
  'src/app/api/patients/[id]/documents/route.ts',
  'src/app/api/patients/[id]/documents/[documentId]/download/route.ts',
  'src/app/api/patients/[id]/subscriptions/route.ts',
  'src/app/api/subscriptions/[id]/cancel/route.ts',
  'src/app/api/subscriptions/[id]/resume/route.ts',
  'src/app/api/subscriptions/[id]/pause/route.ts',
  'src/app/api/stripe/invoices/[id]/route.ts',
  'src/app/api/orders/[id]/route.ts',
  'src/app/api/soap-notes/[id]/route.ts',
  'src/app/api/providers/[id]/set-password/route.ts',
  'src/app/api/providers/[id]/route.ts',
  'src/app/api/patients/[id]/route.ts',
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Pattern 1: Single param
    content = content.replace(
      /\{ params \}: \{ params: \{ (\w+): string \} \}/g,
      '{ params }: { params: Promise<{ $1: string }> }'
    );
    
    // Pattern 2: Multiple params
    content = content.replace(
      /\{ params \}: \{ params: \{ (\w+): string; (\w+): string \} \}/g,
      '{ params }: { params: Promise<{ $1: string; $2: string }> }'
    );
    
    // Add await for params access if not already present
    if (content.includes('{ params: Promise<')) {
      // Check if params is already being awaited
      if (!content.includes('await params')) {
        // Find all places where params is used
        const paramUsages = content.match(/params\.\w+/g);
        if (paramUsages) {
          const uniqueUsages = [...new Set(paramUsages)];
          
          // Add resolved params variable right after the function starts
          content = content.replace(
            /(export async function \w+\([^)]+\) \{[^}]*\n\s*try \{)/g,
            '$1\n    const resolvedParams = await params;'
          );
          
          // Replace all params.X with resolvedParams.X
          uniqueUsages.forEach(usage => {
            const prop = usage.split('.')[1];
            content = content.replace(
              new RegExp(`params\\.${prop}`, 'g'),
              `resolvedParams.${prop}`
            );
          });
        }
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    logger.info(`✅ Updated: ${filePath}`);
  } catch (error) {
    logger.error(`❌ Failed to update ${filePath}:`, error.message);
  }
}

logger.info('Updating Next.js 15 route handlers...\n');

files.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    updateFile(fullPath);
  } else {
    logger.info(`⚠️  File not found: ${file}`);
  }
});

logger.info('\nDone!');
