/**
 * Fix Misclassified Overtime Intake Treatment Types
 *
 * Re-evaluates weight_loss patients by re-running detectTreatmentType against
 * their stored intake document payload. With the expanded heuristics, NAD+ and
 * other misclassified patients will be correctly identified and fixed.
 *
 * Usage:
 *   npx tsx scripts/fix-misclassified-treatment.ts                   # Audit only (dry run)
 *   npx tsx scripts/fix-misclassified-treatment.ts --apply            # Apply all fixes
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { detectTreatmentType } from '../src/lib/overtime/treatmentTypes';

const prisma = new PrismaClient();

const OT_SUBDOMAIN = 'ot';

const TREATMENT_TYPE_LABELS: Record<string, string> = {
  weight_loss: 'Weight Loss',
  peptides: 'Peptides',
  nad_plus: 'NAD+',
  better_sex: 'Better Sex',
  testosterone: 'Testosterone Replacement',
  baseline_bloodwork: 'Baseline/Bloodwork',
};

const TREATMENT_TYPE_TAGS: Record<string, string[]> = {
  weight_loss: ['overtime', 'weight-loss', 'glp1'],
  peptides: ['overtime', 'peptides', 'performance'],
  nad_plus: ['overtime', 'nad-plus', 'wellness'],
  better_sex: ['overtime', 'sexual-health', 'mens-health'],
  testosterone: ['overtime', 'trt', 'hormone-therapy'],
  baseline_bloodwork: ['overtime', 'labs', 'baseline'],
};

interface SourceMetadata {
  type?: string;
  treatmentType?: string;
  treatmentLabel?: string;
  submissionId?: string;
  [key: string]: unknown;
}

interface ReclassifyResult {
  patientId: number;
  name: string;
  email: string;
  submissionId: string;
  oldTreatment: string;
  newTreatment: string;
  docId: number | null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const otClinic = await prisma.clinic.findFirst({
    where: { subdomain: OT_SUBDOMAIN },
  });

  if (!otClinic) {
    console.error('OT clinic not found');
    process.exit(1);
  }

  console.log(`OT Clinic: ID=${otClinic.id}`);
  console.log(`Mode: ${apply ? 'APPLY (will write to DB)' : 'DRY RUN (audit only)'}\n`);

  // Get all overtime-intake patients classified as weight_loss
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: otClinic.id,
      sourceMetadata: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      tags: true,
      sourceMetadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const weightLossSuspects = patients.filter((p) => {
    const meta = p.sourceMetadata as SourceMetadata | null;
    return meta?.type === 'overtime-intake' && meta?.treatmentType === 'weight_loss';
  });

  console.log(`Total overtime-intake patients: ${patients.filter((p) => (p.sourceMetadata as SourceMetadata)?.type === 'overtime-intake').length}`);
  console.log(`Weight loss patients to re-evaluate: ${weightLossSuspects.length}\n`);

  const reclassified: ReclassifyResult[] = [];
  const stillWeightLoss: number[] = [];
  const noDocument: number[] = [];
  const errors: Array<{ patientId: number; error: string }> = [];

  for (const patient of weightLossSuspects) {
    const meta = patient.sourceMetadata as SourceMetadata;
    const submissionId = meta.submissionId || '';

    // Get the intake document to access the raw payload fields
    const doc = await prisma.patientDocument.findFirst({
      where: {
        patientId: patient.id,
        source: 'overtime-intake',
      },
      select: { id: true, data: true, sourceSubmissionId: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!doc?.data) {
      noDocument.push(patient.id);
      continue;
    }

    try {
      const jsonStr = Buffer.from(doc.data).toString('utf-8');
      const intakeData = JSON.parse(jsonStr);

      // Reconstruct a flat payload from stored answers for detectTreatmentType.
      // Answer objects use { id, label, value, rawValue, section }.
      const flatPayload: Record<string, unknown> = {};

      if (intakeData.answers && Array.isArray(intakeData.answers)) {
        for (const a of intakeData.answers) {
          const key = a.id || a.question || a.label;
          const val = a.value ?? a.answer ?? a.rawValue;
          if (key && val !== undefined && val !== null && val !== '') {
            flatPayload[key] = val;
          }
        }
      }

      if (intakeData._debug?.payloadKeys && Array.isArray(intakeData._debug.payloadKeys)) {
        for (const key of intakeData._debug.payloadKeys) {
          if (!(key in flatPayload)) {
            flatPayload[key] = true;
          }
        }
      }

      if (Object.keys(flatPayload).length === 0) {
        noDocument.push(patient.id);
        continue;
      }

      // Re-run detection with improved heuristics (no explicit treatmentType to force heuristic path)
      const redetected = detectTreatmentType(flatPayload);

      if (redetected !== 'weight_loss') {
        reclassified.push({
          patientId: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
          email: patient.email,
          submissionId,
          oldTreatment: 'weight_loss',
          newTreatment: redetected,
          docId: doc.id,
        });
      } else {
        stillWeightLoss.push(patient.id);
      }
    } catch (err) {
      errors.push({
        patientId: patient.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Report results
  const reclassCounts: Record<string, number> = {};
  for (const r of reclassified) {
    reclassCounts[r.newTreatment] = (reclassCounts[r.newTreatment] || 0) + 1;
  }

  console.log('='.repeat(60));
  console.log('RE-EVALUATION RESULTS');
  console.log('='.repeat(60));
  console.log(`  Should be reclassified: ${reclassified.length}`);
  for (const [tt, count] of Object.entries(reclassCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    → ${tt} (${TREATMENT_TYPE_LABELS[tt]}): ${count}`);
  }
  console.log(`  Confirmed weight_loss:  ${stillWeightLoss.length}`);
  console.log(`  No document/data:       ${noDocument.length}`);
  console.log(`  Errors:                 ${errors.length}`);

  if (reclassified.length > 0) {
    console.log(`\n--- Patients to reclassify ---\n`);
    for (const r of reclassified) {
      console.log(`  #${r.patientId} | ${r.name} | ${r.email}`);
      console.log(`    ${r.oldTreatment} → ${r.newTreatment} (${TREATMENT_TYPE_LABELS[r.newTreatment]})`);
      console.log(`    submissionId: ${r.submissionId}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n--- Errors ---\n`);
    for (const e of errors) {
      console.log(`  Patient #${e.patientId}: ${e.error}`);
    }
  }

  // Apply fixes if --apply
  if (apply && reclassified.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`APPLYING ${reclassified.length} FIXES...`);
    console.log('='.repeat(60));

    let fixed = 0;
    let failed = 0;

    for (const r of reclassified) {
      try {
        const newLabel = TREATMENT_TYPE_LABELS[r.newTreatment];
        const newTags = TREATMENT_TYPE_TAGS[r.newTreatment];

        // Get current sourceMetadata
        const current = await prisma.patient.findUnique({
          where: { id: r.patientId },
          select: { sourceMetadata: true },
        });

        const currentMeta = current?.sourceMetadata as SourceMetadata | null;
        const updatedMeta: SourceMetadata = {
          ...(currentMeta || {}),
          treatmentType: r.newTreatment,
          treatmentLabel: newLabel,
          _reclassifiedFrom: currentMeta?.treatmentType,
          _reclassifiedAt: new Date().toISOString(),
        };

        // Update patient
        await prisma.patient.update({
          where: { id: r.patientId },
          data: {
            sourceMetadata: updatedMeta as any,
            tags: newTags,
          },
        });

        // Update document intake data
        if (r.docId) {
          const doc = await prisma.patientDocument.findUnique({
            where: { id: r.docId },
            select: { data: true },
          });

          if (doc?.data) {
            const jsonStr = Buffer.from(doc.data).toString('utf-8');
            const intakeData = JSON.parse(jsonStr);
            intakeData.treatmentType = r.newTreatment;
            intakeData.treatmentLabel = newLabel;
            intakeData._reclassifiedFrom = 'weight_loss';
            intakeData._reclassifiedAt = new Date().toISOString();

            const updatedBuffer = Buffer.from(JSON.stringify(intakeData));
            await prisma.patientDocument.update({
              where: { id: r.docId },
              data: { data: new Uint8Array(updatedBuffer) },
            });
          }
        }

        fixed++;
        if (fixed % 50 === 0) {
          console.log(`  ... ${fixed}/${reclassified.length} fixed`);
        }
      } catch (err) {
        failed++;
        console.error(`  ❌ Patient #${r.patientId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`\n  ✅ Fixed: ${fixed}`);
    if (failed > 0) console.log(`  ❌ Failed: ${failed}`);
  } else if (!apply && reclassified.length > 0) {
    console.log(`\n→ Run with --apply to fix these ${reclassified.length} patients.`);
  }

  console.log('\nDone.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
