/**
 * Verify EONPRO Sync Endpoint
 *
 * Phase 4: Bi-directional Sync
 *
 * Allows WeightLossIntake to verify that a patient was successfully
 * synced to EONPRO and retrieve their EONPRO Patient ID.
 *
 * GET /api/integrations/verify-sync?email=patient@example.com
 * GET /api/integrations/verify-sync?submissionId=eonmeds-abc123
 * GET /api/integrations/verify-sync?patientId=130
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Simple auth for this endpoint - shared secret
const INTEGRATION_SECRET = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

export async function GET(req: NextRequest) {
  const requestId = `verify-${Date.now()}`;

  // Verify authentication
  const providedSecret =
    req.headers.get('x-api-key') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!INTEGRATION_SECRET || providedSecret !== INTEGRATION_SECRET) {
    logger.warn(`[Verify ${requestId}] Unauthorized access attempt`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get('email');
  const submissionId = req.nextUrl.searchParams.get('submissionId');
  const patientId = req.nextUrl.searchParams.get('patientId');

  if (!email && !submissionId && !patientId) {
    return NextResponse.json(
      {
        error: 'Missing query parameter',
        message: 'Provide email, submissionId, or patientId',
      },
      { status: 400 }
    );
  }

  try {
    let patient = null;

    // Search by different criteria
    if (patientId) {
      patient = await prisma.patient.findFirst({
        where: {
          OR: [{ id: parseInt(patientId, 10) || 0 }, { patientId: patientId }],
        },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          sourceMetadata: true,
        },
      });
    } else if (email) {
      patient = await prisma.patient.findFirst({
        where: {
          email: email.toLowerCase(),
          clinic: { subdomain: 'eonmeds' },
        },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          sourceMetadata: true,
        },
      });
    } else if (submissionId) {
      // Search in sourceMetadata for submissionId
      const patients = await prisma.patient.findMany({
        where: {
          clinic: { subdomain: 'eonmeds' },
        },
        select: {
          id: true,
          patientId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          sourceMetadata: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit search scope
      });

      // Find patient with matching submissionId
      type PatientWithMeta = (typeof patients)[number];
      patient =
        patients.find((p: PatientWithMeta) => {
          const meta = p.sourceMetadata as Record<string, unknown> | null;
          return meta?.submissionId === submissionId;
        }) || null;
    }

    if (!patient) {
      logger.debug(`[Verify ${requestId}] Patient not found`, {
        email,
        submissionId,
        patientId,
      });

      return NextResponse.json({
        found: false,
        message: 'Patient not found in EONPRO',
        searchCriteria: { email, submissionId, patientId },
      });
    }

    // Get associated documents count
    const documentCount = await prisma.patientDocument.count({
      where: { patientId: patient.id },
    });

    // Get the submission info from sourceMetadata
    const sourceMetadata = patient.sourceMetadata as Record<string, unknown> | null;

    logger.info(`[Verify ${requestId}] Patient found: ${patient.id}`);

    return NextResponse.json({
      found: true,
      eonproPatientId: patient.id,
      eonproPatientNumber: patient.patientId,
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
      },
      sync: {
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
        submissionId: sourceMetadata?.submissionId || null,
        submissionType: sourceMetadata?.submissionType || null,
        qualified: sourceMetadata?.qualified || null,
      },
      documents: {
        count: documentCount,
      },
    });
  } catch (err) {
    logger.error(`[Verify ${requestId}] Error:`, err);
    return NextResponse.json(
      {
        error: 'Verification failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
