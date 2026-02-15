#!/usr/bin/env tsx
/**
 * OT (Overtime Mens Health) Patient Migration Script
 * ====================================================
 *
 * Migrates ~4,200 patient records from an IntakeQ CSV export into the OT clinic (ot.eonpro.io).
 *
 * CSV Columns:
 *   A. ClientId          B. FirstName           C. LastName
 *   D. Email             E. MobilePhone         F. DateOfBirth
 *   G. Gender            H. Tags                I. StreetAddress
 *   J. UnitNumber        K. City                L. State
 *   M. StateName         N. PostalCode          O. AdditionalInformation
 *   P. StripeCustomerId  Q. DateCreated         R. LastActivity
 *
 * Phases:
 *   1. Parse CSV with column mapping
 *   2. Clean & normalize data
 *   3. Detect & merge duplicates
 *   4. Filter test records
 *   5. Dry-run report (default)
 *   6. Batch import with PHI encryption
 *   7. Stripe customer ID verification (requires OT_STRIPE_SECRET_KEY)
 *   8. Post-import validation
 *
 * Usage:
 *   # Dry run (default) — generates report, writes nothing
 *   npx tsx scripts/migrate-ot-patients.ts
 *
 *   # Execute the import
 *   npx tsx scripts/migrate-ot-patients.ts --execute
 *
 *   # Verify Stripe IDs after import (rate-limited)
 *   npx tsx scripts/migrate-ot-patients.ts --verify-stripe
 *
 *   # Post-import validation
 *   npx tsx scripts/migrate-ot-patients.ts --validate
 *
 * For production, load env vars first:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/migrate-ot-patients.ts
 *
 * @module scripts/migrate-ot-patients
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { encryptPHI } from '../src/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '../src/lib/utils/search';

// ============================================================================
// Configuration
// ============================================================================

const CSV_PATH = path.resolve(__dirname, 'data/ot mens export.csv');
const REPORT_PATH = path.resolve(__dirname, 'data/ot-migration-report.json');
const BATCH_SIZE = 50;
const STRIPE_RATE_LIMIT = 25; // requests per second
const IMPORT_BATCH_ID = `ot-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// OT Clinic identifiers
const OT_CLINIC_SUBDOMAIN = 'ot';
const OT_CLINIC_ID = 8;

// ============================================================================
// Types
// ============================================================================

interface OTRow {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  dateOfBirth: string;
  gender: string;
  tags: string;
  streetAddress: string;
  unitNumber: string;
  city: string;
  state: string;
  stateName: string;
  postalCode: string;
  additionalInfo: string;
  stripeCustomerId: string;
  dateCreated: string;
  lastActivity: string;
}

interface CleanedRecord {
  /** Original IntakeQ client ID for traceability */
  intakeqClientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  tags: string[];
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  stripeCustomerId: string;
  dateCreated: string;
  lastActivity: string;
  /** Validation warnings for this record */
  warnings: string[];
  /** Whether this record is flagged as malformed */
  isMalformed: boolean;
  /** Whether this record is flagged as a test record */
  isTest: boolean;
  /** Duplicate group key (email-based) */
  dupKey: string;
  /** Number of non-empty meaningful fields (for dedup scoring) */
  completenessScore: number;
}

interface DuplicateGroup {
  key: string;
  records: CleanedRecord[];
  /** The record selected as primary (most complete) */
  primary: CleanedRecord;
  /** Merged tags from all records in the group */
  mergedTags: string[];
  /** Merged notes from all records in the group */
  mergedNotes: string;
}

interface MigrationReport {
  batchId: string;
  csvPath: string;
  timestamp: string;
  totalParsed: number;
  malformedRows: { row: CleanedRecord; reasons: string[] }[];
  testRecords: { intakeqClientId: string; firstName: string; lastName: string; email: string }[];
  duplicateGroups: {
    key: string;
    count: number;
    primaryClientId: string;
    mergedFromClientIds: string[];
  }[];
  readyForImport: number;
  stripeIdsToVerify: number;
  recordsWithoutStripe: number;
  recordsWithStripe: number;
  summary: {
    totalParsed: number;
    malformed: number;
    testRecords: number;
    duplicatesRemoved: number;
    uniqueAfterDedup: number;
    readyForImport: number;
  };
}

// ============================================================================
// US State Codes + State Name → Abbreviation Map
// ============================================================================

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

// ============================================================================
// Phase 1: CSV Parsing
// ============================================================================

/**
 * Parse a single CSV line, handling quoted fields with commas and escaped quotes.
 */
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

async function parseCSV(csvPath: string): Promise<OTRow[]> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `CSV file not found: ${csvPath}\nPlace the OT export at: scripts/data/ot mens export.csv`
    );
  }

  return new Promise((resolve, reject) => {
    const rows: OTRow[] = [];
    let headers: string[] = [];
    let lineNum = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(csvPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      lineNum++;
      if (!line.trim()) return;

      const fields = parseCSVLine(line);

      if (lineNum === 1) {
        headers = fields.map((h) => h.trim());
        return;
      }

      // Build a map of header -> value
      const rowMap: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        rowMap[headers[i]] = fields[i] ?? '';
      }

      // Extract ClientId and validate — skip rows where ClientId is not a number
      // (these are medication/supplement names from multiline AdditionalInformation fields)
      const rawClientId = (rowMap['ClientId'] ?? rowMap['clientId'] ?? rowMap['Client Id'] ?? '').trim();
      if (!rawClientId || !/^\d+$/.test(rawClientId)) {
        // Skip non-patient rows (empty lines, medication names, etc.)
        return;
      }

      const mapped: OTRow = {
        clientId: rawClientId,
        firstName: rowMap['FirstName'] ?? rowMap['firstName'] ?? rowMap['First Name'] ?? '',
        lastName: rowMap['LastName'] ?? rowMap['lastName'] ?? rowMap['Last Name'] ?? '',
        email: rowMap['Email'] ?? rowMap['email'] ?? '',
        mobilePhone: rowMap['MobilePhone'] ?? rowMap['mobilePhone'] ?? rowMap['Mobile Phone'] ?? '',
        dateOfBirth: rowMap['DateOfBirth'] ?? rowMap['dateOfBirth'] ?? rowMap['Date Of Birth'] ?? rowMap['DOB'] ?? '',
        gender: rowMap['Gender'] ?? rowMap['gender'] ?? '',
        tags: rowMap['Tags'] ?? rowMap['tags'] ?? '',
        streetAddress: rowMap['StreetAddress'] ?? rowMap['streetAddress'] ?? rowMap['Street Address'] ?? '',
        unitNumber: rowMap['UnitNumber'] ?? rowMap['unitNumber'] ?? rowMap['Unit Number'] ?? rowMap['Unit'] ?? '',
        city: rowMap['City'] ?? rowMap['city'] ?? '',
        state: rowMap['State'] ?? rowMap['state'] ?? '',
        stateName: rowMap['StateName'] ?? rowMap['stateName'] ?? rowMap['State Name'] ?? '',
        postalCode: rowMap['PostalCode'] ?? rowMap['postalCode'] ?? rowMap['Postal Code'] ?? rowMap['Zip'] ?? '',
        additionalInfo: rowMap['AdditionalInformation'] ?? rowMap['Additional Information'] ?? rowMap['additionalInformation'] ?? '',
        stripeCustomerId: rowMap['StripeCustomerId'] ?? rowMap['stripeCustomerId'] ?? rowMap['Stripe Customer Id'] ?? '',
        dateCreated: rowMap['DateCreated'] ?? rowMap['dateCreated'] ?? rowMap['Date Created'] ?? '',
        lastActivity: rowMap['LastActivity'] ?? rowMap['lastActivity'] ?? rowMap['Last Activity'] ?? '',
      };

      rows.push(mapped);
    });

    rl.on('close', () => {
      console.log(`[Phase 1] Parsed ${rows.length} rows from CSV (${lineNum} lines, ${headers.length} columns)`);
      resolve(rows);
    });

    rl.on('error', (err: Error) => reject(err));
  });
}

// ============================================================================
// Phase 2: Data Cleaning & Normalization
// ============================================================================

function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
}

function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

function normalizeDate(raw: string): string {
  if (!raw) return '';

  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  // M/D/YYYY or MM/DD/YYYY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return raw;
}

function normalizeZip(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/[^0-9-]/g, '');
  if (/^\d{5}(-\d{4})?$/.test(cleaned)) {
    return cleaned;
  }
  const numericOnly = cleaned.replace(/-.*/, '');
  if (/^\d{3,4}$/.test(numericOnly)) {
    return numericOnly.padStart(5, '0');
  }
  return cleaned;
}

function normalizeGender(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  if (lower === 'male' || lower === 'm') return 'Male';
  if (lower === 'female' || lower === 'f') return 'Female';
  if (lower === 'other' || lower === 'non-binary' || lower === 'nonbinary') return 'Other';
  return raw.trim();
}

function parseTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => t.length > 0);
}

function isLikelyStripeId(value: string): boolean {
  return /^cus_[A-Za-z0-9]+$/.test(value);
}

/**
 * Resolve state abbreviation from the State and StateName columns.
 * The OT CSV has both columns; sometimes State has the abbr, sometimes StateName does.
 * The Tags column also often contains state names (Florida, Arizona, etc.).
 */
function resolveState(row: OTRow): string {
  // Check State column first (usually 2-letter abbr)
  const stateCol = row.state?.trim().toUpperCase() ?? '';
  if (stateCol && US_STATES.has(stateCol)) {
    return stateCol;
  }

  // Check StateName column (might also be an abbreviation)
  const stateNameCol = row.stateName?.trim().toUpperCase() ?? '';
  if (stateNameCol && US_STATES.has(stateNameCol)) {
    return stateNameCol;
  }

  // StateName might be a full state name
  const stateNameLower = row.stateName?.trim().toLowerCase() ?? '';
  if (stateNameLower && STATE_NAME_TO_ABBR[stateNameLower]) {
    return STATE_NAME_TO_ABBR[stateNameLower];
  }

  // Tags column often contains state names for OT data
  const tagsLower = row.tags?.trim().toLowerCase() ?? '';
  if (tagsLower && STATE_NAME_TO_ABBR[tagsLower]) {
    return STATE_NAME_TO_ABBR[tagsLower];
  }

  // State column might be a full state name
  const stateLower = row.state?.trim().toLowerCase() ?? '';
  if (stateLower && STATE_NAME_TO_ABBR[stateLower]) {
    return STATE_NAME_TO_ABBR[stateLower];
  }

  return stateCol || stateNameCol;
}

function computeCompletenessScore(rec: CleanedRecord): number {
  let score = 0;
  if (rec.firstName) score++;
  if (rec.lastName) score++;
  if (rec.email) score++;
  if (rec.phone) score++;
  if (rec.dob) score++;
  if (rec.gender) score++;
  if (rec.address1) score++;
  if (rec.city) score++;
  if (rec.state) score++;
  if (rec.zip) score++;
  if (rec.stripeCustomerId) score++;
  if (rec.notes) score++;
  if (rec.tags.length > 0) score++;
  return score;
}

function cleanRecord(row: OTRow): CleanedRecord {
  const warnings: string[] = [];

  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.mobilePhone);
  const dob = normalizeDate(row.dateOfBirth);
  const gender = normalizeGender(row.gender);
  const state = resolveState(row);
  const zip = normalizeZip(row.postalCode);
  const tags = parseTags(row.tags);

  // Validate email
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`Invalid email format: "${email}"`);
  }

  // Validate phone
  if (phone && phone.length !== 10) {
    warnings.push(`Phone not 10 digits: "${phone}" (${phone.length} digits)`);
  }

  // Validate DOB
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    warnings.push(`Unparseable DOB: "${row.dateOfBirth}"`);
  }

  // Check for obviously invalid DOBs (year < 1900 or > current year)
  if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const year = parseInt(dob.substring(0, 4), 10);
    if (year < 1900 || year > new Date().getFullYear()) {
      warnings.push(`Suspicious DOB year: ${year} (from "${row.dateOfBirth}")`);
    }
  }

  // Validate state
  if (state && !US_STATES.has(state)) {
    warnings.push(`Invalid state code: "${state}"`);
  }

  // Validate Stripe customer ID format
  if (row.stripeCustomerId && !isLikelyStripeId(row.stripeCustomerId?.trim())) {
    warnings.push(`Invalid Stripe ID format: "${row.stripeCustomerId}"`);
  }

  const isMalformed = false; // OT CSV is cleaner (no column shifts observed)

  const rec: CleanedRecord = {
    intakeqClientId: row.clientId?.trim() ?? '',
    firstName: row.firstName?.trim() ?? '',
    lastName: row.lastName?.trim() ?? '',
    email,
    phone,
    dob,
    gender,
    tags,
    address1: row.streetAddress?.trim() ?? '',
    address2: row.unitNumber?.trim() ?? '',
    city: row.city?.trim() ?? '',
    state,
    zip,
    notes: row.additionalInfo?.trim() ?? '',
    stripeCustomerId: isLikelyStripeId(row.stripeCustomerId?.trim()) ? row.stripeCustomerId.trim() : '',
    dateCreated: row.dateCreated?.trim() ?? '',
    lastActivity: row.lastActivity?.trim() ?? '',
    warnings,
    isMalformed,
    isTest: false,
    dupKey: '',
    completenessScore: 0,
  };

  rec.completenessScore = computeCompletenessScore(rec);
  rec.dupKey = email || phone || `${rec.firstName.toLowerCase()}-${rec.lastName.toLowerCase()}-${rec.dob}`;

  return rec;
}

function cleanAllRecords(rows: OTRow[]): CleanedRecord[] {
  const records = rows.map((row) => cleanRecord(row));
  console.log(`[Phase 2] Cleaned ${records.length} records (${records.filter(r => r.warnings.length > 0).length} with warnings)`);
  return records;
}

// ============================================================================
// Phase 3: Duplicate Detection & Merge Strategy
// ============================================================================

function detectDuplicates(records: CleanedRecord[]): {
  unique: CleanedRecord[];
  duplicateGroups: DuplicateGroup[];
} {
  const emailGroups = new Map<string, CleanedRecord[]>();
  const noEmailRecords: CleanedRecord[] = [];

  for (const rec of records) {
    if (rec.email) {
      const group = emailGroups.get(rec.email) ?? [];
      group.push(rec);
      emailGroups.set(rec.email, group);
    } else {
      noEmailRecords.push(rec);
    }
  }

  const phoneGroups = new Map<string, CleanedRecord[]>();
  const trulyUnique: CleanedRecord[] = [];

  for (const rec of noEmailRecords) {
    if (rec.phone) {
      const group = phoneGroups.get(rec.phone) ?? [];
      group.push(rec);
      phoneGroups.set(rec.phone, group);
    } else {
      rec.warnings.push('No email or phone for dedup');
      trulyUnique.push(rec);
    }
  }

  const duplicateGroups: DuplicateGroup[] = [];
  const uniqueRecords: CleanedRecord[] = [...trulyUnique];

  Array.from(emailGroups.entries()).forEach(([email, group]) => {
    if (group.length === 1) {
      uniqueRecords.push(group[0]);
    } else {
      const merged = mergeGroup(email, group);
      duplicateGroups.push(merged);
      uniqueRecords.push(merged.primary);
    }
  });

  Array.from(phoneGroups.entries()).forEach(([phone, group]) => {
    if (group.length === 1) {
      uniqueRecords.push(group[0]);
    } else {
      const merged = mergeGroup(`phone:${phone}`, group);
      duplicateGroups.push(merged);
      uniqueRecords.push(merged.primary);
    }
  });

  console.log(`[Phase 3] Found ${duplicateGroups.length} duplicate groups, ${uniqueRecords.length} unique records`);

  return { unique: uniqueRecords, duplicateGroups };
}

function mergeGroup(key: string, records: CleanedRecord[]): DuplicateGroup {
  const sorted = [...records].sort((a, b) => b.completenessScore - a.completenessScore);
  const primary = { ...sorted[0] };

  const allTags = new Set<string>();
  for (const rec of records) {
    for (const tag of rec.tags) {
      allTags.add(tag);
    }
  }
  const mergedTags = Array.from(allTags);
  primary.tags = mergedTags;

  const allNotes: string[] = [];
  for (const rec of records) {
    if (rec.notes && !allNotes.includes(rec.notes)) {
      allNotes.push(rec.notes);
    }
  }
  const mergedNotes = allNotes.join(' | ');
  primary.notes = mergedNotes;

  if (!primary.stripeCustomerId) {
    for (const rec of records) {
      if (rec.stripeCustomerId) {
        primary.stripeCustomerId = rec.stripeCustomerId;
        break;
      }
    }
  }

  for (const rec of sorted.slice(1)) {
    if (!primary.dob && rec.dob) primary.dob = rec.dob;
    if (!primary.gender && rec.gender) primary.gender = rec.gender;
    if (!primary.address1 && rec.address1) primary.address1 = rec.address1;
    if (!primary.address2 && rec.address2) primary.address2 = rec.address2;
    if (!primary.city && rec.city) primary.city = rec.city;
    if (!primary.state && rec.state) primary.state = rec.state;
    if (!primary.zip && rec.zip) primary.zip = rec.zip;
    if (!primary.phone && rec.phone) primary.phone = rec.phone;
    if (!primary.email && rec.email) primary.email = rec.email;
  }

  primary.completenessScore = computeCompletenessScore(primary);

  return { key, records, primary, mergedTags, mergedNotes };
}

// ============================================================================
// Phase 4: Test Record Filtering
// ============================================================================

const TEST_PATTERNS = {
  names: [
    /^jane\s+doe$/i,
    /^john\s+doe$/i,
    /^test\s+test$/i,
    /^test\s+user$/i,
    /^demo\s+demo$/i,
    /^sample\s+patient$/i,
    /^fake\s+patient$/i,
  ],
  firstNames: [/^test$/i, /^demo$/i, /^fake$/i, /^sample$/i, /^xxx$/i],
  lastNames: [/^test$/i, /^demo$/i, /^fake$/i, /^sample$/i, /^xxx$/i],
  emails: [
    /^test@/i,
    /test@gmail\.com$/i,
    /test@gnail\.com$/i,
    /test@test\.com$/i,
    /^demo@/i,
    /^fake@/i,
    /example\.com$/i,
  ],
};

function isTestRecord(rec: CleanedRecord): boolean {
  const fullName = `${rec.firstName} ${rec.lastName}`;

  for (const pattern of TEST_PATTERNS.names) {
    if (pattern.test(fullName)) return true;
  }

  for (const pattern of TEST_PATTERNS.firstNames) {
    if (pattern.test(rec.firstName)) return true;
  }

  for (const pattern of TEST_PATTERNS.lastNames) {
    if (pattern.test(rec.lastName)) return true;
  }

  for (const pattern of TEST_PATTERNS.emails) {
    if (pattern.test(rec.email)) return true;
  }

  return false;
}

function filterTestRecords(records: CleanedRecord[]): {
  clean: CleanedRecord[];
  testRecords: CleanedRecord[];
} {
  const clean: CleanedRecord[] = [];
  const testRecords: CleanedRecord[] = [];

  for (const rec of records) {
    if (isTestRecord(rec)) {
      rec.isTest = true;
      testRecords.push(rec);
    } else {
      clean.push(rec);
    }
  }

  console.log(`[Phase 4] Filtered ${testRecords.length} test records, ${clean.length} remaining`);
  return { clean, testRecords };
}

// ============================================================================
// Phase 5: Dry Run Report
// ============================================================================

function generateReport(
  totalParsed: number,
  malformedRows: CleanedRecord[],
  testRecords: CleanedRecord[],
  duplicateGroups: DuplicateGroup[],
  readyRecords: CleanedRecord[],
): MigrationReport {
  const duplicatesRemoved = duplicateGroups.reduce((sum, g) => sum + g.records.length - 1, 0);

  const report: MigrationReport = {
    batchId: IMPORT_BATCH_ID,
    csvPath: CSV_PATH,
    timestamp: new Date().toISOString(),
    totalParsed,
    malformedRows: malformedRows.map((r) => ({
      row: r,
      reasons: r.warnings,
    })),
    testRecords: testRecords.map((r) => ({
      intakeqClientId: r.intakeqClientId,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
    })),
    duplicateGroups: duplicateGroups.map((g) => ({
      key: g.key,
      count: g.records.length,
      primaryClientId: g.primary.intakeqClientId,
      mergedFromClientIds: g.records
        .filter((r) => r.intakeqClientId !== g.primary.intakeqClientId)
        .map((r) => r.intakeqClientId),
    })),
    readyForImport: readyRecords.length,
    stripeIdsToVerify: readyRecords.filter((r) => r.stripeCustomerId).length,
    recordsWithoutStripe: readyRecords.filter((r) => !r.stripeCustomerId).length,
    recordsWithStripe: readyRecords.filter((r) => r.stripeCustomerId).length,
    summary: {
      totalParsed,
      malformed: malformedRows.length,
      testRecords: testRecords.length,
      duplicatesRemoved,
      uniqueAfterDedup: totalParsed - duplicatesRemoved,
      readyForImport: readyRecords.length,
    },
  };

  return report;
}

function printReport(report: MigrationReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('  OT (Overtime) Patient Migration — Dry Run Report');
  console.log('='.repeat(70));
  console.log(`  Batch ID:           ${report.batchId}`);
  console.log(`  CSV File:           ${report.csvPath}`);
  console.log(`  Target Clinic:      Overtime Mens Health (ID: ${OT_CLINIC_ID}, subdomain: ${OT_CLINIC_SUBDOMAIN})`);
  console.log(`  Generated At:       ${report.timestamp}`);
  console.log('');
  console.log('  --- Summary ---');
  console.log(`  Total Rows Parsed:      ${report.summary.totalParsed}`);
  console.log(`  Malformed Rows:         ${report.summary.malformed}`);
  console.log(`  Test Records Removed:   ${report.summary.testRecords}`);
  console.log(`  Duplicates Removed:     ${report.summary.duplicatesRemoved}`);
  console.log(`  Unique After Dedup:     ${report.summary.uniqueAfterDedup}`);
  console.log(`  Ready For Import:       ${report.summary.readyForImport}`);
  console.log('');
  console.log('  --- Stripe ---');
  console.log(`  With Stripe ID:         ${report.recordsWithStripe}`);
  console.log(`  Without Stripe ID:      ${report.recordsWithoutStripe}`);
  console.log(`  IDs To Verify:          ${report.stripeIdsToVerify}`);
  console.log('');

  if (report.testRecords.length > 0) {
    console.log(`  --- Test Records (${report.testRecords.length}) ---`);
    for (const t of report.testRecords.slice(0, 10)) {
      console.log(`    - [${t.intakeqClientId}] ${t.firstName} ${t.lastName} <${t.email}>`);
    }
    if (report.testRecords.length > 10) {
      console.log(`    ... and ${report.testRecords.length - 10} more`);
    }
    console.log('');
  }

  if (report.duplicateGroups.length > 0) {
    console.log(`  --- Duplicate Groups (${report.duplicateGroups.length}) ---`);
    for (const g of report.duplicateGroups.slice(0, 10)) {
      console.log(`    - Key: "${g.key}" | ${g.count} records -> primary: ${g.primaryClientId}, merged: [${g.mergedFromClientIds.join(', ')}]`);
    }
    if (report.duplicateGroups.length > 10) {
      console.log(`    ... and ${report.duplicateGroups.length - 10} more`);
    }
    console.log('');
  }

  if (report.malformedRows.length > 0) {
    console.log(`  --- Malformed Rows (${report.malformedRows.length}) ---`);
    for (const m of report.malformedRows.slice(0, 5)) {
      console.log(`    - [${m.row.intakeqClientId}] ${m.row.firstName} ${m.row.lastName}: ${m.reasons.join('; ')}`);
    }
    if (report.malformedRows.length > 5) {
      console.log(`    ... and ${report.malformedRows.length - 5} more (see full report JSON)`);
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log(`  Report saved to: ${REPORT_PATH}`);
  console.log('='.repeat(70));
}

// ============================================================================
// Phase 6: Batch Import
// ============================================================================

async function resolveOTClinic(prisma: PrismaClient): Promise<{ id: number; name: string; subdomain: string | null }> {
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { id: OT_CLINIC_ID },
        { subdomain: OT_CLINIC_SUBDOMAIN },
        { name: { contains: 'Overtime', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    throw new Error(
      `OT clinic not found in database. Ensure the clinic exists with ID ${OT_CLINIC_ID} or subdomain "${OT_CLINIC_SUBDOMAIN}".`
    );
  }

  return clinic;
}

async function checkExistingImport(prisma: PrismaClient, clinicId: number, intakeqClientId: string): Promise<boolean> {
  const existing = await prisma.patient.findFirst({
    where: {
      clinicId,
      sourceMetadata: {
        path: ['intakeqClientId'],
        equals: intakeqClientId,
      },
    },
    select: { id: true },
  });
  return !!existing;
}

async function importBatch(
  prisma: PrismaClient,
  records: CleanedRecord[],
  clinicId: number,
  batchIndex: number,
  generatePatientIdFn: (clinicId: number) => Promise<string>,
): Promise<{ imported: number; skipped: number; errors: { clientId: string; error: string }[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: { clientId: string; error: string }[] = [];

  for (const rec of records) {
    try {
      // Idempotency check
      const exists = await checkExistingImport(prisma, clinicId, rec.intakeqClientId);
      if (exists) {
        skipped++;
        continue;
      }

      // Generate patient ID
      const patientId = await generatePatientIdFn(clinicId);

      // Build source metadata (non-PHI, safe to store as JSON)
      const sourceMetadata: Record<string, unknown> = {
        importBatch: IMPORT_BATCH_ID,
        importSource: 'intakeq',
        importClinic: 'ot',
        intakeqClientId: rec.intakeqClientId,
        intakeqCreatedAt: rec.dateCreated,
        intakeqLastActivity: rec.lastActivity,
      };

      // Remove undefined values
      for (const key of Object.keys(sourceMetadata)) {
        if (sourceMetadata[key] === undefined) {
          delete sourceMetadata[key];
        }
      }

      // Check for Stripe ID uniqueness conflict
      let stripeIdForImport: string | null = rec.stripeCustomerId || null;
      if (stripeIdForImport) {
        const existingStripePatient = await prisma.patient.findFirst({
          where: { stripeCustomerId: stripeIdForImport },
          select: { id: true, clinicId: true },
        });
        if (existingStripePatient) {
          sourceMetadata['conflictStripeCustomerId'] = stripeIdForImport;
          sourceMetadata['stripeConflictPatientId'] = existingStripePatient.id;
          stripeIdForImport = null;
        }
      }

      // Build search index from plain-text BEFORE encryption
      const searchIndex = buildPatientSearchIndex({
        firstName: rec.firstName,
        lastName: rec.lastName,
        email: rec.email,
        phone: rec.phone,
        patientId,
      });

      // Encrypt PHI fields
      const encryptedFirstName = encryptPHI(rec.firstName || null);
      const encryptedLastName = encryptPHI(rec.lastName || null);
      const encryptedEmail = encryptPHI(rec.email || null);
      const encryptedPhone = encryptPHI(rec.phone || null);
      const encryptedDob = encryptPHI(rec.dob || null);
      const encryptedAddress1 = encryptPHI(rec.address1 || null);
      const encryptedAddress2 = encryptPHI(rec.address2 || null);
      const encryptedCity = encryptPHI(rec.city || null);
      const encryptedState = encryptPHI(rec.state || null);
      const encryptedZip = encryptPHI(rec.zip || null);

      // Create patient in a transaction with audit log
      await prisma.$transaction(async (tx) => {
        const patient = await tx.patient.create({
          data: {
            patientId,
            clinicId,
            firstName: encryptedFirstName ?? '',
            lastName: encryptedLastName ?? '',
            email: encryptedEmail ?? '',
            phone: encryptedPhone ?? '',
            dob: encryptedDob ?? '',
            gender: rec.gender || '',
            address1: encryptedAddress1 ?? '',
            address2: encryptedAddress2,
            city: encryptedCity ?? '',
            state: encryptedState ?? '',
            zip: encryptedZip ?? '',
            notes: rec.notes || null,
            tags: rec.tags as unknown as Prisma.InputJsonValue,
            stripeCustomerId: stripeIdForImport,
            source: 'import',
            sourceMetadata: sourceMetadata as Prisma.InputJsonValue,
            searchIndex,
            smsConsent: true,
            smsConsentSource: 'ot-intakeq-import',
          },
        });

        // Create audit log
        await tx.patientAudit.create({
          data: {
            patientId: patient.id,
            action: 'CREATE',
            actorEmail: 'system@eonpro.io',
            diff: {
              created: true,
              by: 'ot-migration-script',
              role: 'system',
              importBatch: IMPORT_BATCH_ID,
              intakeqClientId: rec.intakeqClientId,
            } as Prisma.InputJsonValue,
          },
        });
      }, {
        timeout: 30000,
      });

      imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ clientId: rec.intakeqClientId, error: message });
      console.error(`  [Batch ${batchIndex}] Error importing client ${rec.intakeqClientId}: ${message}`);
    }
  }

  return { imported, skipped, errors };
}

async function executeImport(records: CleanedRecord[]): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log('\n[Phase 6] Starting import...');
    console.log('  Pre-flight checks:');

    // 1. DB connection
    await prisma.$connect();
    console.log('    [OK] Database connection');

    // 2. Resolve clinic
    const clinic = await resolveOTClinic(prisma);
    console.log(`    [OK] OT clinic found: ID=${clinic.id}, Name="${clinic.name}", Subdomain="${clinic.subdomain}"`);

    // 3. Check Stripe config
    const stripeKey = process.env.OT_STRIPE_SECRET_KEY;
    if (stripeKey) {
      console.log('    [OK] OT Stripe key configured');
    } else {
      console.log('    [WARN] No OT_STRIPE_SECRET_KEY found — Stripe verification will be skipped');
    }

    // Load patient ID generator
    const { generatePatientId } = await import('../src/lib/patients/patientIdGenerator');

    console.log(`\n  Importing ${records.length} records in batches of ${BATCH_SIZE}...`);
    console.log(`  Batch ID: ${IMPORT_BATCH_ID}`);
    console.log(`  Target clinic: ${clinic.name} (ID: ${clinic.id})\n`);

    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors: { clientId: string; error: string }[] = [];
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const pct = Math.round((batchIndex / totalBatches) * 100);

      process.stdout.write(`  [${pct}%] Batch ${batchIndex}/${totalBatches} (${batch.length} records)...`);

      const result = await importBatch(prisma, batch, clinic.id, batchIndex, generatePatientId);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);

      process.stdout.write(` imported=${result.imported}, skipped=${result.skipped}, errors=${result.errors.length}\n`);
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('  Import Complete');
    console.log('='.repeat(70));
    console.log(`  Total Imported:   ${totalImported}`);
    console.log(`  Total Skipped:    ${totalSkipped} (already existed)`);
    console.log(`  Total Errors:     ${allErrors.length}`);
    console.log(`  Batch ID:         ${IMPORT_BATCH_ID}`);

    if (allErrors.length > 0) {
      console.log('\n  --- Errors ---');
      for (const e of allErrors.slice(0, 20)) {
        console.log(`    - [${e.clientId}] ${e.error}`);
      }
      if (allErrors.length > 20) {
        console.log(`    ... and ${allErrors.length - 20} more`);
      }

      const errPath = path.resolve(__dirname, 'data/ot-migration-errors.json');
      fs.writeFileSync(errPath, JSON.stringify(allErrors, null, 2));
      console.log(`\n  Full error log: ${errPath}`);
    }

    console.log('='.repeat(70));
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// Phase 7: Stripe Verification
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyStripeIds(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const stripeKey = process.env.OT_STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error('[Phase 7] No OT Stripe API key found. Set OT_STRIPE_SECRET_KEY.');
      console.error('  Stripe verification skipped.');
      process.exit(1);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
      maxNetworkRetries: 3,
    });

    const clinic = await resolveOTClinic(prisma);
    const patients = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        source: 'import',
        stripeCustomerId: { not: null },
        sourceMetadata: {
          path: ['importClinic'],
          equals: 'ot',
        },
      },
      select: {
        id: true,
        stripeCustomerId: true,
        sourceMetadata: true,
      },
    });

    console.log(`[Phase 7] Verifying ${patients.length} Stripe customer IDs...`);
    console.log(`  Rate limit: ${STRIPE_RATE_LIMIT} requests/sec\n`);

    let valid = 0;
    let invalid = 0;
    let deleted = 0;
    let errors = 0;
    const invalidIds: { patientId: number; stripeId: string; reason: string }[] = [];

    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];
      const stripeId = patient.stripeCustomerId!;

      if (i > 0 && i % STRIPE_RATE_LIMIT === 0) {
        await sleep(1000);
      }

      try {
        const customer = await stripe.customers.retrieve(stripeId);

        if ((customer as Stripe.DeletedCustomer).deleted) {
          deleted++;
          invalidIds.push({ patientId: patient.id, stripeId, reason: 'deleted' });

          const meta = (patient.sourceMetadata as Record<string, unknown>) ?? {};
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              stripeCustomerId: null,
              sourceMetadata: {
                ...meta,
                invalidStripeCustomerId: stripeId,
                stripeVerificationResult: 'deleted',
                stripeVerifiedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        } else {
          valid++;
          const meta = (patient.sourceMetadata as Record<string, unknown>) ?? {};
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              sourceMetadata: {
                ...meta,
                stripeVerifiedAt: new Date().toISOString(),
                stripeVerificationResult: 'valid',
              } as Prisma.InputJsonValue,
            },
          });
        }
      } catch (err) {
        const stripeError = err as { type?: string; statusCode?: number; message?: string };

        if (stripeError.statusCode === 404 || stripeError.type === 'StripeInvalidRequestError') {
          invalid++;
          invalidIds.push({ patientId: patient.id, stripeId, reason: 'not_found' });

          const meta = (patient.sourceMetadata as Record<string, unknown>) ?? {};
          await prisma.patient.update({
            where: { id: patient.id },
            data: {
              stripeCustomerId: null,
              sourceMetadata: {
                ...meta,
                invalidStripeCustomerId: stripeId,
                stripeVerificationResult: 'not_found',
                stripeVerifiedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        } else if (stripeError.statusCode === 429) {
          console.warn(`  Rate limited at index ${i}, backing off 5s...`);
          await sleep(5000);
          i--;
          continue;
        } else {
          errors++;
          console.error(`  Error verifying ${stripeId}: ${stripeError.message}`);
        }
      }

      if ((i + 1) % 100 === 0 || i === patients.length - 1) {
        const pct = Math.round(((i + 1) / patients.length) * 100);
        console.log(`  [${pct}%] Verified ${i + 1}/${patients.length} — valid=${valid}, invalid=${invalid}, deleted=${deleted}, errors=${errors}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('  Stripe Verification Complete');
    console.log('='.repeat(70));
    console.log(`  Total Verified:   ${patients.length}`);
    console.log(`  Valid:            ${valid}`);
    console.log(`  Invalid (404):    ${invalid}`);
    console.log(`  Deleted:          ${deleted}`);
    console.log(`  Errors:           ${errors}`);

    if (invalidIds.length > 0) {
      const invalidPath = path.resolve(__dirname, 'data/ot-invalid-stripe-ids.json');
      fs.writeFileSync(invalidPath, JSON.stringify(invalidIds, null, 2));
      console.log(`\n  Invalid IDs saved to: ${invalidPath}`);
    }

    console.log('='.repeat(70));
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// Phase 8: Post-Import Validation
// ============================================================================

async function validateImport(): Promise<void> {
  const prisma = new PrismaClient();
  const { decryptPHI } = await import('../src/lib/security/phi-encryption');

  try {
    const clinic = await resolveOTClinic(prisma);

    console.log('[Phase 8] Post-import validation...\n');

    // 1. Count imported patients
    const importedCount = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['importClinic'],
          equals: 'ot',
        },
      },
    });
    console.log(`  Total imported patients: ${importedCount}`);

    // 2. Count with Stripe IDs
    const withStripe = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        source: 'import',
        stripeCustomerId: { not: null },
        sourceMetadata: {
          path: ['importClinic'],
          equals: 'ot',
        },
      },
    });
    console.log(`  With Stripe ID: ${withStripe}`);

    // 3. Count verified Stripe IDs
    const verifiedStripe = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['stripeVerificationResult'],
          equals: 'valid',
        },
      },
    });
    console.log(`  Stripe-verified: ${verifiedStripe}`);

    // 4. Spot-check PHI decryption (sample 5 patients)
    console.log('\n  --- PHI Decryption Spot Check (5 random patients) ---');
    const samplePatients = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['importClinic'],
          equals: 'ot',
        },
      },
      take: 5,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dob: true,
        gender: true,
        address1: true,
        city: true,
        state: true,
        zip: true,
        sourceMetadata: true,
      },
    });

    for (const p of samplePatients) {
      try {
        const firstName = decryptPHI(p.firstName);
        const lastName = decryptPHI(p.lastName);
        const email = decryptPHI(p.email);
        const phone = decryptPHI(p.phone);
        const city = decryptPHI(p.city);
        const state = decryptPHI(p.state);
        const meta = p.sourceMetadata as Record<string, unknown> | null;
        const intakeqId = meta?.intakeqClientId ?? 'unknown';
        console.log(`    [OK] Patient ${p.id} (${p.patientId}): IntakeQ#${intakeqId} -> "${firstName} ${lastName}" <${email}> ${phone} | ${city}, ${state}`);
      } catch (err) {
        console.log(`    [FAIL] Patient ${p.id}: Decryption failed — ${err instanceof Error ? err.message : err}`);
      }
    }

    // 5. Check for duplicate Stripe IDs
    const duplicateStripeQuery = await prisma.$queryRaw<{ stripeCustomerId: string; cnt: bigint }[]>`
      SELECT "stripeCustomerId", COUNT(*) as cnt
      FROM "Patient"
      WHERE "clinicId" = ${clinic.id}
        AND "source" = 'import'
        AND "stripeCustomerId" IS NOT NULL
      GROUP BY "stripeCustomerId"
      HAVING COUNT(*) > 1
    `;

    if (duplicateStripeQuery.length > 0) {
      console.log(`\n  [WARN] Found ${duplicateStripeQuery.length} duplicate Stripe IDs across patients:`);
      for (const d of duplicateStripeQuery.slice(0, 10)) {
        console.log(`    - ${d.stripeCustomerId} (${d.cnt} patients)`);
      }
    } else {
      console.log('\n  [OK] No duplicate Stripe customer IDs found');
    }

    // 6. Audit log count
    const auditCount = await prisma.patientAudit.count({
      where: {
        action: 'CREATE',
        actorEmail: 'system@eonpro.io',
        diff: {
          path: ['importBatch'],
          string_starts_with: 'ot-import-',
        },
      },
    });
    console.log(`  Audit records: ${auditCount}`);

    console.log('\n' + '='.repeat(70));
    console.log('  Validation Complete');
    console.log('='.repeat(70));
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// Main Orchestrator
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.includes('--execute')
    ? 'execute'
    : args.includes('--verify-stripe')
      ? 'verify-stripe'
      : args.includes('--validate')
        ? 'validate'
        : 'dry-run';

  console.log(`\n${'='.repeat(70)}`);
  console.log('  OT (Overtime Mens Health) Patient Migration');
  console.log(`  Mode: ${mode.toUpperCase()}`);
  console.log(`${'='.repeat(70)}\n`);

  // Phase 7 & 8 are standalone
  if (mode === 'verify-stripe') {
    await verifyStripeIds();
    return;
  }

  if (mode === 'validate') {
    await validateImport();
    return;
  }

  // Phases 1-5
  const rawRows = await parseCSV(CSV_PATH);
  const cleanedRecords = cleanAllRecords(rawRows);

  const malformedRows = cleanedRecords.filter((r) => r.isMalformed);
  const validRecords = cleanedRecords.filter((r) => !r.isMalformed);

  const { unique: dedupedRecords, duplicateGroups } = detectDuplicates(validRecords);
  const { clean: readyRecords, testRecords } = filterTestRecords(dedupedRecords);

  const report = generateReport(
    rawRows.length,
    malformedRows,
    testRecords,
    duplicateGroups,
    readyRecords,
  );

  printReport(report);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (mode === 'dry-run') {
    console.log('\n  This was a DRY RUN. No data was written to the database.');
    console.log('  To execute the import, run:');
    console.log('    npx tsx scripts/migrate-ot-patients.ts --execute\n');
    return;
  }

  // Phase 6: Execute import
  if (mode === 'execute') {
    const importable = [
      ...readyRecords,
      ...malformedRows.filter((r) => r.completenessScore >= 4 && !isTestRecord(r)),
    ];
    console.log(`\n  Including ${importable.length - readyRecords.length} recoverable malformed rows (score >= 4)`);

    // Deduplicate Stripe IDs within import set
    const seenStripeIds = new Set<string>();
    let stripeDeduped = 0;
    for (const rec of importable) {
      if (rec.stripeCustomerId) {
        if (seenStripeIds.has(rec.stripeCustomerId)) {
          rec.stripeCustomerId = '';
          stripeDeduped++;
        } else {
          seenStripeIds.add(rec.stripeCustomerId);
        }
      }
    }
    if (stripeDeduped > 0) {
      console.log(`  Cleared ${stripeDeduped} duplicate Stripe IDs within import set (first occurrence kept)`);
    }

    await executeImport(importable);

    console.log('\n  Next steps:');
    console.log('    1. Verify Stripe IDs:  npx tsx scripts/migrate-ot-patients.ts --verify-stripe');
    console.log('    2. Validate import:    npx tsx scripts/migrate-ot-patients.ts --validate\n');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL] Migration failed:', err);
    process.exit(1);
  });
