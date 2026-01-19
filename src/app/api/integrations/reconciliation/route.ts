/**
 * Reconciliation Report Endpoint
 * 
 * Phase 4: Bi-directional Sync
 * 
 * Compares records between Airtable and EONPRO to find mismatches.
 * 
 * POST /api/integrations/reconciliation
 * 
 * Body:
 * {
 *   "airtableRecords": [
 *     { "email": "...", "airtableId": "recXXX", "syncedAt": "..." },
 *     ...
 *   ]
 * }
 * 
 * Returns which records exist in EONPRO and which are missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Simple auth for this endpoint
const INTEGRATION_SECRET = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

interface AirtableRecord {
  email: string;
  airtableId: string;
  eonproPatientId?: number;
  syncedAt?: string;
}

export async function POST(req: NextRequest) {
  const requestId = `reconcile-${Date.now()}`;
  
  // Verify authentication
  const providedSecret = 
    req.headers.get('x-api-key') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!INTEGRATION_SECRET || providedSecret !== INTEGRATION_SECRET) {
    logger.warn(`[Reconcile ${requestId}] Unauthorized access attempt`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const airtableRecords: AirtableRecord[] = body.airtableRecords || [];

    if (!Array.isArray(airtableRecords) || airtableRecords.length === 0) {
      return NextResponse.json({
        error: 'Invalid request',
        message: 'airtableRecords must be a non-empty array',
      }, { status: 400 });
    }

    // Limit batch size
    if (airtableRecords.length > 500) {
      return NextResponse.json({
        error: 'Batch too large',
        message: 'Maximum 500 records per request',
      }, { status: 400 });
    }

    logger.info(`[Reconcile ${requestId}] Processing ${airtableRecords.length} records`);

    // Get all emails to check
    const emails = airtableRecords
      .map(r => r.email?.toLowerCase())
      .filter(Boolean);

    // Fetch all matching patients from EONPRO
    const eonproPatients = await prisma.patient.findMany({
      where: {
        email: { in: emails },
        clinic: { subdomain: 'eonmeds' },
      },
      select: {
        id: true,
        patientId: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
        sourceMetadata: true,
      },
    });

    // Create lookup map
    const eonproByEmail = new Map(
      eonproPatients.map(p => [p.email?.toLowerCase(), p])
    );

    // Process each Airtable record
    const results = {
      synced: [] as Array<{
        airtableId: string;
        email: string;
        eonproPatientId: number;
        eonproPatientNumber: string;
        match: 'exact' | 'email_only';
      }>,
      missing: [] as Array<{
        airtableId: string;
        email: string;
        reason: string;
      }>,
      mismatch: [] as Array<{
        airtableId: string;
        email: string;
        airtableEonproId: number | undefined;
        actualEonproId: number;
        reason: string;
      }>,
    };

    for (const record of airtableRecords) {
      const email = record.email?.toLowerCase();
      
      if (!email) {
        results.missing.push({
          airtableId: record.airtableId,
          email: record.email || '',
          reason: 'No email provided',
        });
        continue;
      }

      const eonproPatient = eonproByEmail.get(email);

      if (!eonproPatient) {
        // Patient not in EONPRO
        results.missing.push({
          airtableId: record.airtableId,
          email,
          reason: 'Patient not found in EONPRO',
        });
      } else if (record.eonproPatientId && record.eonproPatientId !== eonproPatient.id) {
        // ID mismatch
        results.mismatch.push({
          airtableId: record.airtableId,
          email,
          airtableEonproId: record.eonproPatientId,
          actualEonproId: eonproPatient.id,
          reason: 'EONPRO Patient ID mismatch',
        });
      } else {
        // Synced correctly
        results.synced.push({
          airtableId: record.airtableId,
          email,
          eonproPatientId: eonproPatient.id,
          eonproPatientNumber: eonproPatient.patientId,
          match: record.eonproPatientId ? 'exact' : 'email_only',
        });
      }
    }

    const summary = {
      total: airtableRecords.length,
      synced: results.synced.length,
      missing: results.missing.length,
      mismatch: results.mismatch.length,
      syncRate: ((results.synced.length / airtableRecords.length) * 100).toFixed(1) + '%',
    };

    logger.info(`[Reconcile ${requestId}] Complete`, summary);

    return NextResponse.json({
      requestId,
      timestamp: new Date().toISOString(),
      summary,
      results,
    });
  } catch (err) {
    logger.error(`[Reconcile ${requestId}] Error:`, err);
    return NextResponse.json({
      error: 'Reconciliation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET endpoint to retrieve recent sync status
 */
export async function GET(req: NextRequest) {
  const requestId = `reconcile-status-${Date.now()}`;
  
  // Verify authentication
  const providedSecret = 
    req.headers.get('x-api-key') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!INTEGRATION_SECRET || providedSecret !== INTEGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hoursParam = req.nextUrl.searchParams.get('hours') || '24';
    const hours = parseInt(hoursParam, 10) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get recent patients from EONMEDS clinic
    const recentPatients = await prisma.patient.findMany({
      where: {
        clinic: { subdomain: 'eonmeds' },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        patientId: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        sourceMetadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      requestId,
      timestamp: new Date().toISOString(),
      period: {
        hours,
        since: since.toISOString(),
      },
      stats: {
        totalPatients: recentPatients.length,
      },
      patients: recentPatients.map(p => ({
        eonproPatientId: p.id,
        eonproPatientNumber: p.patientId,
        email: p.email,
        name: `${p.firstName} ${p.lastName}`,
        createdAt: p.createdAt,
        submissionId: (p.sourceMetadata as Record<string, unknown>)?.submissionId || null,
      })),
    });
  } catch (err) {
    logger.error(`[Reconcile ${requestId}] Error:`, err);
    return NextResponse.json({
      error: 'Failed to retrieve sync status',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
