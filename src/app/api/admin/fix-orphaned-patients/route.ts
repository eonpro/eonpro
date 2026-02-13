import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Fix Orphaned Patients - DEPRECATED
 *
 * POST/GET /api/admin/fix-orphaned-patients
 *
 * NOTE: This endpoint is now DEPRECATED because Patient.clinicId is a required field
 * in the schema (NOT NULL constraint). All patients must belong to a clinic at creation time.
 *
 * The database constraint prevents orphaned patients from being created, so this
 * migration script is no longer needed. It's kept for backwards compatibility but
 * will always return 0 orphaned patients.
 *
 * Requires X-Webhook-Secret header for authentication
 */

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Since Patient.clinicId is now required (NOT NULL), there cannot be orphaned patients
    // The database constraint prevents null clinicId values
    logger.info('[FIX ORPHANED] Endpoint called - no action needed (clinicId is now required)');

    return NextResponse.json({
      success: true,
      message: 'No orphaned patients - clinicId is required in current schema',
      fixed: 0,
      note: 'This endpoint is deprecated. Patient.clinicId is now a required field (NOT NULL) in the database schema.',
    });
  } catch (error) {
    logger.error('[FIX ORPHANED] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET - Show orphaned patients status
export async function GET(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Since Patient.clinicId is now required (NOT NULL), there cannot be orphaned patients
    // Get total patient count for reference
    const totalPatients = await prisma.patient.count();

    return NextResponse.json({
      orphanedCount: 0,
      patients: [],
      totalPatients,
      note: 'This endpoint is deprecated. Patient.clinicId is now a required field (NOT NULL) in the database schema. No orphaned patients are possible.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
