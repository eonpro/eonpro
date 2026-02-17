/**
 * Sync WellMedR Patient Addresses from Airtable
 * ================================================
 *
 * POST /api/admin/sync-wellmedr-addresses
 *
 * Fetches shipping addresses from the WellMedR Airtable Orders table and
 * updates patient records that are currently missing address data.
 *
 * Two-phase approach:
 *   Phase 1: Backfill from invoice metadata (no external deps)
 *   Phase 2: Backfill from Airtable Orders table (requires API key)
 *
 * Query params:
 *   - dryRun: "true" to preview changes without saving (default: true)
 *   - source: "metadata" | "airtable" | "both" (default: "both")
 *   - limit: Max patients to process (default: 500)
 *
 * Required env vars (for Airtable source):
 *   - AIRTABLE_API_KEY: Personal Access Token with data.records:read scope
 *
 * Known Airtable identifiers:
 *   - Base ID: app3usm1VtzcWOvZW
 *   - Orders Table ID: tblDO00gC6FZianoF
 *
 * @module api/admin/sync-wellmedr-addresses
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import {
  parseAddressString,
  normalizeState,
  normalizeZip,
} from '@/lib/address';

const WELLMEDR_CLINIC_ID = 7;
const WELLMEDR_AIRTABLE_BASE_ID = 'app3usm1VtzcWOvZW';
const WELLMEDR_AIRTABLE_ORDERS_TABLE_ID = 'tblDO00gC6FZianoF';
const DEFAULT_LIMIT = 500;
const AIRTABLE_PAGE_SIZE = 100;

interface SyncResult {
  patientId: number;
  email: string;
  source: 'metadata' | 'airtable';
  addressBefore: string;
  addressAfter: string;
  status: 'updated' | 'skipped' | 'error';
  reason?: string;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

function safeDecrypt(value: unknown): string {
  if (value == null || value === '') return '';
  try {
    return decryptPHI(String(value));
  } catch {
    return '';
  }
}

function formatAddress(a1: string, a2: string, city: string, state: string, zip: string): string {
  return [a1, a2, city, state, zip].filter(Boolean).join(', ') || '(empty)';
}

/**
 * Phase 1: Backfill addresses from invoice metadata.
 * The wellmedr-invoice webhook stores address data in invoice.metadata
 * when it receives shipping_address from the Airtable automation.
 */
async function backfillFromInvoiceMetadata(
  patientsWithoutAddresses: Array<{ id: number; email: string }>,
  dryRun: boolean,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const patient of patientsWithoutAddresses) {
    const invoices = await prisma.invoice.findMany({
      where: {
        patientId: patient.id,
        clinicId: WELLMEDR_CLINIC_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, metadata: true },
      take: 5,
    });

    let foundAddress = false;

    for (const invoice of invoices) {
      const meta = invoice.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      const addr1 = String(meta.addressLine1 || meta.address_line1 || '').trim();
      const addr2 = String(meta.addressLine2 || meta.address_line2 || '').trim();
      const city = String(meta.city || '').trim();
      const state = String(meta.state || '').trim();
      const zip = String(meta.zipCode || meta.zip || '').trim();

      // If metadata has a combined address string, try parsing it
      let finalAddr1 = addr1;
      let finalAddr2 = addr2;
      let finalCity = city;
      let finalState = state;
      let finalZip = zip;

      if (!finalCity && !finalState && !finalZip) {
        const rawAddress = String(meta.address || '').trim();
        if (rawAddress && rawAddress.includes(',')) {
          const parsed = parseAddressString(rawAddress);
          finalAddr1 = parsed.address1 || finalAddr1;
          finalAddr2 = parsed.address2 || finalAddr2;
          finalCity = parsed.city || finalCity;
          finalState = parsed.state || finalState;
          finalZip = parsed.zip || finalZip;
        }
      }

      if (!finalAddr1 && !finalCity && !finalZip) continue;

      const normalizedState = finalState ? normalizeState(finalState) : '';
      const normalizedZip = finalZip ? normalizeZip(finalZip) : '';

      if (!dryRun) {
        const updateData: Record<string, string> = {};
        if (finalAddr1) updateData.address1 = finalAddr1;
        if (finalAddr2) updateData.address2 = finalAddr2;
        if (finalCity) updateData.city = finalCity;
        if (normalizedState) updateData.state = normalizedState;
        if (normalizedZip) updateData.zip = normalizedZip;

        await prisma.patient.update({
          where: { id: patient.id },
          data: updateData,
        });
      }

      results.push({
        patientId: patient.id,
        email: patient.email,
        source: 'metadata',
        addressBefore: '(empty)',
        addressAfter: formatAddress(finalAddr1, finalAddr2, finalCity, normalizedState, normalizedZip),
        status: 'updated',
      });

      foundAddress = true;
      break;
    }

    if (!foundAddress) {
      results.push({
        patientId: patient.id,
        email: patient.email,
        source: 'metadata',
        addressBefore: '(empty)',
        addressAfter: '(empty)',
        status: 'skipped',
        reason: 'No address data in invoice metadata',
      });
    }
  }

  return results;
}

/**
 * Fetch all Orders records from Airtable that have a shipping_address and email.
 */
async function fetchAirtableOrders(
  apiKey: string,
  limit: number,
): Promise<AirtableRecord[]> {
  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${WELLMEDR_AIRTABLE_BASE_ID}/${WELLMEDR_AIRTABLE_ORDERS_TABLE_ID}`,
    );
    url.searchParams.append('fields[]', 'customer_email');
    url.searchParams.append('fields[]', 'shipping_address');
    url.searchParams.append('fields[]', 'billing_address');
    url.searchParams.append(
      'filterByFormula',
      'AND({customer_email} != "", OR({shipping_address} != "", {billing_address} != ""))',
    );
    url.searchParams.append('pageSize', String(AIRTABLE_PAGE_SIZE));
    if (offset) url.searchParams.append('offset', offset);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Airtable API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as AirtableResponse;
    allRecords.push(...data.records);
    offset = data.offset;

    if (allRecords.length >= limit) break;
  } while (offset);

  return allRecords.slice(0, limit);
}

/**
 * Phase 2: Backfill addresses from Airtable Orders table.
 */
async function backfillFromAirtable(
  patientsWithoutAddresses: Array<{ id: number; email: string }>,
  dryRun: boolean,
): Promise<{ results: SyncResult[]; airtableError?: string }> {
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!apiKey) {
    return {
      results: [],
      airtableError:
        'Missing AIRTABLE_API_KEY environment variable. ' +
        'Set this in Vercel to enable Airtable address sync.',
    };
  }

  const results: SyncResult[] = [];

  let airtableRecords: AirtableRecord[];
  try {
    airtableRecords = await fetchAirtableOrders(apiKey, 1000);
  } catch (err) {
    return {
      results: [],
      airtableError: `Failed to fetch from Airtable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Build email→address map from Airtable (most recent record wins via last-write)
  const emailToAddress = new Map<string, string>();
  for (const record of airtableRecords) {
    const email = String(
      record.fields.customer_email || record.fields.email || '',
    )
      .toLowerCase()
      .trim();
    const address = String(
      record.fields.shipping_address || record.fields.billing_address || '',
    ).trim();
    if (email && address) {
      emailToAddress.set(email, address);
    }
  }

  for (const patient of patientsWithoutAddresses) {
    const rawAddress = emailToAddress.get(patient.email.toLowerCase());
    if (!rawAddress) {
      results.push({
        patientId: patient.id,
        email: patient.email,
        source: 'airtable',
        addressBefore: '(empty)',
        addressAfter: '(empty)',
        status: 'skipped',
        reason: 'No matching Airtable record with address',
      });
      continue;
    }

    let parsed;
    if (rawAddress.trim().startsWith('{')) {
      try {
        const jsonAddr = JSON.parse(rawAddress);
        parsed = {
          address1: String(jsonAddr.address || jsonAddr.street || '').trim(),
          address2: String(jsonAddr.apartment || jsonAddr.apt || jsonAddr.suite || '').trim(),
          city: String(jsonAddr.city || '').trim(),
          state: normalizeState(String(jsonAddr.state || '')),
          zip: normalizeZip(String(jsonAddr.zipCode || jsonAddr.zip || jsonAddr.postalCode || '')),
        };
      } catch {
        parsed = parseAddressString(rawAddress);
      }
    } else {
      parsed = parseAddressString(rawAddress);
    }

    if (!parsed.address1 && !parsed.city && !parsed.zip) {
      results.push({
        patientId: patient.id,
        email: patient.email,
        source: 'airtable',
        addressBefore: '(empty)',
        addressAfter: '(empty)',
        status: 'skipped',
        reason: `Could not parse address: "${rawAddress.substring(0, 60)}"`,
      });
      continue;
    }

    const normalizedState = parsed.state ? normalizeState(parsed.state) : '';
    const normalizedZip = parsed.zip ? normalizeZip(parsed.zip) : '';

    if (!dryRun) {
      const updateData: Record<string, string> = {};
      if (parsed.address1) updateData.address1 = parsed.address1;
      if (parsed.address2) updateData.address2 = parsed.address2;
      if (parsed.city) updateData.city = parsed.city;
      if (normalizedState) updateData.state = normalizedState;
      if (normalizedZip) updateData.zip = normalizedZip;

      await prisma.patient.update({
        where: { id: patient.id },
        data: updateData,
      });
    }

    results.push({
      patientId: patient.id,
      email: patient.email,
      source: 'airtable',
      addressBefore: '(empty)',
      addressAfter: formatAddress(
        parsed.address1,
        parsed.address2,
        parsed.city,
        normalizedState,
        normalizedZip,
      ),
      status: 'updated',
    });
  }

  return { results };
}

async function runSync(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dryRun') !== 'false';
  const source = searchParams.get('source') || 'both';
  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit), 2000);

  logger.info('[SYNC-ADDRESSES] Starting WellMedR address sync', {
    dryRun,
    source,
    limit,
  });

  try {
    // Find WellMedR patients with missing address data
    const patientsRaw = await prisma.patient.findMany({
      where: {
        clinicId: WELLMEDR_CLINIC_ID,
        OR: [
          { address1: null },
          { address1: '' },
          { city: null },
          { city: '' },
          { zip: null },
          { zip: '' },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        address1: true,
        city: true,
        state: true,
        zip: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Decrypt emails for matching
    const patients = patientsRaw.map((p) => ({
      id: p.id,
      email: safeDecrypt(p.email),
      name: `${safeDecrypt(p.firstName)} ${safeDecrypt(p.lastName)}`.trim(),
      currentAddress: formatAddress(
        safeDecrypt(p.address1),
        '',
        safeDecrypt(p.city),
        safeDecrypt(p.state),
        safeDecrypt(p.zip),
      ),
    }));

    // Filter to only patients with genuinely empty addresses
    const patientsWithoutAddresses = patients.filter(
      (p) => p.currentAddress === '(empty)',
    );

    logger.info('[SYNC-ADDRESSES] Found patients without addresses', {
      total: patients.length,
      withoutAddresses: patientsWithoutAddresses.length,
    });

    const allResults: SyncResult[] = [];
    let airtableError: string | undefined;

    // Phase 1: Invoice metadata
    if (source === 'metadata' || source === 'both') {
      const metadataResults = await backfillFromInvoiceMetadata(
        patientsWithoutAddresses,
        dryRun,
      );
      allResults.push(...metadataResults);
    }

    // Determine which patients still need addresses after Phase 1
    const updatedByMetadata = new Set(
      allResults.filter((r) => r.status === 'updated').map((r) => r.patientId),
    );
    const stillMissing = patientsWithoutAddresses.filter(
      (p) => !updatedByMetadata.has(p.id),
    );

    // Phase 2: Airtable
    if ((source === 'airtable' || source === 'both') && stillMissing.length > 0) {
      const airtableResult = await backfillFromAirtable(stillMissing, dryRun);
      allResults.push(...airtableResult.results);
      airtableError = airtableResult.airtableError;
    }

    // Summarize
    const updated = allResults.filter((r) => r.status === 'updated');
    const skipped = allResults.filter((r) => r.status === 'skipped');
    const errors = allResults.filter((r) => r.status === 'error');
    const fromMetadata = updated.filter((r) => r.source === 'metadata');
    const fromAirtable = updated.filter((r) => r.source === 'airtable');

    const summary = {
      dryRun,
      source,
      totalPatientsInClinic: patients.length,
      patientsWithoutAddresses: patientsWithoutAddresses.length,
      updated: updated.length,
      updatedFromMetadata: fromMetadata.length,
      updatedFromAirtable: fromAirtable.length,
      skipped: skipped.length,
      errors: errors.length,
      airtableError,
    };

    logger.info('[SYNC-ADDRESSES] Sync complete', summary);

    return NextResponse.json({
      success: true,
      summary,
      results: allResults.slice(0, 50),
      ...(dryRun
        ? { note: 'Dry run - no changes saved. Set ?dryRun=false to apply.' }
        : {}),
    });
  } catch (error) {
    logger.error('[SYNC-ADDRESSES] Sync failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// GET: browser-friendly access (always dry run for safety)
export const GET = withAdminAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  // GET always forces dryRun unless explicitly set to false
  if (!url.searchParams.has('dryRun')) {
    url.searchParams.set('dryRun', 'true');
  }
  return runSync(new NextRequest(url, { method: 'GET', headers: req.headers }));
});

// POST: programmatic access (respects dryRun param)
export const POST = withAdminAuth(async (req: NextRequest) => {
  return runSync(req);
});
