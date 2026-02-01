/**
 * Overtime Men's Clinic - Airtable Sync API
 *
 * Endpoints for syncing intake data from Airtable to EONPRO.
 * Can be triggered manually or via cron job.
 *
 * POST /api/integrations/overtime/sync - Trigger a sync
 * GET /api/integrations/overtime/sync - Get sync status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSyncService } from '@/lib/overtime/airtableSyncService';
import type { SyncOptions } from '@/lib/overtime/airtableSyncService';
import { OVERTIME_AIRTABLE_TABLES } from '@/lib/overtime/airtableClient';
import { OVERTIME_TREATMENT_TYPES } from '@/lib/overtime/treatmentTypes';
import type { OvertimeTreatmentType } from '@/lib/overtime/types';

// =============================================================================
// Authentication
// =============================================================================

function validateAuth(req: NextRequest): boolean {
  // Check for API key or cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');

  // Validate against environment variables
  const validApiKey = process.env.OVERTIME_SYNC_API_KEY;
  const validCronSecret = process.env.CRON_SECRET;

  if (authHeader?.startsWith('Bearer ') && validApiKey) {
    return authHeader.slice(7) === validApiKey;
  }

  if (cronSecret && validCronSecret) {
    return cronSecret === validCronSecret;
  }

  // In development, allow unauthenticated requests
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// =============================================================================
// POST - Trigger Sync
// =============================================================================

export async function POST(req: NextRequest) {
  // Validate authentication
  if (!validateAuth(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Parse request body for sync options
    const body = await req.json().catch(() => ({}));

    const options: SyncOptions = {
      dryRun: body.dryRun === true,
      maxRecordsPerTable: body.maxRecordsPerTable,
      markAsSynced: body.markAsSynced === true,
      syncStatusField: body.syncStatusField,
    };

    // Filter by treatment types if specified
    if (body.treatmentTypes && Array.isArray(body.treatmentTypes)) {
      const validTypes = Object.values(OVERTIME_TREATMENT_TYPES);
      options.treatmentTypes = body.treatmentTypes.filter((t: string) =>
        validTypes.includes(t as OvertimeTreatmentType)
      );
    }

    // Filter by since date if specified
    if (body.since) {
      const sinceDate = new Date(body.since);
      if (!isNaN(sinceDate.getTime())) {
        options.since = sinceDate;
      }
    }

    // Create sync service and run sync
    const syncService = createSyncService();
    const summary = await syncService.syncAll(options);

    return NextResponse.json({
      success: true,
      summary: {
        startedAt: summary.startedAt.toISOString(),
        completedAt: summary.completedAt.toISOString(),
        durationMs: summary.completedAt.getTime() - summary.startedAt.getTime(),
        totalRecords: summary.totalRecords,
        successCount: summary.successCount,
        errorCount: summary.errorCount,
        skippedCount: summary.skippedCount,
      },
      results: summary.results.map((r) => ({
        table: r.table,
        treatmentType: r.treatmentType,
        recordsProcessed: r.recordsProcessed,
        successCount: r.recordIds.length,
        errorCount: r.errors.length,
        errors: r.errors.length > 0 ? r.errors : undefined,
      })),
    });
  } catch (error) {
    console.error('[OvertimeSync] Sync failed:', error);

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
// GET - Sync Status & Configuration
// =============================================================================

export async function GET(req: NextRequest) {
  // Validate authentication
  if (!validateAuth(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Check if Airtable is configured
    const isConfigured = !!process.env.AIRTABLE_API_KEY;

    return NextResponse.json({
      status: isConfigured ? 'configured' : 'not_configured',
      tables: OVERTIME_AIRTABLE_TABLES.map((t) => ({
        id: t.id,
        name: t.name,
        treatmentType: t.treatmentType,
      })),
      configuration: {
        baseId: process.env.OVERTIME_AIRTABLE_BASE_ID || 'apppl0Heha1sOti59',
        hasApiKey: !!process.env.AIRTABLE_API_KEY,
        hasClinicId: !!process.env.OVERTIME_CLINIC_ID,
      },
      usage: {
        endpoint: 'POST /api/integrations/overtime/sync',
        headers: {
          'Authorization': 'Bearer <OVERTIME_SYNC_API_KEY>',
          'Content-Type': 'application/json',
        },
        body: {
          dryRun: 'boolean (optional) - Preview without creating patients',
          treatmentTypes: 'string[] (optional) - Filter by treatment types',
          maxRecordsPerTable: 'number (optional) - Limit records per table',
          since: 'ISO date string (optional) - Only sync records after this date',
          markAsSynced: 'boolean (optional) - Update Airtable records with sync status',
          syncStatusField: 'string (optional) - Airtable field name for sync tracking',
        },
        treatmentTypes: Object.values(OVERTIME_TREATMENT_TYPES),
      },
    });
  } catch (error) {
    console.error('[OvertimeSync] Status check failed:', error);

    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    );
  }
}
