/**
 * Backfill script: Create MEDICAL_INTAKE_FORM documents for IntakeQ-imported patients.
 *
 * The initial IntakeQ migration stored height, startingWeight, and BMI in
 * each patient's `sourceMetadata` JSON. However, no PatientDocument was
 * created, so those values don't show up on the Intake tab in the UI.
 *
 * This script:
 *  1. Finds all IntakeQ-imported patients (sourceMetadata.importSource = 'intakeq')
 *  2. For each patient that has height/startingWeight/bmi in sourceMetadata:
 *     a. Checks if they already have a MEDICAL_INTAKE_FORM document
 *     b. If yes → merges the new answers into the existing document
 *     c. If no  → creates a new document with the intake answers
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill-intakeq-intake-documents.ts   # preview
 *   npx tsx scripts/backfill-intakeq-intake-documents.ts                 # execute
 *
 * For production, load env vars first:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-intakeq-intake-documents.ts
 */

import { PrismaClient, Prisma, PatientDocumentCategory } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';

// EonMeds clinic ID (production)
const EONMEDS_CLINIC_ID = 3;

interface IntakeAnswer {
  id: string;
  label: string;
  value: string;
}

interface IntakeDocumentData {
  submissionId: string;
  sections: any[];
  answers: IntakeAnswer[];
  source: string;
  clinicId: number;
  receivedAt: string;
  importNote: string;
}

async function main() {
  console.log('='.repeat(70));
  console.log('BACKFILL: IntakeQ → Intake Documents (Height/Weight/BMI)');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 LIVE EXECUTION'}`);
  console.log('='.repeat(70));

  // Step 1: Find all IntakeQ-imported patients
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: EONMEDS_CLINIC_ID,
      source: 'import',
      sourceMetadata: {
        path: ['importSource'],
        equals: 'intakeq',
      },
    },
    select: {
      id: true,
      patientId: true,
      sourceMetadata: true,
      notes: true,
    },
  });

  console.log(`\nFound ${patients.length} IntakeQ-imported patients.`);

  // Step 2: Check which already have intake documents
  const existingDocs = await prisma.patientDocument.findMany({
    where: {
      patientId: { in: patients.map((p) => p.id) },
      clinicId: EONMEDS_CLINIC_ID,
      category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
    },
    select: {
      id: true,
      patientId: true,
      data: true,
      sourceSubmissionId: true,
    },
  });

  const existingDocMap = new Map<number, (typeof existingDocs)[0]>();
  for (const doc of existingDocs) {
    existingDocMap.set(doc.patientId, doc);
  }

  console.log(`${existingDocs.length} patients already have intake documents.`);

  // Step 3: Process each patient
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let noData = 0;
  const errors: Array<{ patientId: number; error: string }> = [];

  for (const patient of patients) {
    const meta = patient.sourceMetadata as Record<string, unknown> | null;
    if (!meta) {
      noData++;
      continue;
    }

    const height = typeof meta.height === 'string' ? meta.height.trim() : '';
    const startingWeight = typeof meta.startingWeight === 'string' ? meta.startingWeight.trim() : '';
    const bmi = typeof meta.bmi === 'string' ? meta.bmi.trim() : '';
    const intakeqClientId = typeof meta.intakeqClientId === 'string' ? meta.intakeqClientId : '';
    const intakeqCreatedAt = typeof meta.intakeqCreatedAt === 'string' ? meta.intakeqCreatedAt : '';

    // Skip if no physical measurement data
    if (!height && !startingWeight && !bmi) {
      noData++;
      continue;
    }

    // Build answers array
    const answers: IntakeAnswer[] = [];
    if (startingWeight) {
      answers.push({ id: 'weight', label: 'Starting Weight', value: startingWeight });
    }
    if (height) {
      answers.push({ id: 'height', label: 'Height', value: height });
    }
    if (bmi) {
      answers.push({ id: 'bmi', label: 'BMI', value: bmi });
    }

    // Also add notes from the patient record as intakeNotes if present
    if (patient.notes && patient.notes.trim()) {
      answers.push({ id: 'intakeNotes', label: 'Intake Notes', value: patient.notes.trim() });
    }

    const existingDoc = existingDocMap.get(patient.id);

    try {
      if (existingDoc) {
        // Merge answers into existing document
        let existingData: any = {};
        if (existingDoc.data) {
          let rawData: any = existingDoc.data;
          if (rawData instanceof Uint8Array) {
            rawData = Buffer.from(rawData).toString('utf8');
          } else if (Buffer.isBuffer(rawData)) {
            rawData = rawData.toString('utf8');
          }
          if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{')) {
              existingData = JSON.parse(trimmed);
            }
          }
        }

        // Merge: existing answers take priority (don't overwrite real intake data)
        const existingAnswers: IntakeAnswer[] = existingData.answers || [];
        const existingAnswerIds = new Set(existingAnswers.map((a: IntakeAnswer) => a.id));

        // Only add answers that don't already exist
        let newAnswersAdded = 0;
        for (const answer of answers) {
          if (!existingAnswerIds.has(answer.id)) {
            existingAnswers.push(answer);
            newAnswersAdded++;
          }
        }

        if (newAnswersAdded === 0) {
          skipped++;
          continue;
        }

        existingData.answers = existingAnswers;
        const updatedBuffer = Buffer.from(JSON.stringify(existingData), 'utf8');

        if (!DRY_RUN) {
          await prisma.patientDocument.update({
            where: { id: existingDoc.id },
            data: { data: updatedBuffer },
          });
        }
        merged++;
      } else {
        // Create new intake document
        const docData: IntakeDocumentData = {
          submissionId: `intakeq-import-${intakeqClientId || patient.id}`,
          sections: [],
          answers,
          source: 'intakeq-import',
          clinicId: EONMEDS_CLINIC_ID,
          receivedAt: intakeqCreatedAt || new Date().toISOString(),
          importNote: 'Auto-generated from IntakeQ migration data',
        };

        const dataBuffer = Buffer.from(JSON.stringify(docData), 'utf8');

        if (!DRY_RUN) {
          await prisma.patientDocument.create({
            data: {
              patientId: patient.id,
              clinicId: EONMEDS_CLINIC_ID,
              filename: `intake-intakeq-import-${patient.id}.json`,
              mimeType: 'application/json',
              category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
              data: dataBuffer,
              source: 'intakeq-import',
              sourceSubmissionId: `intakeq-import-${intakeqClientId || patient.id}`,
            },
          });
        }
        created++;
      }
    } catch (err: any) {
      errors.push({
        patientId: patient.id,
        error: err.message || String(err),
      });
    }
  }

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));
  console.log(`Total IntakeQ patients:          ${patients.length}`);
  console.log(`No height/weight/BMI data:       ${noData}`);
  console.log(`New intake docs created:         ${created}`);
  console.log(`Existing intake docs merged:     ${merged}`);
  console.log(`Skipped (already had all data):  ${skipped}`);
  console.log(`Errors:                          ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors) {
      console.log(`  Patient ${err.patientId}: ${err.error}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes made. Run without DRY_RUN=true to execute.');
  } else {
    console.log('\n✅ Backfill complete.');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
