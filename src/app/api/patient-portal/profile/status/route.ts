/**
 * GET /api/patient-portal/profile/status
 *
 * Returns the patient's profile status and whether they have completed
 * any intake form submissions. Used by the portal layout to determine
 * which portal experience (lead vs patient) to render.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(async (_req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 },
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: {
        profileStatus: true,
        _count: {
          select: {
            intakeSubmissions: { where: { status: 'completed' } },
          },
        },
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      profileStatus: patient.profileStatus,
      hasCompletedIntake: patient._count.intakeSubmissions > 0,
    });
  } catch (error) {
    logger.error('Failed to fetch patient profile status', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/profile/status' } });
  }
});
