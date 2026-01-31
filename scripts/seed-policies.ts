#!/usr/bin/env node
/**
 * Seed Policies Script
 * 
 * Loads all formal policies from docs/policies/ into the database
 * for digital signature and acknowledgment tracking.
 * 
 * Usage:
 *   npx tsx scripts/seed-policies.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface PolicyMeta {
  policyId: string;
  title: string;
  version: string;
  effectiveDate: Date;
  approvalRoles: string[];
}

/**
 * Extract metadata from policy markdown file
 */
function extractPolicyMeta(content: string, filename: string): PolicyMeta | null {
  // Extract Policy ID (e.g., POL-001)
  const policyIdMatch = content.match(/\*\*Policy ID:\*\*\s*(\S+)/);
  if (!policyIdMatch) return null;

  // Extract title from first heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  
  // Extract version
  const versionMatch = content.match(/\*\*Version:\*\*\s*(\S+)/);
  
  // Extract effective date
  const dateMatch = content.match(/\*\*Effective Date:\*\*\s*(.+)/);
  
  return {
    policyId: policyIdMatch[1],
    title: titleMatch ? titleMatch[1].trim() : filename.replace('.md', ''),
    version: versionMatch ? versionMatch[1] : '1.0',
    effectiveDate: dateMatch ? new Date(dateMatch[1].trim()) : new Date(),
    approvalRoles: ['super_admin'], // Default
  };
}

/**
 * Generate SHA-256 hash of content
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function seedPolicies() {
  console.log('========================================');
  console.log('Policy Seeding Script');
  console.log('========================================\n');

  const policiesDir = path.join(process.cwd(), 'docs', 'policies');

  // Check if policies directory exists
  if (!fs.existsSync(policiesDir)) {
    console.error('Error: docs/policies directory not found');
    process.exit(1);
  }

  // Get all policy files (exclude README)
  const files = fs.readdirSync(policiesDir)
    .filter(f => f.startsWith('POL-') && f.endsWith('.md'));

  console.log(`Found ${files.length} policy files\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = path.join(policiesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const meta = extractPolicyMeta(content, file);
    if (!meta) {
      console.error(`  ✗ Could not extract metadata from ${file}`);
      errors++;
      continue;
    }

    const contentHash = hashContent(content);

    try {
      // Check if policy exists
      const existing = await prisma.policy.findUnique({
        where: { policyId: meta.policyId },
      });

      if (existing) {
        // Update if content changed
        if (existing.contentHash !== contentHash) {
          await prisma.policy.update({
            where: { policyId: meta.policyId },
            data: {
              title: meta.title,
              version: meta.version,
              effectiveDate: meta.effectiveDate,
              content,
              contentHash,
              updatedAt: new Date(),
            },
          });
          console.log(`  ↻ Updated: ${meta.policyId} - ${meta.title}`);
          updated++;
        } else {
          console.log(`  ○ No changes: ${meta.policyId} - ${meta.title}`);
        }
      } else {
        // Create new policy
        await prisma.policy.create({
          data: {
            policyId: meta.policyId,
            title: meta.title,
            version: meta.version,
            effectiveDate: meta.effectiveDate,
            content,
            contentHash,
            status: 'draft',
            requiresApproval: true,
            approvalRoles: meta.approvalRoles,
          },
        });
        console.log(`  ✓ Created: ${meta.policyId} - ${meta.title}`);
        created++;
      }
    } catch (error: any) {
      console.error(`  ✗ Error processing ${file}:`, error.message);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors:  ${errors}`);
  console.log('========================================\n');

  // Show policy approval status
  const policies = await prisma.policy.findMany({
    include: {
      PolicyApproval: {
        select: { approvalType: true, userName: true },
      },
    },
    orderBy: { policyId: 'asc' },
  });

  console.log('Policy Approval Status:\n');
  console.log('| Policy ID | Title | Status | Approvals |');
  console.log('|-----------|-------|--------|-----------|');
  
  for (const p of policies) {
    const approvals = p.PolicyApproval.map(a => 
      `${a.approvalType.replace('_', ' ')}: ${a.userName}`
    ).join(', ') || 'None';
    
    console.log(`| ${p.policyId} | ${p.title.substring(0, 30)}... | ${p.status} | ${approvals} |`);
  }

  console.log('\n');
  console.log('Next steps:');
  console.log('1. Log in as super_admin');
  console.log('2. Navigate to /super-admin/policies');
  console.log('3. Review and digitally sign each policy');
  console.log('');
}

// Run
seedPolicies()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
