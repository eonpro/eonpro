#!/usr/bin/env tsx
/**
 * WellMedR Duplicate Patient Merge Script
 * =========================================
 *
 * Merges duplicate patient profiles for the WellMedR clinic.
 * Uses the same relation re-pointing logic as the PatientMergeService.
 *
 * Strategy:
 *   - For each duplicate group (same email), pick the TARGET (patient to keep)
 *     based on: most related records > oldest createdAt > lowest DB id
 *   - All other patients in the group become SOURCES (merged into target, then deleted)
 *   - All relations are re-pointed from source → target in a serializable transaction
 *
 * Usage:
 *   # Dry run (default) — shows what would happen
 *   npx tsx scripts/merge-wellmedr-duplicates.ts
 *
 *   # Execute merges
 *   npx tsx scripts/merge-wellmedr-duplicates.ts --execute
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/merge-wellmedr-duplicates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { decryptPHI, encryptPHI } from '../src/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '../src/lib/utils/search';

// ============================================================================
// Configuration
// ============================================================================

const REPORT_PATH = path.resolve(__dirname, 'data/wellmedr-merge-report.json');
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';
const BATCH_ID = `wellmedr-merge-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ============================================================================
// Types
// ============================================================================

interface DecryptedPatient {
  id: number;
  patientId: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  notes: string | null;
  tags: unknown;
  stripeCustomerId: string | null;
  lifefileId: string | null;
  sourceMetadata: unknown;
  createdAt: Date;
  relationCount: number;
}

interface MergeGroup {
  email: string;
  target: DecryptedPatient;
  sources: DecryptedPatient[];
  totalRelationsToMove: number;
}

interface MergeResult {
  email: string;
  targetId: number;
  targetPatientId: string;
  sourcesDeleted: number[];
  recordsMoved: number;
  status: 'success' | 'error';
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// PHI fields that need encryption/decryption
const PHI_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'dob', 'address1', 'address2', 'city', 'zip'] as const;

// ============================================================================
// Phase 1: Load & Identify Duplicates
// ============================================================================

async function loadDuplicateGroups(clinicId: number): Promise<MergeGroup[]> {
  console.log('🔍 Loading all WellMedR patients with relation counts...');

  const patients = await prisma.patient.findMany({
    where: { clinicId },
    include: {
      _count: {
        select: {
          orders: true,
          invoices: true,
          payments: true,
          paymentMethods: true,
          subscriptions: true,
          soapNotes: true,
          documents: true,
          intakeSubmissions: true,
          appointments: true,
          superbills: true,
          carePlans: true,
          tickets: true,
          weightLogs: true,
          medicationReminders: true,
          waterLogs: true,
          exerciseLogs: true,
          sleepLogs: true,
          nutritionLogs: true,
          aiConversations: true,
          chatMessages: true,
          smsLogs: true,
          referrals: true,
          affiliateReferrals: true,
          discountUsages: true,
          shippingUpdates: true,
          auditEntries: true,
        },
      },
    },
  });

  console.log(`  Loaded ${patients.length} patients. Decrypting & grouping...`);

  // Decrypt and compute relation counts
  const decrypted: DecryptedPatient[] = patients.map((p) => {
    const counts = p._count;
    const totalRelations = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      id: p.id,
      patientId: p.patientId,
      email: safeDecrypt(p.email).toLowerCase().trim(),
      phone: safeDecrypt(p.phone),
      firstName: safeDecrypt(p.firstName),
      lastName: safeDecrypt(p.lastName),
      dob: safeDecrypt(p.dob),
      gender: p.gender || '',
      address1: safeDecrypt(p.address1),
      address2: safeDecrypt(p.address2),
      city: safeDecrypt(p.city),
      state: p.state || '',
      zip: safeDecrypt(p.zip),
      notes: p.notes,
      tags: p.tags,
      stripeCustomerId: p.stripeCustomerId,
      lifefileId: p.lifefileId,
      sourceMetadata: p.sourceMetadata,
      createdAt: p.createdAt,
      relationCount: totalRelations,
    };
  });

  // Group by email
  const emailMap = new Map<string, DecryptedPatient[]>();
  for (const p of decrypted) {
    if (!p.email || p.email === 'unknown@example.com') continue;
    if (!emailMap.has(p.email)) emailMap.set(p.email, []);
    emailMap.get(p.email)!.push(p);
  }

  // Build merge groups (only emails with >1 patient)
  const groups: MergeGroup[] = [];
  for (const [email, patientsInGroup] of emailMap) {
    if (patientsInGroup.length <= 1) continue;

    // Pick target: most relations → oldest → lowest ID
    patientsInGroup.sort((a, b) => {
      if (b.relationCount !== a.relationCount) return b.relationCount - a.relationCount;
      if (a.createdAt.getTime() !== b.createdAt.getTime())
        return a.createdAt.getTime() - b.createdAt.getTime();
      return a.id - b.id;
    });

    const target = patientsInGroup[0];
    const sources = patientsInGroup.slice(1);
    const totalRelationsToMove = sources.reduce((sum, s) => sum + s.relationCount, 0);

    groups.push({ email, target, sources, totalRelationsToMove });
  }

  return groups;
}

// ============================================================================
// Phase 2: Execute Merge (single group)
// ============================================================================

async function mergeGroup(group: MergeGroup): Promise<MergeResult> {
  const { email, target, sources } = group;
  let totalMoved = 0;

  try {
    for (const source of sources) {
      const moved = await prisma.$transaction(
        async (tx) => {
          let recordsMoved = 0;

          // ── Re-point all relations ──────────────────────────────

          const repoint = async (model: string, field: string = 'patientId') => {
            const result = await (tx as any)[model].updateMany({
              where: { [field]: source.id },
              data: { [field]: target.id },
            });
            return result.count;
          };

          recordsMoved += await repoint('order');
          recordsMoved += await repoint('invoice');
          recordsMoved += await repoint('payment');
          recordsMoved += await repoint('paymentMethod');
          recordsMoved += await repoint('subscription');
          recordsMoved += await repoint('sOAPNote');
          recordsMoved += await repoint('patientDocument');
          recordsMoved += await repoint('intakeFormSubmission');
          recordsMoved += await repoint('appointment');
          recordsMoved += await repoint('superbill');
          recordsMoved += await repoint('carePlan');
          recordsMoved += await repoint('ticket');
          recordsMoved += await repoint('patientWeightLog');
          recordsMoved += await repoint('patientMedicationReminder');
          recordsMoved += await repoint('patientWaterLog');
          recordsMoved += await repoint('patientExerciseLog');
          recordsMoved += await repoint('patientSleepLog');
          recordsMoved += await repoint('patientNutritionLog');
          recordsMoved += await repoint('aIConversation');
          recordsMoved += await repoint('patientChatMessage');
          recordsMoved += await repoint('smsLog');
          recordsMoved += await repoint('discountUsage');
          recordsMoved += await repoint('patientShippingUpdate');
          recordsMoved += await repoint('paymentReconciliation');
          recordsMoved += await repoint('hIPAAAuditEntry');
          recordsMoved += await repoint('phoneOtp');

          // Affiliate referrals (different field name)
          const affResult = await tx.affiliateReferral.updateMany({
            where: { referredPatientId: source.id },
            data: { referredPatientId: target.id },
          });
          recordsMoved += affResult.count;

          // ── Handle unique constraint relations ──────────────────

          // ReferralTracking (one-to-one per patient)
          const sourceReferral = await tx.referralTracking.findFirst({
            where: { patientId: source.id },
          });
          const targetReferral = await tx.referralTracking.findFirst({
            where: { patientId: target.id },
          });
          if (sourceReferral) {
            if (targetReferral) {
              await tx.commission.deleteMany({ where: { referralId: sourceReferral.id } });
              await tx.referralTracking.delete({ where: { id: sourceReferral.id } });
            } else {
              await tx.referralTracking.update({
                where: { id: sourceReferral.id },
                data: { patientId: target.id },
              });
              recordsMoved++;
            }
          }

          // User account (one-to-one)
          const sourceUser = await tx.user.findFirst({ where: { patientId: source.id } });
          const targetUser = await tx.user.findFirst({ where: { patientId: target.id } });
          if (sourceUser) {
            if (targetUser) {
              await tx.user.update({ where: { id: sourceUser.id }, data: { patientId: null } });
            } else {
              await tx.user.update({ where: { id: sourceUser.id }, data: { patientId: target.id } });
              recordsMoved++;
            }
          }

          // ── Merge profile fields ────────────────────────────────

          // Build merged fields: target wins, source fills gaps
          const merged: Record<string, string | null> = {};
          for (const field of PHI_FIELDS) {
            const tVal = (target as any)[field] || '';
            const sVal = (source as any)[field] || '';
            const best = tVal.trim() || sVal.trim() || '';
            merged[field] = best ? encryptPHI(best) : '';
          }

          // Gender: target wins
          const mergedGender = target.gender || source.gender || 'Unknown';
          const mergedState = (target.state || source.state || '').toUpperCase();

          // Tags: union
          const sTags = Array.isArray(source.tags) ? (source.tags as string[]) : [];
          const tTags = Array.isArray(target.tags) ? (target.tags as string[]) : [];
          const mergedTags = [...new Set([...tTags, ...sTags, 'merged-duplicate'])];

          // Notes: concatenate
          let mergedNotes = target.notes || '';
          if (source.notes && source.notes !== target.notes) {
            mergedNotes = mergedNotes
              ? `${mergedNotes}\n\n--- Merged from ${source.patientId} ---\n${source.notes}`
              : source.notes;
          }

          // Stripe: keep target's, fallback to source
          const mergedStripe = target.stripeCustomerId || source.stripeCustomerId;
          const mergedLifefile = target.lifefileId || source.lifefileId;

          // Use earliest createdAt
          const earliestCreated =
            source.createdAt < target.createdAt ? source.createdAt : target.createdAt;

          // Search index
          const searchIndex = buildPatientSearchIndex({
            firstName: target.firstName || source.firstName,
            lastName: target.lastName || source.lastName,
            email: target.email || source.email,
            phone: target.phone || source.phone,
            patientId: target.patientId,
          });

          // ── Update target ───────────────────────────────────────

          await tx.patient.update({
            where: { id: target.id },
            data: {
              firstName: merged.firstName,
              lastName: merged.lastName,
              email: merged.email,
              phone: merged.phone,
              dob: merged.dob,
              address1: merged.address1,
              address2: merged.address2,
              city: merged.city,
              zip: merged.zip,
              gender: mergedGender,
              state: mergedState,
              tags: mergedTags as Prisma.InputJsonValue,
              notes: mergedNotes || null,
              stripeCustomerId: mergedStripe,
              lifefileId: mergedLifefile,
              createdAt: earliestCreated,
              searchIndex,
            },
          });

          // ── Audit entry ─────────────────────────────────────────

          await tx.patientAudit.create({
            data: {
              patientId: target.id,
              action: 'MERGE',
              actorEmail: 'system@eonpro.io',
              diff: {
                type: 'BULK_DUPLICATE_MERGE',
                batchId: BATCH_ID,
                sourcePatientId: source.id,
                sourcePatientNumber: source.patientId,
                targetPatientId: target.id,
                targetPatientNumber: target.patientId,
                recordsMoved,
                email: target.email,
                mergedAt: new Date().toISOString(),
              } as unknown as Prisma.InputJsonValue,
            },
          });

          // Move source's audit entries to target
          await tx.patientAudit.updateMany({
            where: { patientId: source.id },
            data: { patientId: target.id },
          });

          // ── Delete source ───────────────────────────────────────

          // Clear stripe/lifefile from source to avoid unique constraint on delete
          if (source.stripeCustomerId) {
            await tx.patient.update({
              where: { id: source.id },
              data: { stripeCustomerId: null, lifefileId: null },
            });
          }

          await tx.patient.delete({ where: { id: source.id } });

          return recordsMoved;
        },
        { isolationLevel: 'Serializable', timeout: 30000 }
      );

      totalMoved += moved;
    }

    return {
      email,
      targetId: target.id,
      targetPatientId: target.patientId,
      sourcesDeleted: sources.map((s) => s.id),
      recordsMoved: totalMoved,
      status: 'success',
    };
  } catch (err) {
    return {
      email,
      targetId: target.id,
      targetPatientId: target.patientId,
      sourcesDeleted: [],
      recordsMoved: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = !execute;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  WellMedR Duplicate Patient Merge');
  console.log(`  Mode: ${dryRun ? '🔍 DRY RUN' : '⚡ EXECUTE'}`);
  console.log(`  Batch ID: ${BATCH_ID}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Connect
  await prisma.$connect();
  const dbCheck = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
  console.log(`✓ Database connected: ${dbCheck[0]?.now}\n`);

  // Find clinic
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: WELLMEDR_CLINIC_SUBDOMAIN },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    console.error('❌ WellMedR clinic not found!');
    process.exit(1);
  }
  console.log(`✓ Clinic: ${clinic.name} (ID=${clinic.id})\n`);

  // Load duplicates
  const groups = await loadDuplicateGroups(clinic.id);
  console.log(`\n📊 Found ${groups.length} duplicate groups\n`);

  // Size distribution
  const sizeDist: Record<number, number> = {};
  for (const g of groups) {
    const size = g.sources.length + 1;
    sizeDist[size] = (sizeDist[size] || 0) + 1;
  }
  for (const [size, count] of Object.entries(sizeDist).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    console.log(`  ${size} profiles: ${count} groups`);
  }

  const totalToDelete = groups.reduce((sum, g) => sum + g.sources.length, 0);
  const totalRelationsToMove = groups.reduce((sum, g) => sum + g.totalRelationsToMove, 0);
  console.log(`\n  Total profiles to delete: ${totalToDelete}`);
  console.log(`  Total relations to re-point: ${totalRelationsToMove}`);

  if (dryRun) {
    // Show preview of first 15 groups
    console.log('\n━━━ Preview (first 15 groups) ━━━');
    for (const g of groups.slice(0, 15)) {
      console.log(
        `\n  ${g.email}:`
      );
      console.log(
        `    KEEP: ID=${g.target.id} (${g.target.patientId}) — ${g.target.firstName} ${g.target.lastName}, ${g.target.relationCount} relations, created ${g.target.createdAt.toISOString().slice(0, 10)}`
      );
      for (const s of g.sources) {
        console.log(
          `    DELETE: ID=${s.id} (${s.patientId}) — ${s.firstName} ${s.lastName}, ${s.relationCount} relations, created ${s.createdAt.toISOString().slice(0, 10)}`
        );
      }
    }

    console.log('\n\n📊 DRY RUN SUMMARY:');
    console.log(`  Duplicate groups: ${groups.length}`);
    console.log(`  Profiles to delete: ${totalToDelete}`);
    console.log(`  Relations to re-point: ${totalRelationsToMove}`);
    console.log('\n  Run with --execute to apply merges.');
  } else {
    // Execute
    console.log('\n━━━ Executing Merges ━━━\n');
    const results: MergeResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const result = await mergeGroup(g);
      results.push(result);

      if (result.status === 'success') {
        successCount++;
        if ((i + 1) % 25 === 0 || i === groups.length - 1) {
          console.log(
            `  [${i + 1}/${groups.length}] ✓ ${successCount} merged, ${errorCount} errors`
          );
        }
      } else {
        errorCount++;
        console.error(`  ❌ ${g.email}: ${result.error}`);
      }

      // Small delay between merges
      if (i < groups.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  MERGE COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Groups merged:     ${successCount}`);
    console.log(`  Profiles deleted:  ${results.filter((r) => r.status === 'success').reduce((s, r) => s + r.sourcesDeleted.length, 0)}`);
    console.log(`  Records re-pointed: ${results.reduce((s, r) => s + r.recordsMoved, 0)}`);
    console.log(`  Errors:            ${errorCount}`);

    if (errorCount > 0) {
      console.log('\n  Errors:');
      for (const r of results.filter((r) => r.status === 'error')) {
        console.log(`    ❌ ${r.email}: ${r.error}`);
      }
    }

    // Save report
    const report = {
      batchId: BATCH_ID,
      timestamp: new Date().toISOString(),
      clinicId: clinic.id,
      totalGroups: groups.length,
      success: successCount,
      errors: errorCount,
      profilesDeleted: results
        .filter((r) => r.status === 'success')
        .reduce((s, r) => s + r.sourcesDeleted.length, 0),
      recordsRepointed: results.reduce((s, r) => s + r.recordsMoved, 0),
      results: results.map((r) => ({
        email: r.email,
        targetId: r.targetId,
        targetPatientId: r.targetPatientId,
        sourcesDeleted: r.sourcesDeleted,
        recordsMoved: r.recordsMoved,
        status: r.status,
        error: r.error,
      })),
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${REPORT_PATH}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
