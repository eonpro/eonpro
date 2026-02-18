#!/usr/bin/env tsx
/**
 * WellMedR Intake CSV Import Script
 * ===================================
 *
 * Imports all intake submissions from the WellMedR Airtable Onboarding CSV export
 * into EONPRO. Handles:
 *   - CSV parsing with deduplication (latest submission per email wins)
 *   - Patient matching against existing DB records (decrypted PHI comparison)
 *   - Patient creation for new patients
 *   - PatientDocument creation (MEDICAL_INTAKE_FORM) for intake data display
 *   - Duplicate profile detection and reporting
 *
 * Usage:
 *   # Dry run (default) — generates report, writes nothing
 *   npx tsx scripts/import-wellmedr-intakes.ts
 *
 *   # Execute the import
 *   npx tsx scripts/import-wellmedr-intakes.ts --execute
 *
 *   # Only process rows missing from DB (skip already-imported patients)
 *   npx tsx scripts/import-wellmedr-intakes.ts --execute --missing-only
 *
 * For production, load env vars first:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/import-wellmedr-intakes.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { encryptPHI, decryptPHI } from '../src/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '../src/lib/utils/search';
import { normalizeWellmedrPayload } from '../src/lib/wellmedr/intakeNormalizer';
import { generatePatientId } from '../src/lib/patients';

// ============================================================================
// Configuration
// ============================================================================

const CSV_PATH = path.resolve(__dirname, 'data/wellmedr-onboarding-export.csv');
const REPORT_PATH = path.resolve(__dirname, 'data/wellmedr-import-report.json');
const BATCH_SIZE = 25;
const IMPORT_BATCH_ID = `wellmedr-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

// Test emails/domains to skip
const TEST_PATTERNS = [
  'emregnd.com',
  'test@',
  'test+',
  '+test@',
  'example.com',
  'eonpro.io',
  'placeholder',
  'noemail',
  'fake@',
  'demo@',
];

// ============================================================================
// Types
// ============================================================================

interface CSVRow {
  'submission-id': string;
  'Created': string;
  'state': string;
  'email': string;
  'phone': string;
  'first-name': string;
  'last-name': string;
  [key: string]: string;
}

interface DeduplicatedRecord {
  latestRow: CSVRow;
  submissionCount: number;
  allSubmissionIds: string[];
}

interface ImportResult {
  email: string;
  firstName: string;
  lastName: string;
  action: 'created' | 'updated' | 'skipped' | 'doc-created' | 'error';
  patientId?: string;
  dbId?: number;
  documentCreated: boolean;
  error?: string;
}

interface ImportReport {
  batchId: string;
  csvPath: string;
  timestamp: string;
  totalCSVRows: number;
  afterDedup: number;
  testRecordsSkipped: number;
  emptyRecordsSkipped: number;
  readyForImport: number;
  results: {
    created: number;
    updated: number;
    skipped: number;
    documentsCreated: number;
    errors: number;
  };
  duplicateDBProfiles: { email: string; dbIds: number[]; patientIds: string[] }[];
  errors: { email: string; error: string }[];
}

// ============================================================================
// Prisma Client (direct connection, not the app's singleton)
// ============================================================================

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

// ============================================================================
// Phase 1: CSV Parsing
// ============================================================================

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(csvPath: string): CSVRow[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    throw new Error('CSV file has no data rows');
  }

  // Parse header, strip BOM
  const rawHeader = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(rawHeader);

  console.log(`📋 CSV headers (${headers.length}):`, headers.slice(0, 10).join(', '), '...');

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue; // skip empty lines

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row as CSVRow);
  }

  return rows;
}

// ============================================================================
// Phase 2: Deduplication & Filtering
// ============================================================================

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);

  // Handle "2/17/2026 11:32am" format
  const match = dateStr.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)?/i
  );
  if (match) {
    const [, month, day, year, hours, minutes, ampm] = match;
    let h = parseInt(hours, 10);
    if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm?.toLowerCase() === 'am' && h === 12) h = 0;
    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      h,
      parseInt(minutes, 10)
    );
  }

  return new Date(dateStr);
}

function isTestRecord(row: CSVRow): boolean {
  const email = (row.email || '').toLowerCase();
  if (!email) return false;
  return TEST_PATTERNS.some((p) => email.includes(p));
}

function deduplicateByEmail(rows: CSVRow[]): {
  records: DeduplicatedRecord[];
  testSkipped: number;
  emptySkipped: number;
} {
  let testSkipped = 0;
  let emptySkipped = 0;

  // Group by email
  const emailGroups = new Map<string, CSVRow[]>();

  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    if (!email) {
      emptySkipped++;
      continue;
    }
    if (isTestRecord(row)) {
      testSkipped++;
      continue;
    }

    if (!emailGroups.has(email)) {
      emailGroups.set(email, []);
    }
    emailGroups.get(email)!.push(row);
  }

  // For each email group, pick the latest submission
  const records: DeduplicatedRecord[] = [];
  for (const [email, group] of emailGroups) {
    // Sort by Created date descending
    group.sort((a, b) => parseDate(b.Created).getTime() - parseDate(a.Created).getTime());

    records.push({
      latestRow: group[0],
      submissionCount: group.length,
      allSubmissionIds: group.map((r) => r['submission-id']).filter(Boolean),
    });
  }

  return { records, testSkipped, emptySkipped };
}

// ============================================================================
// Phase 3: Patient Matching (decrypted PHI comparison)
// ============================================================================

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

interface DecryptedPatientCache {
  id: number;
  patientId: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dob: string;
  createdAt: Date;
}

async function loadAllWellmedrPatients(
  clinicId: number
): Promise<DecryptedPatientCache[]> {
  console.log('🔍 Loading all existing WellMedR patients from DB...');
  const patients = await prisma.patient.findMany({
    where: { clinicId },
    select: {
      id: true,
      patientId: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      dob: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`  Found ${patients.length} patients in DB. Decrypting PHI...`);

  const decrypted: DecryptedPatientCache[] = patients.map((p) => ({
    id: p.id,
    patientId: p.patientId,
    email: (safeDecrypt(p.email) || '').toLowerCase().trim(),
    phone: (safeDecrypt(p.phone) || '').replace(/\D/g, ''),
    firstName: (safeDecrypt(p.firstName) || '').toLowerCase().trim(),
    lastName: (safeDecrypt(p.lastName) || '').toLowerCase().trim(),
    dob: safeDecrypt(p.dob) || '',
    createdAt: p.createdAt,
  }));

  console.log(`  ✓ Decrypted ${decrypted.length} patient records`);
  return decrypted;
}

function findMatchingPatient(
  email: string,
  phone: string,
  firstName: string,
  lastName: string,
  dob: string,
  cache: DecryptedPatientCache[]
): DecryptedPatientCache | null {
  const searchEmail = email.toLowerCase().trim();
  const searchPhone = phone.replace(/\D/g, '');
  const searchFirst = firstName.toLowerCase().trim();
  const searchLast = lastName.toLowerCase().trim();

  for (const p of cache) {
    // Match by email (strongest)
    if (
      searchEmail &&
      searchEmail !== 'unknown@example.com' &&
      p.email === searchEmail
    ) {
      return p;
    }

    // Match by phone
    if (
      searchPhone &&
      searchPhone !== '0000000000' &&
      searchPhone.length >= 10 &&
      p.phone === searchPhone
    ) {
      return p;
    }

    // Match by name + DOB
    if (
      searchFirst &&
      searchFirst !== 'unknown' &&
      searchLast &&
      searchLast !== 'unknown' &&
      dob &&
      dob !== '1900-01-01' &&
      p.firstName === searchFirst &&
      p.lastName === searchLast &&
      p.dob === dob
    ) {
      return p;
    }
  }

  return null;
}

// ============================================================================
// Phase 4: Detect Duplicate DB Profiles
// ============================================================================

function detectDuplicateDBProfiles(
  cache: DecryptedPatientCache[]
): Map<string, DecryptedPatientCache[]> {
  const emailMap = new Map<string, DecryptedPatientCache[]>();

  for (const p of cache) {
    if (!p.email || p.email === 'unknown@example.com') continue;
    if (!emailMap.has(p.email)) {
      emailMap.set(p.email, []);
    }
    emailMap.get(p.email)!.push(p);
  }

  // Only return groups with duplicates
  const duplicates = new Map<string, DecryptedPatientCache[]>();
  for (const [email, patients] of emailMap) {
    if (patients.length > 1) {
      duplicates.set(email, patients);
    }
  }

  return duplicates;
}

// ============================================================================
// Phase 5: Normalize & prepare patient data
// ============================================================================

function sanitizePhone(value?: string): string {
  if (!value) return '0000000000';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits || '0000000000';
}

function capitalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function normalizeDate(dob: string): string {
  if (!dob) return '1900-01-01';
  const trimmed = dob.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // MM/DD/YYYY or MM-DD-YYYY
  const match = trimmed.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  return '1900-01-01';
}

function normalizeGender(gender: string): string {
  if (!gender) return 'Unknown';
  const lower = gender.trim().toLowerCase();
  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'Female';
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'Male';
  if (lower.startsWith('f') || lower.startsWith('w')) return 'Female';
  if (lower.startsWith('m')) return 'Male';
  return gender;
}

function buildPatientData(row: CSVRow) {
  return {
    firstName: encryptPHI(capitalize(row['first-name'] || 'Unknown')) || 'Unknown',
    lastName: encryptPHI(capitalize(row['last-name'] || 'Unknown')) || 'Unknown',
    email: encryptPHI((row.email || 'unknown@example.com').toLowerCase().trim()) || '',
    phone: encryptPHI(sanitizePhone(row.phone)) || '',
    dob: encryptPHI(normalizeDate(row.dob)) || '1900-01-01',
    gender: normalizeGender(row.sex || ''),
    address1: '',
    address2: '',
    city: '',
    state: (row.state || '').toUpperCase().trim(),
    zip: '',
  };
}

// ============================================================================
// Phase 6: Build Intake Document Data
// ============================================================================

function buildIntakeDocumentData(
  row: CSVRow,
  patientId: number,
  clinicId: number
): {
  data: Buffer;
  filename: string;
  sourceSubmissionId: string;
} {
  // Use the Wellmedr normalizer for full intake data
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value && value.trim()) {
      payload[key] = value;
    }
  }

  const normalized = normalizeWellmedrPayload(payload);

  const intakeDataToStore = {
    submissionId: normalized.submissionId,
    sections: normalized.sections,
    answers: normalized.answers,
    source: 'wellmedr-intake-csv-import',
    intakeUrl: 'https://intake.wellmedr.com',
    clinicId,
    receivedAt: new Date().toISOString(),
    pdfGenerated: false,
    pdfUrl: null,
    checkoutCompleted: false,
    glp1History: {
      usedLast30Days: row['glp1-last-30'] || null,
      medicationType: row['glp1-last-30-medication-type'] || null,
      doseMg: row['glp1-last-30-medication-dose-mg'] || null,
    },
    contraindications: {
      men2History: row['men2-history'] || null,
      bariatric: row['bariatric'] || null,
    },
    hipaaAgreement: row['hipaa-agreement'] || null,
    importedFrom: 'csv-bulk-import',
    importBatchId: IMPORT_BATCH_ID,
  };

  const jsonString = JSON.stringify(intakeDataToStore, null, 2);
  const dataBuffer = Buffer.from(jsonString, 'utf-8');

  const submissionId =
    row['submission-id'] || `csv-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    data: dataBuffer,
    filename: `wellmedr-intake-${submissionId}.json`,
    sourceSubmissionId: submissionId,
  };
}

// ============================================================================
// Phase 7: Import Execution
// ============================================================================

async function importPatient(
  record: DeduplicatedRecord,
  clinicId: number,
  patientCache: DecryptedPatientCache[],
  dryRun: boolean,
  missingOnly: boolean
): Promise<ImportResult> {
  const row = record.latestRow;
  const email = (row.email || '').trim().toLowerCase();
  const firstName = capitalize(row['first-name'] || 'Unknown');
  const lastName = capitalize(row['last-name'] || 'Unknown');
  const phone = sanitizePhone(row.phone);
  const dob = normalizeDate(row.dob);

  const result: ImportResult = {
    email,
    firstName,
    lastName,
    action: 'skipped',
    documentCreated: false,
  };

  try {
    // Find existing patient
    const existing = findMatchingPatient(
      email,
      phone,
      firstName,
      lastName,
      dob,
      patientCache
    );

    if (existing) {
      result.patientId = existing.patientId;
      result.dbId = existing.id;

      // Check if they already have an intake document
      const existingDoc = await prisma.patientDocument.findFirst({
        where: {
          patientId: existing.id,
          category: 'MEDICAL_INTAKE_FORM',
        },
        select: { id: true },
      });

      if (existingDoc) {
        if (missingOnly) {
          result.action = 'skipped';
          return result;
        }
        // Update the existing document
        if (!dryRun) {
          const docData = buildIntakeDocumentData(row, existing.id, clinicId);
          await prisma.patientDocument.update({
            where: { id: existingDoc.id },
            data: {
              data: docData.data,
              filename: docData.filename,
            },
          });
          result.documentCreated = true;
        }
        result.action = 'updated';
      } else {
        // Create new document for existing patient
        if (!dryRun) {
          const docData = buildIntakeDocumentData(row, existing.id, clinicId);
          await prisma.patientDocument.create({
            data: {
              patientId: existing.id,
              clinicId,
              filename: docData.filename,
              mimeType: 'application/json',
              category: 'MEDICAL_INTAKE_FORM',
              data: docData.data,
              source: 'wellmedr-intake-csv-import',
              sourceSubmissionId: docData.sourceSubmissionId,
            },
          });
          result.documentCreated = true;
        }
        result.action = 'doc-created';
      }

      // Update patient data if fields are more complete
      if (!dryRun) {
        const patientData = buildPatientData(row);
        const searchIndex = buildPatientSearchIndex({
          firstName,
          lastName,
          email,
          phone,
          patientId: existing.patientId,
        });
        await prisma.patient.update({
          where: { id: existing.id },
          data: {
            ...patientData,
            searchIndex,
          },
        });
      }
    } else {
      // Create new patient
      if (!dryRun) {
        const patientData = buildPatientData(row);
        const patientNumber = await generatePatientId(clinicId);
        const searchIndex = buildPatientSearchIndex({
          firstName,
          lastName,
          email,
          phone,
          patientId: patientNumber,
        });

        const newPatient = await prisma.patient.create({
          data: {
            ...patientData,
            patientId: patientNumber,
            clinicId,
            tags: ['wellmedr-intake', 'wellmedr', 'glp1', 'csv-import'],
            notes: `Imported from Airtable CSV (${IMPORT_BATCH_ID})\nSubmission: ${row['submission-id'] || 'N/A'}\nCreated: ${row.Created || 'N/A'}`,
            source: 'csv-import',
            sourceMetadata: {
              type: 'wellmedr-intake-csv-import',
              submissionId: row['submission-id'],
              batchId: IMPORT_BATCH_ID,
              originalCreatedDate: row.Created,
              submissionCount: record.submissionCount,
            },
            searchIndex,
            profileStatus: 'ACTIVE',
          },
        });

        result.dbId = newPatient.id;
        result.patientId = patientNumber;

        // Create intake document
        const docData = buildIntakeDocumentData(row, newPatient.id, clinicId);
        await prisma.patientDocument.create({
          data: {
            patientId: newPatient.id,
            clinicId,
            filename: docData.filename,
            mimeType: 'application/json',
            category: 'MEDICAL_INTAKE_FORM',
            data: docData.data,
            source: 'wellmedr-intake-csv-import',
            sourceSubmissionId: docData.sourceSubmissionId,
          },
        });
        result.documentCreated = true;

        // Add to cache so subsequent records can match against it
        patientCache.push({
          id: newPatient.id,
          patientId: patientNumber,
          email: email,
          phone: phone,
          firstName: firstName.toLowerCase().trim(),
          lastName: lastName.toLowerCase().trim(),
          dob,
          createdAt: new Date(),
        });
      }

      result.action = 'created';
    }
  } catch (err) {
    result.action = 'error';
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const missingOnly = args.includes('--missing-only');
  const dryRun = !execute;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  WellMedR Intake CSV Import');
  console.log(`  Mode: ${dryRun ? '🔍 DRY RUN (no writes)' : '⚡ EXECUTE (writing to DB)'}`);
  if (missingOnly) console.log('  Filter: --missing-only (skip patients with existing docs)');
  console.log(`  Batch ID: ${IMPORT_BATCH_ID}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  // Verify DB connection
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
    console.log(`✓ Database connected: ${result[0]?.now}`);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  // Find WellMedR clinic
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: WELLMEDR_CLINIC_SUBDOMAIN },
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true, patientIdPrefix: true },
  });

  if (!clinic) {
    console.error('❌ WellMedR clinic not found in database!');
    process.exit(1);
  }

  const clinicId = clinic.id;
  console.log(
    `✓ Clinic: ${clinic.name} (ID=${clinicId}, subdomain=${clinic.subdomain}, prefix=${clinic.patientIdPrefix})`
  );
  console.log();

  // Phase 1: Parse CSV
  console.log('━━━ Phase 1: Parse CSV ━━━');
  const rows = parseCSV(CSV_PATH);
  console.log(`  Parsed ${rows.length} rows`);

  // Phase 2: Deduplicate
  console.log('\n━━━ Phase 2: Deduplicate & Filter ━━━');
  const { records, testSkipped, emptySkipped } = deduplicateByEmail(rows);
  const duplicateSubmissions = records.filter((r) => r.submissionCount > 1);
  console.log(`  Test records skipped: ${testSkipped}`);
  console.log(`  Empty email skipped: ${emptySkipped}`);
  console.log(`  Unique patients (after dedup): ${records.length}`);
  console.log(
    `  Patients with multiple submissions: ${duplicateSubmissions.length} (using latest)`
  );

  // Phase 3: Load existing patients
  console.log('\n━━━ Phase 3: Load Existing Patients ━━━');
  const patientCache = await loadAllWellmedrPatients(clinicId);

  // Phase 4: Detect duplicate DB profiles
  console.log('\n━━━ Phase 4: Detect Duplicate DB Profiles ━━━');
  const dbDuplicates = detectDuplicateDBProfiles(patientCache);
  console.log(`  Duplicate email groups in DB: ${dbDuplicates.size}`);
  if (dbDuplicates.size > 0) {
    let shown = 0;
    for (const [email, patients] of dbDuplicates) {
      if (shown++ >= 5) {
        console.log(`  ... and ${dbDuplicates.size - 5} more`);
        break;
      }
      console.log(
        `    ${email}: ${patients.length} profiles (IDs: ${patients.map((p) => p.id).join(', ')})`
      );
    }
  }

  // Phase 5: Preview matching
  console.log('\n━━━ Phase 5: Match Against Existing Patients ━━━');
  let matchCount = 0;
  let newCount = 0;
  let withDocCount = 0;
  let missingDocCount = 0;

  for (const record of records) {
    const row = record.latestRow;
    const email = (row.email || '').trim().toLowerCase();
    const phone = sanitizePhone(row.phone);
    const firstName = capitalize(row['first-name'] || 'Unknown');
    const lastName = capitalize(row['last-name'] || 'Unknown');
    const dob = normalizeDate(row.dob);

    const match = findMatchingPatient(email, phone, firstName, lastName, dob, patientCache);
    if (match) {
      matchCount++;
      const doc = await prisma.patientDocument.findFirst({
        where: { patientId: match.id, category: 'MEDICAL_INTAKE_FORM' },
        select: { id: true },
      });
      if (doc) {
        withDocCount++;
      } else {
        missingDocCount++;
      }
    } else {
      newCount++;
    }
  }

  console.log(`  Matched to existing patient: ${matchCount}`);
  console.log(`    - Already have intake doc: ${withDocCount}`);
  console.log(`    - Missing intake doc: ${missingDocCount}`);
  console.log(`  New patients to create: ${newCount}`);

  // Phase 6: Execute import
  console.log(`\n━━━ Phase 6: ${dryRun ? 'DRY RUN Summary' : 'Execute Import'} ━━━`);

  if (dryRun) {
    console.log('\n📊 DRY RUN SUMMARY:');
    console.log(`  Total CSV rows: ${rows.length}`);
    console.log(`  After dedup/filter: ${records.length}`);
    console.log(`  Existing patients matched: ${matchCount}`);
    console.log(`    - Need intake doc created: ${missingDocCount}`);
    console.log(`    - Already have docs: ${withDocCount}`);
    console.log(`  New patients to create: ${newCount}`);
    console.log(`  Duplicate DB profiles to review: ${dbDuplicates.size}`);
    console.log('\n  Run with --execute to apply changes.');
    console.log('  Run with --execute --missing-only to only create missing docs.');

    // Write report
    const report: ImportReport = {
      batchId: IMPORT_BATCH_ID,
      csvPath: CSV_PATH,
      timestamp: new Date().toISOString(),
      totalCSVRows: rows.length,
      afterDedup: records.length,
      testRecordsSkipped: testSkipped,
      emptyRecordsSkipped: emptySkipped,
      readyForImport: records.length,
      results: {
        created: newCount,
        updated: withDocCount,
        skipped: 0,
        documentsCreated: missingDocCount + newCount,
        errors: 0,
      },
      duplicateDBProfiles: Array.from(dbDuplicates.entries()).map(([email, patients]) => ({
        email,
        dbIds: patients.map((p) => p.id),
        patientIds: patients.map((p) => p.patientId),
      })),
      errors: [],
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${REPORT_PATH}`);
  } else {
    // Execute for real
    const results: ImportResult[] = [];
    let processed = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((record) =>
          importPatient(record, clinicId, patientCache, dryRun, missingOnly)
        )
      );

      results.push(...batchResults);
      processed += batch.length;

      const created = batchResults.filter((r) => r.action === 'created').length;
      const updated = batchResults.filter((r) => r.action === 'updated').length;
      const docCreated = batchResults.filter((r) => r.action === 'doc-created').length;
      const errors = batchResults.filter((r) => r.action === 'error').length;
      const skipped = batchResults.filter((r) => r.action === 'skipped').length;

      console.log(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
          `${created} created, ${docCreated} docs added, ${updated} updated, ` +
          `${skipped} skipped, ${errors} errors ` +
          `[${processed}/${records.length}]`
      );

      if (errors > 0) {
        for (const r of batchResults.filter((r) => r.action === 'error')) {
          console.error(`    ❌ ${r.email}: ${r.error}`);
        }
      }

      // Small delay between batches to avoid overwhelming DB
      if (i + BATCH_SIZE < records.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Summary
    const totalCreated = results.filter((r) => r.action === 'created').length;
    const totalUpdated = results.filter((r) => r.action === 'updated').length;
    const totalDocCreated = results.filter((r) => r.action === 'doc-created').length;
    const totalSkipped = results.filter((r) => r.action === 'skipped').length;
    const totalErrors = results.filter((r) => r.action === 'error').length;
    const totalDocsCreated = results.filter((r) => r.documentCreated).length;

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  IMPORT COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Patients created:       ${totalCreated}`);
    console.log(`  Patients updated:       ${totalUpdated}`);
    console.log(`  Intake docs added:      ${totalDocCreated}`);
    console.log(`  Total docs created:     ${totalDocsCreated}`);
    console.log(`  Skipped:                ${totalSkipped}`);
    console.log(`  Errors:                 ${totalErrors}`);
    console.log(`  Duplicate DB profiles:  ${dbDuplicates.size}`);

    if (totalErrors > 0) {
      console.log('\n  Errors:');
      for (const r of results.filter((r) => r.action === 'error').slice(0, 20)) {
        console.log(`    ❌ ${r.email}: ${r.error}`);
      }
    }

    // Write report
    const report: ImportReport = {
      batchId: IMPORT_BATCH_ID,
      csvPath: CSV_PATH,
      timestamp: new Date().toISOString(),
      totalCSVRows: rows.length,
      afterDedup: records.length,
      testRecordsSkipped: testSkipped,
      emptyRecordsSkipped: emptySkipped,
      readyForImport: records.length,
      results: {
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
        documentsCreated: totalDocsCreated,
        errors: totalErrors,
      },
      duplicateDBProfiles: Array.from(dbDuplicates.entries()).map(([email, patients]) => ({
        email,
        dbIds: patients.map((p) => p.id),
        patientIds: patients.map((p) => p.patientId),
      })),
      errors: results
        .filter((r) => r.action === 'error')
        .map((r) => ({ email: r.email, error: r.error || 'Unknown' })),
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
