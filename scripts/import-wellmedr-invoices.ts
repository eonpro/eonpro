#!/usr/bin/env tsx
/**
 * WellMedR Invoice CSV Import Script
 * ====================================
 *
 * Imports payment/order records from the WellMedR Airtable Orders CSV export.
 * Creates Invoice records for succeeded payments, matches them to existing patients,
 * and ensures they appear in the Provider Rx Queue if no prescription exists.
 *
 * Usage:
 *   # Dry run (default)
 *   npx tsx scripts/import-wellmedr-invoices.ts
 *
 *   # Execute import
 *   npx tsx scripts/import-wellmedr-invoices.ts --execute
 *
 *   # Import only data rows 1071–1103 (1-based; e.g. after Airtable recovery)
 *   npx tsx scripts/import-wellmedr-invoices.ts --startRow 1071 --endRow 1103
 *   npx tsx scripts/import-wellmedr-invoices.ts --execute --startRow 1071 --endRow 1103
 *
 *   # Use a recovered CSV file (same column names as Airtable Orders export)
 *   npx tsx scripts/import-wellmedr-invoices.ts --csv path/to/recovered-orders.csv --startRow 1071 --endRow 1103 --execute
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/import-wellmedr-invoices.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { encryptPHI, decryptPHI } from '../src/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '../src/lib/utils/search';
import { generatePatientId } from '../src/lib/patients';

// ============================================================================
// Configuration
// ============================================================================

const CSV_PATH = path.resolve(__dirname, 'data/wellmedr-orders-export.csv');
const REPORT_PATH = path.resolve(__dirname, 'data/wellmedr-invoice-import-report.json');
const BATCH_SIZE = 20;
const IMPORT_BATCH_ID = `wellmedr-inv-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ============================================================================
// Types
// ============================================================================

interface CSVRow {
  'submission_id': string;
  'Created': string;
  'payment_status': string;
  'order_status': string;
  'cardholder_name': string;
  'customer_email': string;
  'customer_name': string;
  'subscription_status': string;
  'product': string;
  'medication_type': string;
  'plan': string;
  'price': string;
  'stripe_price_id': string;
  'stripe_customer_id': string;
  'stripe_subscription_id': string;
  'payment_intent_id': string;
  'payment_method_type': string;
  'payment_method_id': string;
  'card_last4': string;
  'card_brand': string;
  'coupon_code': string;
  'total_discount': string;
  'shipping_address': string;
  'billing_address': string;
  'created_at': string;
  [key: string]: string;
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

interface ImportResult {
  email: string;
  name: string;
  product: string;
  plan: string;
  price: string;
  action: 'created' | 'skipped-duplicate' | 'skipped-no-pm' | 'error' | 'patient-created';
  invoiceId?: number;
  patientDbId?: number;
  patientNumber?: string;
  hasPrescription: boolean;
  error?: string;
}

// ============================================================================
// CSV Parsing
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
  if (lines.length < 2) throw new Error('CSV has no data');

  const rawHeader = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(rawHeader).map((h) => h.replace(/^\uFEFF/, '').trim());

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].replace(/\uFEFF/g, '').trim();
      row[key] = values[j] ?? '';
    }
    rows.push(row as CSVRow);
  }
  return rows;
}

// ============================================================================
// Patient Matching (same pattern as intake import)
// ============================================================================

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

async function loadAllPatients(clinicId: number): Promise<DecryptedPatientCache[]> {
  console.log('  Loading all WellMedR patients from DB...');
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

  const decrypted: DecryptedPatientCache[] = patients.map((p) => ({
    id: p.id,
    patientId: p.patientId,
    email: safeDecrypt(p.email).toLowerCase().trim(),
    phone: safeDecrypt(p.phone).replace(/\D/g, ''),
    firstName: safeDecrypt(p.firstName).toLowerCase().trim(),
    lastName: safeDecrypt(p.lastName).toLowerCase().trim(),
    dob: safeDecrypt(p.dob),
    createdAt: p.createdAt,
  }));

  console.log(`  Loaded and decrypted ${decrypted.length} patients`);
  return decrypted;
}

function findPatientByEmail(
  email: string,
  cache: DecryptedPatientCache[]
): DecryptedPatientCache | null {
  const search = email.toLowerCase().trim();
  if (!search || search === 'unknown@example.com') return null;
  return cache.find((p) => p.email === search) || null;
}

// ============================================================================
// Price Parsing
// ============================================================================

function parsePriceToCents(priceStr: string): number {
  if (!priceStr) return 29900; // default $299
  const cleaned = priceStr.replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed <= 0) return 29900;
  return Math.round(parsed * 100);
}

// ============================================================================
// Address Parsing
// ============================================================================

function parseShippingAddress(raw: string): {
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
} {
  const empty = { address: '', address2: '', city: '', state: '', zip: '' };
  if (!raw || !raw.trim()) return empty;

  const trimmed = raw.trim();

  // Try JSON parse first
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        address: obj.address || obj.street || obj.address1 || '',
        address2: obj.apt || obj.apartment || obj.address2 || obj.unit || '',
        city: obj.city || obj.City || '',
        state: obj.state || obj.state_code || obj.State || '',
        zip: obj.zipCode || obj.zip || obj.zip_code || obj.postalCode || '',
      };
    } catch {
      // Not valid JSON, try string parsing
    }
  }

  // Parse "Street, City, State, Zip" format
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length >= 4) {
    return {
      address: parts[0],
      address2: '',
      city: parts[1],
      state: parts[2],
      zip: parts[3],
    };
  } else if (parts.length === 3) {
    if (/\d/.test(parts[0])) {
      const stateZip = parts[2].split(/\s+/);
      return {
        address: parts[0],
        address2: '',
        city: parts[1],
        state: stateZip[0] || '',
        zip: stateZip[1] || '',
      };
    }
  }

  return { ...empty, address: trimmed };
}

// ============================================================================
// Date Parsing
// ============================================================================

function parsePaymentDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // "2026-01-26 1:30pm" or "1/26/2026 8:30am"
  const match1 = dateStr.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)?/i
  );
  if (match1) {
    const [, month, day, year, hours, minutes, ampm] = match1;
    let h = parseInt(hours, 10);
    if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm?.toLowerCase() === 'am' && h === 12) h = 0;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minutes));
  }

  // ISO-ish format
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ============================================================================
// Product Name Builder
// ============================================================================

function buildProductName(product: string, medicationType: string, plan: string): string {
  let name = product
    ? product.charAt(0).toUpperCase() + product.slice(1).toLowerCase()
    : 'GLP-1';
  if (medicationType) {
    name += ` ${medicationType.charAt(0).toUpperCase() + medicationType.slice(1).toLowerCase()}`;
  }
  if (plan) {
    name += ` (${plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()})`;
  }
  return name;
}

// ============================================================================
// Main Import Logic
// ============================================================================

async function importInvoice(
  row: CSVRow,
  clinicId: number,
  patientCache: DecryptedPatientCache[],
  existingPmIds: Set<string>,
  existingSubmissionIds: Set<string>,
  patientsWithRx: Set<number>,
  dryRun: boolean,
  invoiceCounter: { count: number }
): Promise<ImportResult> {
  const email = (row.customer_email || '').trim().toLowerCase();
  const name = row.customer_name || row.cardholder_name || '';
  const product = row.product || 'GLP-1';
  const medicationType = row.medication_type || '';
  const plan = row.plan || '';
  const pmId = (row.payment_method_id || '').trim();
  const submissionId = (row.submission_id || '').trim();
  const price = row.price || '';

  const result: ImportResult = {
    email,
    name,
    product,
    plan,
    price,
    action: 'created',
    hasPrescription: false,
  };

  // Dedup: require either payment_method_id (pm_) or submission_id (recovery export)
  const hasPm = pmId && pmId.startsWith('pm_');
  const hasSubmissionId = submissionId.length > 0;
  if (!hasPm && !hasSubmissionId) {
    result.action = 'skipped-no-pm';
    return result;
  }
  if (hasPm && existingPmIds.has(pmId)) {
    result.action = 'skipped-duplicate';
    return result;
  }
  if (hasSubmissionId && existingSubmissionIds.has(submissionId)) {
    result.action = 'skipped-duplicate';
    return result;
  }

  try {
    // Match patient
    let matchedPatient = findPatientByEmail(email, patientCache);

    if (!matchedPatient && !dryRun) {
      // Create stub patient
      const patientNumber = await generatePatientId(clinicId);
      const firstName = name.split(/\s+/)[0] || 'Unknown';
      const lastName = name.split(/\s+/).slice(1).join(' ') || 'Unknown';

      const addr = parseShippingAddress(row.shipping_address || row.billing_address || '');

      const searchIndex = buildPatientSearchIndex({
        firstName,
        lastName,
        email,
        phone: '',
        patientId: patientNumber,
      });

      const newPatient = await prisma.patient.create({
        data: {
          patientId: patientNumber,
          clinicId,
          firstName: encryptPHI(firstName) || firstName,
          lastName: encryptPHI(lastName) || lastName,
          email: encryptPHI(email) || email,
          phone: encryptPHI('0000000000') || '0000000000',
          dob: encryptPHI('1900-01-01') || '1900-01-01',
          gender: 'Unknown',
          address1: addr.address || 'Pending',
          address2: addr.address2 || '',
          city: addr.city || 'Pending',
          state: (addr.state || 'NA').toUpperCase(),
          zip: addr.zip || '00000',
          tags: ['wellmedr', 'stub-from-invoice', 'needs-intake-merge', 'csv-invoice-import'],
          notes: `Auto-created from invoice CSV import (${IMPORT_BATCH_ID})`,
          source: 'csv-import',
          profileStatus: 'ACTIVE',
          searchIndex,
          // Don't set stripeCustomerId - may conflict with existing patient records
        },
      });

      matchedPatient = {
        id: newPatient.id,
        patientId: patientNumber,
        email,
        phone: '',
        firstName: firstName.toLowerCase(),
        lastName: lastName.toLowerCase(),
        dob: '1900-01-01',
        createdAt: new Date(),
      };

      // Add to cache
      patientCache.push(matchedPatient);
      result.action = 'patient-created';
    }

    if (!matchedPatient) {
      // Dry run with no existing patient
      result.action = 'patient-created';
      result.hasPrescription = false;
      return result;
    }

    result.patientDbId = matchedPatient.id;
    result.patientNumber = matchedPatient.patientId;

    // Check if this patient has any prescriptions
    const hasRx = patientsWithRx.has(matchedPatient.id);
    result.hasPrescription = hasRx;

    if (!dryRun) {
      // Build invoice data
      const amountInCents = parsePriceToCents(price);
      const productName = buildProductName(product, medicationType, plan);
      const addr = parseShippingAddress(row.shipping_address || row.billing_address || '');
      const paidAt = parsePaymentDate(row.created_at || row.Created);

      // Generate invoice number
      invoiceCounter.count++;
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const invoiceNumber = `WM-${year}${month}-IMP-${String(invoiceCounter.count).padStart(4, '0')}`;

      const invoice = await prisma.invoice.create({
        data: {
          patientId: matchedPatient.id,
          clinicId,
          stripeInvoiceId: null,
          stripeInvoiceNumber: null,
          stripeInvoiceUrl: null,
          stripePdfUrl: null,
          amount: amountInCents,
          amountDue: 0,
          amountPaid: amountInCents,
          currency: 'usd',
          status: 'PAID',
          paidAt,
          dueDate: paidAt,
          description: `${productName} - Payment received`,
          prescriptionProcessed: hasRx, // auto-mark if patient already has Rx
          prescriptionProcessedAt: hasRx ? new Date() : null,
          lineItems: [
            {
              description: productName,
              quantity: 1,
              unitPrice: amountInCents,
              product,
              medicationType,
              plan,
            },
          ],
          metadata: {
            invoiceNumber,
            source: 'wellmedr-csv-import',
            batchId: IMPORT_BATCH_ID,
            ...(hasPm && { stripePaymentMethodId: pmId }),
            ...(hasSubmissionId && { submissionId }),
            stripeCustomerId: row.stripe_customer_id || '',
            stripeSubscriptionId: row.stripe_subscription_id || '',
            stripePriceId: row.stripe_price_id || '',
            paymentIntentId: row.payment_intent_id || '',
            orderStatus: row.order_status || '',
            subscriptionStatus: row.subscription_status || '',
            customerName: name,
            product,
            medicationType,
            plan,
            address: [addr.address, addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
            addressLine1: addr.address,
            addressLine2: addr.address2,
            city: addr.city,
            state: addr.state,
            zipCode: addr.zip,
            paymentDate: paidAt.toISOString(),
            paymentMethod: 'stripe-airtable',
            cardLast4: row.card_last4 || '',
            cardBrand: row.card_brand || '',
            couponCode: row.coupon_code || '',
            totalDiscount: row.total_discount || '',
            processedAt: new Date().toISOString(),
            summary: {
              subtotal: amountInCents,
              discountAmount: 0,
              taxAmount: 0,
              total: amountInCents,
              amountPaid: amountInCents,
              amountDue: 0,
            },
          },
        },
      });

      result.invoiceId = invoice.id;
      result.action = result.action === 'patient-created' ? 'patient-created' : 'created';

      if (hasPm) existingPmIds.add(pmId);
      if (hasSubmissionId) existingSubmissionIds.add(submissionId);
    }
  } catch (err) {
    result.action = 'error';
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ============================================================================
// Notification Phase
// ============================================================================

async function sendProviderNotifications(
  clinicId: number,
  needsRxCount: number,
  dryRun: boolean
): Promise<number> {
  if (dryRun || needsRxCount === 0) return 0;

  let notified = 0;

  try {
    // Find all providers assigned to this clinic
    const providerClinics = await prisma.providerClinic.findMany({
      where: { clinicId, isActive: true },
      select: { provider: { select: { id: true, user: { select: { id: true } } } } },
    });

    const providerUserIds = providerClinics
      .map((pc) => pc.provider.user?.id)
      .filter((id): id is number => id !== undefined && id !== null);

    if (providerUserIds.length === 0) {
      // Fallback: find providers directly on the clinic
      const directProviders = await prisma.provider.findMany({
        where: { clinicId },
        select: { user: { select: { id: true } } },
      });
      providerUserIds.push(
        ...directProviders.map((p) => p.user?.id).filter((id): id is number => id !== undefined && id !== null)
      );
    }

    // Create notification for each provider
    for (const userId of providerUserIds) {
      try {
        await prisma.notification.create({
          data: {
            userId,
            clinicId,
            category: 'PRESCRIPTION',
            priority: 'HIGH',
            title: `${needsRxCount} Patients Need Prescriptions`,
            message: `${needsRxCount} paid invoices from WellMedR import need prescriptions. Please review the Rx Queue.`,
            actionUrl: '/provider/prescription-queue',
            metadata: {
              batchId: IMPORT_BATCH_ID,
              needsRxCount,
              source: 'invoice-csv-import',
            },
            sourceType: 'invoice-csv-import',
            sourceId: IMPORT_BATCH_ID,
          },
        });
        notified++;
      } catch (err) {
        // Duplicate or other error, skip
      }
    }

    // Also notify admins
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        OR: [{ clinicId }, { role: 'SUPER_ADMIN' }],
      },
      select: { id: true },
      take: 20,
    });

    for (const admin of admins) {
      try {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            clinicId,
            category: 'PRESCRIPTION',
            priority: 'NORMAL',
            title: `Invoice Import Complete - ${needsRxCount} Need Rx`,
            message: `Imported WellMedR invoices. ${needsRxCount} patients have paid but don't have prescriptions yet.`,
            actionUrl: '/provider/prescription-queue',
            metadata: {
              batchId: IMPORT_BATCH_ID,
              needsRxCount,
              source: 'invoice-csv-import',
            },
            sourceType: 'invoice-csv-import-admin',
            sourceId: IMPORT_BATCH_ID,
          },
        });
      } catch {
        // Skip duplicates
      }
    }
  } catch (err) {
    console.error('  Notification error:', err instanceof Error ? err.message : err);
  }

  return notified;
}

// ============================================================================
// Main
// ============================================================================

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = !execute;

  const csvIdx = args.indexOf('--csv');
  const csvPath = csvIdx >= 0 && args[csvIdx + 1] ? args[csvIdx + 1] : CSV_PATH;

  const startRowArg = args.includes('--startRow')
    ? args[args.indexOf('--startRow') + 1]
    : undefined;
  const endRowArg = args.includes('--endRow') ? args[args.indexOf('--endRow') + 1] : undefined;
  const startRow = parseOptionalInt(startRowArg);
  const endRow = parseOptionalInt(endRowArg);

  console.log('===============================================================');
  console.log('  WellMedR Invoice CSV Import');
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`  Batch: ${IMPORT_BATCH_ID}`);
  if (startRow != null || endRow != null) {
    console.log(`  Row range: ${startRow ?? 1}–${endRow ?? 'end'}`);
  }
  if (csvPath !== CSV_PATH) {
    console.log(`  CSV: ${csvPath}`);
  }
  console.log('===============================================================\n');

  // Connect
  await prisma.$connect();
  const dbCheck = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
  console.log(`DB connected: ${dbCheck[0]?.now}\n`);

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
    console.error('WellMedR clinic not found!');
    process.exit(1);
  }
  const clinicId = clinic.id;
  console.log(`Clinic: ${clinic.name} (ID=${clinicId})\n`);

  // Phase 1: Parse CSV
  console.log('--- Phase 1: Parse CSV ---');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  let allRows = parseCSV(csvPath);
  const totalBeforeSlice = allRows.length;
  if (startRow != null || endRow != null) {
    const from = startRow != null ? Math.max(1, startRow) - 1 : 0;
    const to = endRow != null ? Math.min(totalBeforeSlice, endRow) : totalBeforeSlice;
    allRows = allRows.slice(from, to);
    console.log(`  Row range applied: data rows ${from + 1}–${to} (${allRows.length} rows)`);
  }
  const succeededRows = allRows.filter(
    (r) => r.payment_status?.trim().toLowerCase() === 'succeeded'
  );
  const failedRows = allRows.filter(
    (r) => r.payment_status?.trim().toLowerCase() === 'failed'
  );
  const pendingRows = allRows.filter(
    (r) => r.payment_status?.trim().toLowerCase() === 'pending'
  );
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Succeeded: ${succeededRows.length} (will import)`);
  console.log(`  Failed: ${failedRows.length} (skip)`);
  console.log(`  Pending: ${pendingRows.length} (skip)`);

  // Phase 2: Load existing data
  console.log('\n--- Phase 2: Load Existing Data ---');
  const patientCache = await loadAllPatients(clinicId);

  // Load existing invoices to check for duplicates by payment_method_id in metadata
  console.log('  Loading existing invoices...');
  const existingInvoices = await prisma.invoice.findMany({
    where: { clinicId },
    select: { id: true, metadata: true },
  });
  const existingPmIds = new Set<string>();
  const existingSubmissionIds = new Set<string>();
  for (const inv of existingInvoices) {
    const meta = inv.metadata as Record<string, unknown> | null;
    const pmId = meta?.stripePaymentMethodId as string | undefined;
    if (pmId) existingPmIds.add(pmId);
    const subId = meta?.submissionId as string | undefined;
    if (subId) existingSubmissionIds.add(String(subId).trim());
  }
  console.log(`  Existing invoices: ${existingInvoices.length}`);
  console.log(`  Unique payment method IDs tracked: ${existingPmIds.size}`);
  console.log(`  Unique submission IDs tracked: ${existingSubmissionIds.size}`);

  // Load patients who have orders with Rx (have prescriptions)
  console.log('  Loading patients with prescriptions...');
  const ordersWithRx = await prisma.order.findMany({
    where: {
      clinicId,
      rxs: { some: {} },
    },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  const patientsWithRx = new Set(ordersWithRx.map((o) => o.patientId));
  console.log(`  Patients with prescriptions: ${patientsWithRx.size}`);

  // Phase 3: Preview matching
  console.log('\n--- Phase 3: Match Preview ---');
  let matchedCount = 0;
  let unmatchedCount = 0;
  let duplicateCount = 0;
  let noPmCount = 0;

  for (const row of succeededRows) {
    const pmId = (row.payment_method_id || '').trim();
    const submissionId = (row.submission_id || '').trim();
    const hasPm = pmId && pmId.startsWith('pm_');
    const hasSubmissionId = submissionId.length > 0;
    if (!hasPm && !hasSubmissionId) {
      noPmCount++;
      continue;
    }
    if (hasPm && existingPmIds.has(pmId)) {
      duplicateCount++;
      continue;
    }
    if (hasSubmissionId && existingSubmissionIds.has(submissionId)) {
      duplicateCount++;
      continue;
    }
    const email = (row.customer_email || '').trim().toLowerCase();
    const match = findPatientByEmail(email, patientCache);
    if (match) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }
  }

  console.log(`  Will match to existing patient: ${matchedCount}`);
  console.log(`  Will create stub patient: ${unmatchedCount}`);
  console.log(`  Already in DB (duplicate): ${duplicateCount}`);
  console.log(`  No PM ID or submission ID skipped: ${noPmCount}`);
  console.log(`  Invoices to create: ${matchedCount + unmatchedCount}`);

  // Phase 4: Execute
  console.log(`\n--- Phase 4: ${dryRun ? 'DRY RUN Summary' : 'Execute Import'} ---`);

  if (dryRun) {
    // Estimate prescription queue impact
    let needsRx = 0;
    let hasRx = 0;
    for (const row of succeededRows) {
      const pmId = (row.payment_method_id || '').trim();
      const submissionId = (row.submission_id || '').trim();
      const hasPm = pmId && pmId.startsWith('pm_');
      const hasSub = submissionId.length > 0;
      if ((!hasPm && !hasSub) || (hasPm && existingPmIds.has(pmId)) || (hasSub && existingSubmissionIds.has(submissionId))) continue;
      const email = (row.customer_email || '').trim().toLowerCase();
      const match = findPatientByEmail(email, patientCache);
      if (match && patientsWithRx.has(match.id)) {
        hasRx++;
      } else {
        needsRx++;
      }
    }

    console.log('\n  DRY RUN SUMMARY:');
    console.log(`    Invoices to create: ${matchedCount + unmatchedCount}`);
    console.log(`    Stub patients to create: ${unmatchedCount}`);
    console.log(`    Already have prescriptions: ${hasRx}`);
    console.log(`    NEED prescriptions (will appear in Rx Queue): ${needsRx}`);
    console.log(`    Duplicates skipped: ${duplicateCount}`);
    console.log(`    No PM ID skipped: ${noPmCount}`);
    console.log('\n  Run with --execute to apply.');
  } else {
    const results: ImportResult[] = [];
    const invoiceCounter = { count: 0 };
    let processed = 0;

    for (let i = 0; i < succeededRows.length; i += BATCH_SIZE) {
      const batch = succeededRows.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((row) =>
          importInvoice(row, clinicId, patientCache, existingPmIds, existingSubmissionIds, patientsWithRx, false, invoiceCounter)
        )
      );

      results.push(...batchResults);
      processed += batch.length;

      const created = batchResults.filter((r) => r.action === 'created' || r.action === 'patient-created').length;
      const dupes = batchResults.filter((r) => r.action === 'skipped-duplicate').length;
      const errors = batchResults.filter((r) => r.action === 'error').length;

      console.log(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${created} created, ${dupes} dupes, ${errors} errors [${processed}/${succeededRows.length}]`
      );

      if (errors > 0) {
        for (const r of batchResults.filter((r) => r.action === 'error')) {
          console.error(`    ERR ${r.email}: ${r.error}`);
        }
      }

      if (i + BATCH_SIZE < succeededRows.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Totals
    const totalCreated = results.filter((r) => r.action === 'created').length;
    const totalPatientCreated = results.filter((r) => r.action === 'patient-created').length;
    const totalDupes = results.filter((r) => r.action === 'skipped-duplicate').length;
    const totalNoPm = results.filter((r) => r.action === 'skipped-no-pm').length;
    const totalErrors = results.filter((r) => r.action === 'error').length;
    const needsRx = results.filter(
      (r) => (r.action === 'created' || r.action === 'patient-created') && !r.hasPrescription
    ).length;
    const alreadyHasRx = results.filter(
      (r) => (r.action === 'created' || r.action === 'patient-created') && r.hasPrescription
    ).length;

    // Phase 5: Notifications
    console.log('\n--- Phase 5: Provider Notifications ---');
    const notified = await sendProviderNotifications(clinicId, needsRx, false);
    console.log(`  Notified ${notified} providers/admins`);

    console.log('\n===============================================================');
    console.log('  IMPORT COMPLETE');
    console.log('===============================================================');
    console.log(`  Invoices created:          ${totalCreated + totalPatientCreated}`);
    console.log(`    - Matched existing patient: ${totalCreated}`);
    console.log(`    - New stub patient created:  ${totalPatientCreated}`);
    console.log(`  Already had Rx (auto-marked): ${alreadyHasRx}`);
    console.log(`  NEEDS Rx (in Provider Queue): ${needsRx}`);
    console.log(`  Duplicates skipped:           ${totalDupes}`);
    console.log(`  No PM ID skipped:             ${totalNoPm}`);
    console.log(`  Errors:                       ${totalErrors}`);
    console.log(`  Provider notifications sent:  ${notified}`);

    // Needs-Rx report
    if (needsRx > 0) {
      console.log(`\n  --- Patients Needing Prescriptions (${needsRx}) ---`);
      const needsRxList = results
        .filter((r) => (r.action === 'created' || r.action === 'patient-created') && !r.hasPrescription)
        .slice(0, 30);
      for (const r of needsRxList) {
        console.log(`    ${r.name || r.email} | ${r.product} ${r.plan} | ${r.price} | Invoice #${r.invoiceId}`);
      }
      if (needsRx > 30) {
        console.log(`    ... and ${needsRx - 30} more (see report file)`);
      }
    }

    if (totalErrors > 0) {
      console.log('\n  Errors:');
      for (const r of results.filter((r) => r.action === 'error').slice(0, 20)) {
        console.log(`    ${r.email}: ${r.error}`);
      }
    }

    // Save report
    const report = {
      batchId: IMPORT_BATCH_ID,
      timestamp: new Date().toISOString(),
      clinicId,
      totalCSVRows: allRows.length,
      succeededPayments: succeededRows.length,
      results: {
        invoicesCreated: totalCreated + totalPatientCreated,
        matchedExisting: totalCreated,
        stubPatientsCreated: totalPatientCreated,
        alreadyHasRx: alreadyHasRx,
        needsRx: needsRx,
        duplicatesSkipped: totalDupes,
        noPmSkipped: totalNoPm,
        errors: totalErrors,
        notificationsSent: notified,
      },
      needsRx: results
        .filter((r) => (r.action === 'created' || r.action === 'patient-created') && !r.hasPrescription)
        .map((r) => ({
          email: r.email,
          name: r.name,
          product: r.product,
          plan: r.plan,
          price: r.price,
          invoiceId: r.invoiceId,
          patientDbId: r.patientDbId,
          patientNumber: r.patientNumber,
        })),
      errors: results
        .filter((r) => r.action === 'error')
        .map((r) => ({ email: r.email, error: r.error })),
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n  Report: ${REPORT_PATH}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  prisma.$disconnect();
  process.exit(1);
});
