/**
 * GET /api/patient-portal/intake/drafts
 *
 * Returns the authenticated patient's in-progress intake form drafts.
 * Used by the lead portal to show "Continue where you left off".
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

    const rawDrafts = await prisma.intakeFormDraft.findMany({
      where: {
        patientId: user.patientId,
        status: 'IN_PROGRESS',
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSavedAt: 'desc' },
      include: {
        template: {
          select: { name: true, treatmentType: true },
        },
        clinic: {
          select: { subdomain: true },
        },
      },
    });

    const drafts = rawDrafts.map((d) => {
      const completedSteps = Array.isArray(d.completedSteps)
        ? (d.completedSteps as string[])
        : [];

      return {
        sessionId: d.sessionId,
        currentStep: d.currentStep,
        completedSteps,
        progressPercent: 0,
        templateName: d.template.name,
        templateSlug: d.template.treatmentType,
        clinicSlug: d.clinic.subdomain ?? '',
        lastSavedAt: d.lastSavedAt.toISOString(),
      };
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    logger.error('Failed to load patient drafts', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return handleApiError(error, {
      context: { route: 'GET /api/patient-portal/intake/drafts' },
    });
  }
});
