#!/usr/bin/env tsx
/**
 * IntakeQ Patient Migration Script
 * =================================
 *
 * Migrates ~14,000 patient records from an IntakeQ CSV export into the EonMeds clinic.
 *
 * Phases:
 *   1. Parse CSV with column mapping
 *   2. Clean & normalize data
 *   3. Detect & merge duplicates
 *   4. Filter test records
 *   5. Dry-run report (default)
 *   6. Batch import with PHI encryption
 *   7. Stripe customer ID verification
 *   8. Post-import validation
 *
 * Usage:
 *   # Dry run (default) — generates report, writes nothing
 *   tsx scripts/migrate-intakeq-patients.ts
 *
 *   # Execute the import
 *   tsx scripts/migrate-intakeq-patients.ts --execute
 *
 *   # Verify Stripe IDs after import (rate-limited)
 *   tsx scripts/migrate-intakeq-patients.ts --verify-stripe
 *
 *   # Post-import validation
 *   tsx scripts/migrate-intakeq-patients.ts --validate
 *
 * @module scripts/migrate-intakeq-patients
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { encryptPHI } from '../src/lib/security/phi-encryption';

// ============================================================================
// Configuration
// ============================================================================

const CSV_PATH = path.resolve(__dirname, 'data/intakeq-export.csv');
const REPORT_PATH = path.resolve(__dirname, 'data/migration-report.json');
const BATCH_SIZE = 50;
const STRIPE_RATE_LIMIT = 25; // requests per second (Stripe allows 100/sec, we stay safe)
const IMPORT_BATCH_ID = `intakeq-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// ============================================================================
// Types
// ============================================================================

interface IntakeQRow {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  dateOfBirth: string;
  gender: string;
  tags: string;
  homePhone: string;
  streetAddress: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  additionalInfo: string;
  stripeCustomerId: string;
  dateCreated: string;
  lastActivity: string;
  height: string;
  startingWeight: string;
  bmi: string;
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
  homePhone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  stripeCustomerId: string;
  dateCreated: string;
  lastActivity: string;
  height: string;
  startingWeight: string;
  bmi: string;
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
// US State Codes
// ============================================================================

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

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
        // Escaped quote
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

async function parseCSV(csvPath: string): Promise<IntakeQRow[]> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `CSV file not found: ${csvPath}\nDownload from Google Sheets and place at: scripts/data/intakeq-export.csv`
    );
  }

  return new Promise((resolve, reject) => {
    const rows: IntakeQRow[] = [];
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
        // Header row — normalize header names for lookup
        headers = fields.map((h) => h.trim());
        return;
      }

      // Build a map of header -> value
      const rowMap: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        rowMap[headers[i]] = fields[i] ?? '';
      }

      const mapped: IntakeQRow = {
        clientId: rowMap['ClientId'] ?? rowMap['clientId'] ?? rowMap['Client Id'] ?? '',
        firstName: rowMap['FirstName'] ?? rowMap['firstName'] ?? rowMap['First Name'] ?? '',
        lastName: rowMap['LastName'] ?? rowMap['lastName'] ?? rowMap['Last Name'] ?? '',
        email: rowMap['Email'] ?? rowMap['email'] ?? '',
        mobilePhone: rowMap['MobilePhone'] ?? rowMap['mobilePhone'] ?? rowMap['Mobile Phone'] ?? '',
        dateOfBirth: rowMap['DateOfBirth'] ?? rowMap['dateOfBirth'] ?? rowMap['Date Of Birth'] ?? rowMap['DOB'] ?? '',
        gender: rowMap['Gender'] ?? rowMap['gender'] ?? '',
        tags: rowMap['Tags'] ?? rowMap['tags'] ?? '',
        homePhone: rowMap['HomePhone'] ?? rowMap['homePhone'] ?? rowMap['Home Phone'] ?? '',
        streetAddress: rowMap['StreetAddress'] ?? rowMap['streetAddress'] ?? rowMap['Street Address'] ?? '',
        apartment: rowMap['Apartment /Unit #'] ?? rowMap['Apartment/Unit #'] ?? rowMap['apartment'] ?? rowMap['Apartment'] ?? rowMap['Unit'] ?? '',
        city: rowMap['City'] ?? rowMap['city'] ?? '',
        state: rowMap['State'] ?? rowMap['state'] ?? '',
        postalCode: rowMap['PostalCode'] ?? rowMap['postalCode'] ?? rowMap['Postal Code'] ?? rowMap['Zip'] ?? '',
        additionalInfo: rowMap['AdditionalInformation'] ?? rowMap['Additional Information'] ?? rowMap['additionalInformation'] ?? '',
        stripeCustomerId: rowMap['StripeCustomerId'] ?? rowMap['stripeCustomerId'] ?? rowMap['Stripe Customer Id'] ?? '',
        dateCreated: rowMap['DateCreated'] ?? rowMap['dateCreated'] ?? rowMap['Date Created'] ?? '',
        lastActivity: rowMap['LastActivity'] ?? rowMap['lastActivity'] ?? rowMap['Last Activity'] ?? '',
        height: rowMap['Height'] ?? rowMap['height'] ?? '',
        startingWeight: rowMap['Starting Weight'] ?? rowMap['startingWeight'] ?? rowMap['StartingWeight'] ?? '',
        bmi: rowMap['BMI'] ?? rowMap['bmi'] ?? '',
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
  // Handle country code prefix
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  // Return whatever we have if it doesn't match expected formats
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

  // Cannot parse — return raw (will be flagged)
  return raw;
}

function normalizeZip(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/[^0-9-]/g, '');
  // Handle 5+4 format (12345-6789)
  if (/^\d{5}(-\d{4})?$/.test(cleaned)) {
    return cleaned;
  }
  // Pad short zip codes (e.g., NJ zips: 1501 -> 01501)
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

function isLikelyTag(value: string): boolean {
  if (!value) return false;
  return value.startsWith('#') || /weightloss|english|spanish|intake/i.test(value);
}

function isLikelyDate(value: string): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value);
}

function isLikelyStripeId(value: string): boolean {
  return /^cus_[A-Za-z0-9]+$/.test(value);
}

/**
 * Detect column-shifted rows and attempt to realign.
 * Some rows from IntakeQ have missing Gender/DOB fields causing all subsequent columns to shift left.
 */
function detectAndFixColumnShift(row: IntakeQRow): { fixed: IntakeQRow; shifted: boolean; shiftDetails: string[] } {
  const details: string[] = [];
  let shifted = false;
  const fixed = { ...row };

  // Case 1: DateOfBirth contains tag-like values (e.g., "#weightloss,english")
  // This means Gender was empty AND DateOfBirth was empty, everything shifted left by 2
  if (isLikelyTag(row.dateOfBirth) && !isLikelyDate(row.dateOfBirth)) {
    details.push(`DOB field contains tags: "${row.dateOfBirth}"`);
    shifted = true;
    // In this case, the actual column mapping is shifted:
    // What we read as dateOfBirth is actually tags
    // What we read as gender is the actual DOB (or also empty)
    // Attempt to realign based on what we see in downstream fields
    fixed.tags = row.dateOfBirth; // This is actually the tags value
    fixed.dateOfBirth = ''; // DOB is missing
    fixed.gender = ''; // Gender is missing

    // Check if the "tags" field (which is actually homePhone or state) can help us realign
    if (US_STATES.has(row.tags?.toUpperCase())) {
      // Pattern: DOB=tags, gender=empty, tags=State — means address fields are shifted too
      fixed.state = row.tags;
      fixed.homePhone = '';
      fixed.streetAddress = '';
      fixed.apartment = '';
      fixed.city = '';
      // What we see as "homePhone" is probably dateCreated
      if (isLikelyDate(row.homePhone)) {
        fixed.dateCreated = row.homePhone;
      }
      if (isLikelyDate(row.streetAddress)) {
        fixed.lastActivity = row.streetAddress;
      }
    }
  }

  // Case 2: Gender contains Stripe customer ID — Gender was empty, things shifted
  if (isLikelyStripeId(row.gender)) {
    details.push(`Gender field contains Stripe ID: "${row.gender}"`);
    shifted = true;
    fixed.stripeCustomerId = row.gender;
    fixed.gender = '';
    // Tags onward shifted too
    if (isLikelyDate(row.tags)) {
      fixed.dateCreated = row.tags;
    }
    if (isLikelyDate(row.homePhone)) {
      fixed.lastActivity = row.homePhone;
    }
    fixed.tags = '';
    fixed.homePhone = '';
  }

  // Case 3: StripeCustomerId is empty but we found it elsewhere
  if (!fixed.stripeCustomerId) {
    // Check if any field that shouldn't contain a Stripe ID has one
    const fieldsToCheck = [
      'gender', 'tags', 'homePhone', 'streetAddress',
      'apartment', 'city', 'state', 'postalCode',
    ] as const;
    for (const field of fieldsToCheck) {
      if (isLikelyStripeId(row[field])) {
        fixed.stripeCustomerId = row[field];
        details.push(`Found Stripe ID in ${field}: "${row[field]}"`);
        shifted = true;
        break;
      }
    }
  }

  return { fixed, shifted, shiftDetails: details };
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
  if (rec.height) score++;
  if (rec.startingWeight) score++;
  return score;
}

function cleanRecord(row: IntakeQRow): CleanedRecord {
  const warnings: string[] = [];

  // Attempt column shift detection
  const { fixed, shifted, shiftDetails } = detectAndFixColumnShift(row);
  if (shifted) {
    warnings.push(`Column shift detected: ${shiftDetails.join('; ')}`);
  }

  const email = normalizeEmail(fixed.email);
  const phone = normalizePhone(fixed.mobilePhone);
  const dob = normalizeDate(fixed.dateOfBirth);
  const gender = normalizeGender(fixed.gender);
  const state = fixed.state?.trim().toUpperCase() ?? '';
  const zip = normalizeZip(fixed.postalCode);
  const tags = parseTags(fixed.tags);
  const homePhone = normalizePhone(fixed.homePhone);

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
    warnings.push(`Unparseable DOB: "${fixed.dateOfBirth}"`);
  }

  // Validate state
  if (state && !US_STATES.has(state)) {
    warnings.push(`Invalid state code: "${state}"`);
  }

  // Validate Stripe customer ID format
  if (fixed.stripeCustomerId && !isLikelyStripeId(fixed.stripeCustomerId)) {
    warnings.push(`Invalid Stripe ID format: "${fixed.stripeCustomerId}"`);
  }

  const isMalformed = shifted && warnings.length > 2;

  const rec: CleanedRecord = {
    intakeqClientId: fixed.clientId?.trim() ?? '',
    firstName: fixed.firstName?.trim() ?? '',
    lastName: fixed.lastName?.trim() ?? '',
    email,
    phone,
    dob,
    gender,
    tags,
    homePhone,
    address1: fixed.streetAddress?.trim() ?? '',
    address2: fixed.apartment?.trim() ?? '',
    city: fixed.city?.trim() ?? '',
    state,
    zip,
    notes: fixed.additionalInfo?.trim() ?? '',
    stripeCustomerId: isLikelyStripeId(fixed.stripeCustomerId?.trim()) ? fixed.stripeCustomerId.trim() : '',
    dateCreated: fixed.dateCreated?.trim() ?? '',
    lastActivity: fixed.lastActivity?.trim() ?? '',
    height: fixed.height?.trim() ?? '',
    startingWeight: fixed.startingWeight?.trim() ?? '',
    bmi: fixed.bmi?.trim() ?? '',
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

function cleanAllRecords(rows: IntakeQRow[]): CleanedRecord[] {
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
  // Group by email first (primary dedup key)
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

  // For records without email, group by phone
  const phoneGroups = new Map<string, CleanedRecord[]>();
  const trulyUnique: CleanedRecord[] = [];

  for (const rec of noEmailRecords) {
    if (rec.phone) {
      const group = phoneGroups.get(rec.phone) ?? [];
      group.push(rec);
      phoneGroups.set(rec.phone, group);
    } else {
      // No email AND no phone — keep as unique but flag
      rec.warnings.push('No email or phone for dedup');
      trulyUnique.push(rec);
    }
  }

  const duplicateGroups: DuplicateGroup[] = [];
  const uniqueRecords: CleanedRecord[] = [...trulyUnique];

  // Process email groups
  Array.from(emailGroups.entries()).forEach(([email, group]) => {
    if (group.length === 1) {
      uniqueRecords.push(group[0]);
    } else {
      const merged = mergeGroup(email, group);
      duplicateGroups.push(merged);
      uniqueRecords.push(merged.primary);
    }
  });

  // Process phone groups
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
  // Sort by completeness score descending — most complete record wins
  const sorted = [...records].sort((a, b) => b.completenessScore - a.completenessScore);
  const primary = { ...sorted[0] };

  // Merge tags from all records
  const allTags = new Set<string>();
  for (const rec of records) {
    for (const tag of rec.tags) {
      allTags.add(tag);
    }
  }
  const mergedTags = Array.from(allTags);
  primary.tags = mergedTags;

  // Merge notes from all records
  const allNotes: string[] = [];
  for (const rec of records) {
    if (rec.notes && !allNotes.includes(rec.notes)) {
      allNotes.push(rec.notes);
    }
  }
  const mergedNotes = allNotes.join(' | ');
  primary.notes = mergedNotes;

  // If primary is missing Stripe ID, grab from another record
  if (!primary.stripeCustomerId) {
    for (const rec of records) {
      if (rec.stripeCustomerId) {
        primary.stripeCustomerId = rec.stripeCustomerId;
        break;
      }
    }
  }

  // Fill in missing fields from secondary records
  for (const rec of sorted.slice(1)) {
    if (!primary.dob && rec.dob) primary.dob = rec.dob;
    if (!primary.gender && rec.gender) primary.gender = rec.gender;
    if (!primary.address1 && rec.address1) primary.address1 = rec.address1;
    if (!primary.city && rec.city) primary.city = rec.city;
    if (!primary.state && rec.state) primary.state = rec.state;
    if (!primary.zip && rec.zip) primary.zip = rec.zip;
    if (!primary.phone && rec.phone) primary.phone = rec.phone;
    if (!primary.email && rec.email) primary.email = rec.email;
    if (!primary.height && rec.height) primary.height = rec.height;
    if (!primary.startingWeight && rec.startingWeight) primary.startingWeight = rec.startingWeight;
    if (!primary.bmi && rec.bmi) primary.bmi = rec.bmi;
    if (!primary.homePhone && rec.homePhone) primary.homePhone = rec.homePhone;
  }

  // Recalculate completeness after merge
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
  console.log('  IntakeQ Migration — Dry Run Report');
  console.log('='.repeat(70));
  console.log(`  Batch ID:           ${report.batchId}`);
  console.log(`  CSV File:           ${report.csvPath}`);
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

async function resolveEonMedsClinic(prisma: PrismaClient): Promise<{ id: number; name: string; subdomain: string | null }> {
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: 'eonmeds' },
        { name: { contains: 'EONMEDS', mode: 'insensitive' } },
        { name: { contains: 'EonMeds', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });

  if (!clinic) {
    throw new Error(
      'EonMeds clinic not found in database. Ensure the clinic exists with subdomain "eonmeds" or name containing "EONMEDS".'
    );
  }

  return clinic;
}

async function checkExistingImport(prisma: PrismaClient, clinicId: number, intakeqClientId: string): Promise<boolean> {
  // Check if a patient with this intakeqClientId already exists (idempotency)
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

      // Generate patient ID using the existing utility
      const patientId = await generatePatientIdFn(clinicId);

      // Build source metadata (non-PHI, safe to store as JSON)
      const sourceMetadata: Record<string, unknown> = {
        importBatch: IMPORT_BATCH_ID,
        importSource: 'intakeq',
        intakeqClientId: rec.intakeqClientId,
        intakeqCreatedAt: rec.dateCreated,
        intakeqLastActivity: rec.lastActivity,
        height: rec.height || undefined,
        startingWeight: rec.startingWeight || undefined,
        bmi: rec.bmi || undefined,
        homePhone: rec.homePhone || undefined,
      };

      // Remove undefined values
      for (const key of Object.keys(sourceMetadata)) {
        if (sourceMetadata[key] === undefined) {
          delete sourceMetadata[key];
        }
      }

      // Check for Stripe ID uniqueness conflict BEFORE creating
      let stripeIdForImport: string | null = rec.stripeCustomerId || null;
      if (stripeIdForImport) {
        const existingStripePatient = await prisma.patient.findFirst({
          where: { stripeCustomerId: stripeIdForImport },
          select: { id: true, clinicId: true },
        });
        if (existingStripePatient) {
          // Stripe ID already assigned to another patient — store in metadata, don't set on profile
          sourceMetadata['conflictStripeCustomerId'] = stripeIdForImport;
          sourceMetadata['stripeConflictPatientId'] = existingStripePatient.id;
          stripeIdForImport = null;
        }
      }

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
            smsConsent: true,
            smsConsentSource: 'intakeq-import',
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
              by: 'intakeq-migration-script',
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
      // Log but don't stop the batch — continue with other records
      console.error(`  [Batch ${batchIndex}] Error importing client ${rec.intakeqClientId}: ${message}`);
    }
  }

  return { imported, skipped, errors };
}

async function executeImport(records: CleanedRecord[]): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Pre-flight checks
    console.log('\n[Phase 6] Starting import...');
    console.log('  Pre-flight checks:');

    // 1. DB connection
    await prisma.$connect();
    console.log('    [OK] Database connection');

    // 2. Resolve clinic
    const clinic = await resolveEonMedsClinic(prisma);
    console.log(`    [OK] EonMeds clinic found: ID=${clinic.id}, Name="${clinic.name}", Subdomain="${clinic.subdomain}"`);

    // 3. Check Stripe config
    const stripeKey = process.env.EONMEDS_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      console.log('    [OK] Stripe key configured');
    } else {
      console.log('    [WARN] No Stripe key found — Stripe verification will be skipped');
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

      // Write errors to file
      const errPath = path.resolve(__dirname, 'data/migration-errors.json');
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
    const stripeKey = process.env.EONMEDS_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error('[Phase 7] No Stripe API key found. Set EONMEDS_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY.');
      process.exit(1);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
      maxNetworkRetries: 3,
    });

    // Find all imported patients with Stripe IDs
    const clinic = await resolveEonMedsClinic(prisma);
    const patients = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        source: 'import',
        stripeCustomerId: { not: null },
        sourceMetadata: {
          path: ['importSource'],
          equals: 'intakeq',
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

      // Rate limiting
      if (i > 0 && i % STRIPE_RATE_LIMIT === 0) {
        await sleep(1000);
      }

      try {
        const customer = await stripe.customers.retrieve(stripeId);

        if ((customer as Stripe.DeletedCustomer).deleted) {
          deleted++;
          invalidIds.push({ patientId: patient.id, stripeId, reason: 'deleted' });

          // Move to sourceMetadata, clear from profile
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
          // Mark as verified
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
          // Rate limited — back off and retry
          console.warn(`  Rate limited at index ${i}, backing off 5s...`);
          await sleep(5000);
          i--; // Retry this one
          continue;
        } else {
          errors++;
          console.error(`  Error verifying ${stripeId}: ${stripeError.message}`);
        }
      }

      // Progress
      if ((i + 1) % 100 === 0 || i === patients.length - 1) {
        const pct = Math.round(((i + 1) / patients.length) * 100);
        console.log(`  [${pct}%] Verified ${i + 1}/${patients.length} — valid=${valid}, invalid=${invalid}, deleted=${deleted}, errors=${errors}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('  Stripe Verification Complete');
    console.log('='.repeat(70));
    console.log(`  Total Verified:   ${patients.length}`);
    console.log(`  Valid:            ${valid}`);
    console.log(`  Invalid (404):    ${invalid}`);
    console.log(`  Deleted:          ${deleted}`);
    console.log(`  Errors:           ${errors}`);

    if (invalidIds.length > 0) {
      const invalidPath = path.resolve(__dirname, 'data/invalid-stripe-ids.json');
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
    const clinic = await resolveEonMedsClinic(prisma);

    console.log('[Phase 8] Post-import validation...\n');

    // 1. Count imported patients
    const importedCount = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['importSource'],
          equals: 'intakeq',
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
          path: ['importSource'],
          equals: 'intakeq',
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

    // 4. Count with invalid Stripe IDs
    const invalidStripe = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['invalidStripeCustomerId'],
          not: Prisma.DbNull,
        },
      },
    });
    console.log(`  Invalid Stripe IDs cleared: ${invalidStripe}`);

    // 5. Spot-check PHI decryption (sample 5 patients)
    console.log('\n  --- PHI Decryption Spot Check (5 random patients) ---');
    const samplePatients = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        source: 'import',
        sourceMetadata: {
          path: ['importSource'],
          equals: 'intakeq',
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
        sourceMetadata: true,
      },
    });

    for (const p of samplePatients) {
      try {
        const firstName = decryptPHI(p.firstName);
        const lastName = decryptPHI(p.lastName);
        const email = decryptPHI(p.email);
        const meta = p.sourceMetadata as Record<string, unknown> | null;
        const intakeqId = meta?.intakeqClientId ?? 'unknown';
        console.log(`    [OK] Patient ${p.id} (${p.patientId}): IntakeQ#${intakeqId} -> "${firstName} ${lastName}" <${email}>`);
      } catch (err) {
        console.log(`    [FAIL] Patient ${p.id}: Decryption failed — ${err instanceof Error ? err.message : err}`);
      }
    }

    // 6. Check for duplicate Stripe IDs
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

    // 7. Audit log count
    const auditCount = await prisma.patientAudit.count({
      where: {
        action: 'CREATE',
        actorEmail: 'system@eonpro.io',
        diff: {
          path: ['importBatch'],
          string_starts_with: 'intakeq-import-',
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
  console.log('  IntakeQ Patient Migration');
  console.log(`  Mode: ${mode.toUpperCase()}`);
  console.log(`${'='.repeat(70)}\n`);

  // Phase 7 & 8 are standalone operations
  if (mode === 'verify-stripe') {
    await verifyStripeIds();
    return;
  }

  if (mode === 'validate') {
    await validateImport();
    return;
  }

  // Phases 1-5 always run
  const rawRows = await parseCSV(CSV_PATH);
  const cleanedRecords = cleanAllRecords(rawRows);

  // Separate malformed rows
  const malformedRows = cleanedRecords.filter((r) => r.isMalformed);
  const validRecords = cleanedRecords.filter((r) => !r.isMalformed);

  // Duplicate detection
  const { unique: dedupedRecords, duplicateGroups } = detectDuplicates(validRecords);

  // Test record filtering
  const { clean: readyRecords, testRecords } = filterTestRecords(dedupedRecords);

  // Generate and print report
  const report = generateReport(
    rawRows.length,
    malformedRows,
    testRecords,
    duplicateGroups,
    readyRecords,
  );

  printReport(report);

  // Save report JSON
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (mode === 'dry-run') {
    console.log('\n  This was a DRY RUN. No data was written to the database.');
    console.log('  To execute the import, run:');
    console.log('    tsx scripts/migrate-intakeq-patients.ts --execute\n');
    return;
  }

  // Phase 6: Execute import
  if (mode === 'execute') {
    // Include malformed rows that still have enough data (> 3 fields)
    const importable = [
      ...readyRecords,
      ...malformedRows.filter((r) => r.completenessScore >= 4 && !isTestRecord(r)),
    ];
    console.log(`\n  Including ${importable.length - readyRecords.length} recoverable malformed rows (score >= 4)`);

    // Deduplicate Stripe IDs within import set (first occurrence wins)
    const seenStripeIds = new Set<string>();
    let stripeDeduped = 0;
    for (const rec of importable) {
      if (rec.stripeCustomerId) {
        if (seenStripeIds.has(rec.stripeCustomerId)) {
          rec.stripeCustomerId = ''; // Clear duplicate — first record keeps it
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
    console.log('    1. Verify Stripe IDs:  tsx scripts/migrate-intakeq-patients.ts --verify-stripe');
    console.log('    2. Validate import:    tsx scripts/migrate-intakeq-patients.ts --validate\n');
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
