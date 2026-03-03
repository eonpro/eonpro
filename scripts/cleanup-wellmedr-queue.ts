#!/usr/bin/env tsx
/**
 * WellMedR Provider Queue Cleanup Script
 * ========================================
 *
 * Diagnoses and fixes duplicate/stale invoices flooding the WellMedR provider queue.
 *
 * The provider queue shows invoices where status='PAID' AND prescriptionProcessed=false.
 * Past prescriptions can re-enter the queue when:
 *   1. Airtable automation re-fires with slightly different payloads (bypasses body-hash idempotency)
 *   2. The Airtable replay script is run with different field mappings
 *   3. Invoices lack submission_id, so dedup falls back to payment_method_id (a card, not a tx)
 *
 * This script:
 *   - Reports all WellMedR invoices currently in the provider queue
 *   - Identifies duplicates (same patient + same submissionId or overlapping payment method + amount)
 *   - Identifies invoices whose patient already has a recent Lifefile prescription (already prescribed)
 *   - In --fix mode, marks duplicates/already-prescribed invoices as processed
 *
 * Usage:
 *   # Dry run (default) — shows what would happen
 *   npx tsx scripts/cleanup-wellmedr-queue.ts
 *
 *   # Execute cleanup
 *   npx tsx scripts/cleanup-wellmedr-queue.ts --fix
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/cleanup-wellmedr-queue.ts --fix
 */

import { PrismaClient } from '@prisma/client';
import { decryptPHI } from '../src/lib/security/phi-encryption';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const DRY_RUN = !process.argv.includes('--fix');

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    const parts = value.split(':');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value);
    }
    return value;
  } catch {
    return value;
  }
}

interface QueuedInvoice {
  id: number;
  patientId: number;
  clinicId: number;
  amount: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  prescriptionProcessed: boolean;
  metadata: Record<string, any> | null;
  patient: {
    id: number;
    patientId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     WellMedR Provider Queue Cleanup                        ║');
  console.log(`║     Mode: ${DRY_RUN ? 'DRY RUN (use --fix to apply)' : '⚠️  LIVE — changes will be applied'}        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Find WellMedR clinic
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'wellmedr' },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    console.error('❌ WellMedR clinic not found');
    process.exit(1);
  }

  console.log(`✓ Clinic: ${clinic.name} (ID: ${clinic.id}, subdomain: ${clinic.subdomain})`);
  console.log('');

  // Step 2: Fetch all invoices currently in the provider queue
  const queuedInvoices = (await prisma.invoice.findMany({
    where: {
      clinicId: clinic.id,
      status: 'PAID',
      prescriptionProcessed: false,
    },
    include: {
      patient: {
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { paidAt: 'asc' },
  })) as unknown as QueuedInvoice[];

  console.log(`📋 Invoices in provider queue: ${queuedInvoices.length}`);
  if (queuedInvoices.length === 0) {
    console.log('   Queue is empty — nothing to clean up.');
    process.exit(0);
  }

  // Step 3: Also fetch invoices that ARE processed (for duplicate comparison)
  const processedInvoices = (await prisma.invoice.findMany({
    where: {
      clinicId: clinic.id,
      status: 'PAID',
      prescriptionProcessed: true,
    },
    select: {
      id: true,
      patientId: true,
      amount: true,
      metadata: true,
      paidAt: true,
      prescriptionProcessedAt: true,
    },
  })) as unknown as Array<{
    id: number;
    patientId: number;
    amount: number;
    metadata: Record<string, any> | null;
    paidAt: Date | null;
    prescriptionProcessedAt: Date | null;
  }>;

  // Build lookup: patient+submissionId → processed invoice
  const processedBySubmissionId = new Map<string, typeof processedInvoices[0]>();
  const processedByPatient = new Map<number, typeof processedInvoices>();
  for (const inv of processedInvoices) {
    const subId = (inv.metadata as any)?.submissionId;
    if (subId) {
      processedBySubmissionId.set(`${inv.patientId}:${subId}`, inv);
    }
    const existing = processedByPatient.get(inv.patientId) || [];
    existing.push(inv);
    processedByPatient.set(inv.patientId, existing);
  }

  // Step 4: Analyze each queued invoice
  const duplicates: QueuedInvoice[] = [];
  const alreadyPrescribed: QueuedInvoice[] = [];
  const legitimate: QueuedInvoice[] = [];

  // Track queue-internal duplicates by submissionId AND by patient+amount+day
  const seenSubmissionIds = new Map<string, QueuedInvoice>();
  const seenPatientAmountDay = new Map<string, QueuedInvoice>();

  for (const inv of queuedInvoices) {
    const meta = inv.metadata as Record<string, any> | null;
    const submissionId = meta?.submissionId || '';
    let isDuplicate = false;
    let reason = '';

    // Check 1: Same patient + same submissionId already processed
    if (submissionId) {
      const processedKey = `${inv.patientId}:${submissionId}`;
      const existing = processedBySubmissionId.get(processedKey);
      if (existing) {
        isDuplicate = true;
        reason = `Duplicate of processed invoice #${existing.id} (same submissionId: ${submissionId})`;
      }

      // Check 1b: Queue-internal duplicate (same submissionId already in this queue batch)
      if (!isDuplicate) {
        const queueDup = seenSubmissionIds.get(processedKey);
        if (queueDup) {
          isDuplicate = true;
          reason = `Queue-internal duplicate of invoice #${queueDup.id} (same submissionId: ${submissionId})`;
        } else {
          seenSubmissionIds.set(processedKey, inv);
        }
      }
    }

    // Check 2: Same patient + same amount + close dates → likely duplicate from replay
    if (!isDuplicate) {
      const patientProcessed = processedByPatient.get(inv.patientId) || [];
      for (const proc of patientProcessed) {
        if (proc.amount === inv.amount && inv.paidAt && proc.paidAt) {
          const timeDiff = Math.abs(inv.paidAt.getTime() - proc.paidAt.getTime());
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
          if (daysDiff < 3) {
            isDuplicate = true;
            reason = `Likely duplicate of processed invoice #${proc.id} (same patient, amount $${(inv.amount / 100).toFixed(2)}, paid ${daysDiff.toFixed(1)} days apart)`;
            break;
          }
        }
      }
    }

    // Check 3: Queue-internal duplicate by patient + amount + same day (no submissionId needed).
    // Airtable automation sends the same order 2-3 times with slightly different payloads,
    // creating multiple invoices that all lack submissionId. Keep the first one seen, mark rest as dupes.
    if (!isDuplicate) {
      const paidDate = inv.paidAt || inv.createdAt;
      const dayKey = `${inv.patientId}:${inv.amount}:${paidDate.toISOString().split('T')[0]}`;
      const existing = seenPatientAmountDay.get(dayKey);
      if (existing) {
        isDuplicate = true;
        reason = `Queue-internal duplicate of invoice #${existing.id} (same patient, amount $${(inv.amount / 100).toFixed(2)}, same day)`;
      } else {
        seenPatientAmountDay.set(dayKey, inv);
      }
    }

    // Check 4: Invoice older than 30 days and patient already has a processed invoice
    if (!isDuplicate) {
      const ageMs = Date.now() - (inv.paidAt?.getTime() || inv.createdAt.getTime());
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const patientProcessed = processedByPatient.get(inv.patientId) || [];

      if (ageDays > 30 && patientProcessed.length > 0) {
        alreadyPrescribed.push(inv);
        continue;
      }
    }

    if (isDuplicate) {
      (inv as any)._reason = reason;
      duplicates.push(inv);
    } else {
      legitimate.push(inv);
    }
  }

  // Step 5: Report findings
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ANALYSIS RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total in queue:           ${queuedInvoices.length}`);
  console.log(`  Duplicates:               ${duplicates.length}`);
  console.log(`  Stale (>30d, already Rx):  ${alreadyPrescribed.length}`);
  console.log(`  Legitimate:               ${legitimate.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Show date distribution
  const byMonth = new Map<string, number>();
  for (const inv of queuedInvoices) {
    const d = inv.paidAt || inv.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }
  console.log('📊 Queue items by paid month:');
  for (const [month, count] of Array.from(byMonth.entries()).sort()) {
    console.log(`   ${month}: ${'█'.repeat(Math.min(count, 50))} ${count}`);
  }
  console.log('');

  // Show duplicates
  if (duplicates.length > 0) {
    console.log('🔁 DUPLICATES (will be marked as processed):');
    for (const inv of duplicates) {
      const name = `${safeDecrypt(inv.patient.firstName) || '?'} ${safeDecrypt(inv.patient.lastName) || '?'}`;
      const meta = inv.metadata as Record<string, any> | null;
      console.log(`   Invoice #${inv.id} | ${name} | $${(inv.amount / 100).toFixed(2)} | paid ${inv.paidAt?.toISOString().split('T')[0] || '?'}`);
      console.log(`     → ${(inv as any)._reason}`);
    }
    console.log('');
  }

  // Show stale
  if (alreadyPrescribed.length > 0) {
    console.log('📦 STALE (>30 days old, patient already prescribed):');
    for (const inv of alreadyPrescribed) {
      const name = `${safeDecrypt(inv.patient.firstName) || '?'} ${safeDecrypt(inv.patient.lastName) || '?'}`;
      const ageDays = Math.floor((Date.now() - (inv.paidAt?.getTime() || inv.createdAt.getTime())) / (1000 * 60 * 60 * 24));
      console.log(`   Invoice #${inv.id} | ${name} | $${(inv.amount / 100).toFixed(2)} | paid ${inv.paidAt?.toISOString().split('T')[0] || '?'} (${ageDays}d ago)`);
    }
    console.log('');
  }

  // Show legitimate
  if (legitimate.length > 0) {
    console.log('✅ LEGITIMATE (will remain in queue):');
    for (const inv of legitimate) {
      const name = `${safeDecrypt(inv.patient.firstName) || '?'} ${safeDecrypt(inv.patient.lastName) || '?'}`;
      const meta = inv.metadata as Record<string, any> | null;
      const ageDays = Math.floor((Date.now() - (inv.paidAt?.getTime() || inv.createdAt.getTime())) / (1000 * 60 * 60 * 24));
      console.log(`   Invoice #${inv.id} | ${name} | $${(inv.amount / 100).toFixed(2)} | paid ${inv.paidAt?.toISOString().split('T')[0] || '?'} (${ageDays}d ago) | subId: ${meta?.submissionId || 'none'}`);
    }
    console.log('');
  }

  // Step 6: Apply fixes
  const toFix = [...duplicates, ...alreadyPrescribed];
  if (toFix.length === 0) {
    console.log('✨ No duplicates or stale items found — queue looks clean.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`🔒 DRY RUN — Would mark ${toFix.length} invoices as processed.`);
    console.log('   Run with --fix to apply changes.');
    process.exit(0);
  }

  console.log(`⚡ Marking ${toFix.length} invoices as processed...`);

  let fixed = 0;
  let errors = 0;

  for (const inv of toFix) {
    try {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          prescriptionProcessed: true,
          prescriptionProcessedAt: new Date(),
          metadata: {
            ...(inv.metadata as Record<string, any> || {}),
            cleanupReason: (inv as any)._reason || 'stale-already-prescribed',
            cleanupAt: new Date().toISOString(),
            cleanupScript: 'cleanup-wellmedr-queue.ts',
          },
        },
      });
      fixed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Failed to update invoice #${inv.id}: ${msg}`);
      errors++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ Fixed: ${fixed}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log(`  📋 Remaining in queue: ${legitimate.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
