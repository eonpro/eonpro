/**
 * Overtime Men's Clinic - Single Table Sync API
 *
 * Endpoints for syncing a specific Airtable table.
 *
 * POST /api/integrations/overtime/sync/[tableId] - Sync specific table
 * GET /api/integrations/overtime/sync/[tableId] - Get table info
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSyncService } from '@/lib/overtime/airtableSyncService';
import { 
  OVERTIME_AIRTABLE_TABLES, 
  getTreatmentTypeForTable,
  createAirtableClient,
} from '@/lib/overtime/airtableClient';

// =============================================================================
// Authentication
// =============================================================================

function validateAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');

  const validApiKey = process.env.OVERTIME_SYNC_API_KEY;
  const validCronSecret = process.env.CRON_SECRET;

  if (authHeader?.startsWith('Bearer ') && validApiKey) {
    return authHeader.slice(7) === validApiKey;
  }

  if (cronSecret && validCronSecret) {
    return cronSecret === validCronSecret;
  }

  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// =============================================================================
// POST - Sync Single Table
// =============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  if (!validateAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tableId } = await params;

  // Validate table ID
  const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.id === tableId);
  if (!table) {
    return NextResponse.json(
      {
        error: 'Invalid table ID',
        validTables: OVERTIME_AIRTABLE_TABLES.map((t) => ({ id: t.id, name: t.name })),
      },
      { status: 400 }
    );
  }

  try {
    // Parse optional body - use defaults if empty/invalid
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty or invalid JSON is OK - use defaults
    }

    const syncService = createSyncService();
    const result = await syncService.syncTable(tableId, table.treatmentType, {
      dryRun: body.dryRun === true,
      maxRecordsPerTable: body.maxRecords,
      markAsSynced: body.markAsSynced === true,
      syncStatusField: body.syncStatusField,
      since: body.since ? new Date(body.since) : undefined,
    });

    return NextResponse.json({
      success: true,
      table: {
        id: table.id,
        name: table.name,
        treatmentType: table.treatmentType,
      },
      result: {
        recordsProcessed: result.recordsProcessed,
        successCount: result.recordIds.length,
        errorCount: result.errors.length,
        recordIds: result.recordIds,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    });
  } catch (error) {
    console.error(`[OvertimeSync] Table sync failed for ${tableId}:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET - Table Info & Sample Records
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  if (!validateAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tableId } = await params;

  // Validate table ID
  const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.id === tableId);
  if (!table) {
    return NextResponse.json(
      {
        error: 'Invalid table ID',
        validTables: OVERTIME_AIRTABLE_TABLES.map((t) => ({ id: t.id, name: t.name })),
      },
      { status: 400 }
    );
  }

  try {
    const client = createAirtableClient();

    // Fetch a few sample records to show structure
    const sampleRecords = await client.listRecords(tableId, {
      maxRecords: 3,
      pageSize: 3,
    });

    // Get field names from first record
    const fieldNames = sampleRecords.records.length > 0
      ? Object.keys(sampleRecords.records[0].fields)
      : [];

    return NextResponse.json({
      table: {
        id: table.id,
        name: table.name,
        treatmentType: table.treatmentType,
      },
      fieldNames,
      sampleCount: sampleRecords.records.length,
      // Show sanitized sample (no PHI)
      sampleRecords: sampleRecords.records.map((r) => ({
        id: r.id,
        createdTime: r.createdTime,
        fieldCount: Object.keys(r.fields).length,
        // Only show non-PHI fields for preview
        preview: {
          responseId: r.fields['Response ID'],
          state: r.fields['State'],
          treatmentType: table.treatmentType,
        },
      })),
    });
  } catch (error) {
    console.error(`[OvertimeSync] Table info failed for ${tableId}:`, error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch table info',
      },
      { status: 500 }
    );
  }
}
