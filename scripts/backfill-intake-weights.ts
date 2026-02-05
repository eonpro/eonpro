/**
 * Backfill Weight Logs from Intake Data
 * 
 * This script finds all patients with intake documents that contain weight data
 * and creates PatientWeightLog entries for them (if they don't already have one).
 * 
 * Usage:
 *   npx ts-node scripts/backfill-intake-weights.ts
 *   npx ts-node scripts/backfill-intake-weights.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BackfillResult {
  patientId: number;
  patientName: string;
  weight: number;
  source: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
}

const WEIGHT_LABELS = [
  'starting weight',
  'current weight', 
  'weight (lbs)',
  'weight',
  'your weight',
  'body weight',
];

function isWeightLabel(label: string): boolean {
  const normalizedLabel = label.toLowerCase().trim();
  return WEIGHT_LABELS.some(wl => normalizedLabel.includes(wl));
}

function parseWeight(value: string | any): number | null {
  if (!value) return null;
  const strValue = String(value).trim();
  if (!strValue) return null;
  
  const numericValue = parseFloat(strValue.replace(/[^0-9.]/g, ''));
  
  if (isNaN(numericValue) || numericValue < 10 || numericValue > 1000) {
    return null;
  }
  
  return numericValue;
}

function extractWeightFromIntakeData(data: any): number | null {
  if (!data || typeof data !== 'object') return null;

  // Check sections array
  if (data.sections && Array.isArray(data.sections)) {
    for (const section of data.sections) {
      if (section.entries && Array.isArray(section.entries)) {
        for (const entry of section.entries) {
          if (isWeightLabel(entry.label || '')) {
            const weight = parseWeight(entry.value);
            if (weight) return weight;
          }
        }
      }
    }
  }

  // Check answers array
  if (data.answers && Array.isArray(data.answers)) {
    for (const answer of data.answers) {
      if (isWeightLabel(answer.label || '')) {
        const weight = parseWeight(answer.value);
        if (weight) return weight;
      }
    }
  }

  // Check flat key-value pairs
  for (const label of WEIGHT_LABELS) {
    const searchKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedKey.includes(searchKey) && value) {
        const weight = parseWeight(value);
        if (weight) return weight;
      }
    }
  }

  return null;
}

async function backfillIntakeWeights(dryRun: boolean = false): Promise<BackfillResult[]> {
  const results: BackfillResult[] = [];
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Backfill Intake Weights ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  // Find all patients with intake documents
  const patients = await prisma.patient.findMany({
    include: {
      documents: {
        where: { category: 'MEDICAL_INTAKE_FORM' },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      weightLogs: {
        take: 1,
        orderBy: { recordedAt: 'asc' },
      },
    },
  });

  console.log(`Found ${patients.length} patients to process\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const patient of patients) {
    const patientName = `${patient.firstName} ${patient.lastName}`;
    const result: BackfillResult = {
      patientId: patient.id,
      patientName,
      weight: 0,
      source: 'intake',
      status: 'skipped',
    };

    try {
      // Skip if patient already has weight logs
      if (patient.weightLogs.length > 0) {
        result.status = 'skipped';
        result.reason = 'Already has weight logs';
        results.push(result);
        skipped++;
        continue;
      }

      // Skip if no intake document
      const doc = patient.documents[0];
      if (!doc?.data) {
        result.status = 'skipped';
        result.reason = 'No intake document';
        results.push(result);
        skipped++;
        continue;
      }

      // Parse document data
      let parsedData = null;
      if (Buffer.isBuffer(doc.data)) {
        try {
          const jsonStr = (doc.data as Buffer).toString('utf-8');
          parsedData = JSON.parse(jsonStr);
        } catch {
          // Ignore parse errors
        }
      } else if (typeof doc.data === 'object' && (doc.data as any).type === 'Buffer' && Array.isArray((doc.data as any).data)) {
        try {
          const jsonStr = Buffer.from((doc.data as any).data).toString('utf-8');
          parsedData = JSON.parse(jsonStr);
        } catch {
          // Ignore parse errors
        }
      } else if (typeof doc.data === 'object') {
        parsedData = doc.data;
      }

      if (!parsedData) {
        result.status = 'skipped';
        result.reason = 'Could not parse intake data';
        results.push(result);
        skipped++;
        continue;
      }

      // Extract weight
      const weight = extractWeightFromIntakeData(parsedData);
      if (!weight) {
        result.status = 'skipped';
        result.reason = 'No weight found in intake';
        results.push(result);
        skipped++;
        continue;
      }

      result.weight = weight;

      // Create weight log
      if (!dryRun) {
        await prisma.patientWeightLog.create({
          data: {
            patientId: patient.id,
            weight,
            unit: 'lbs',
            notes: 'Initial weight from intake form (backfill)',
            source: 'intake',
            recordedAt: doc.createdAt,
          },
        });
      }

      result.status = 'created';
      results.push(result);
      created++;
      console.log(`✓ Patient ${patient.id} (${patientName}): ${weight} lbs`);

    } catch (error) {
      result.status = 'error';
      result.reason = error instanceof Error ? error.message : 'Unknown error';
      results.push(result);
      errors++;
      console.error(`✗ Patient ${patient.id} (${patientName}): ${result.reason}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
  console.log(`Total:   ${patients.length}`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    await backfillIntakeWeights(dryRun);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
