/**
 * GET /api/patient-portal/intake/templates
 *
 * Returns available intake form templates for the patient's clinic.
 * Used by the lead portal to show which intakes are available.
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
      select: { clinicId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const rawTemplates = await prisma.intakeFormTemplate.findMany({
      where: {
        clinicId: patient.clinicId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        clinic: {
          select: { subdomain: true },
        },
      },
    });

    const templates = rawTemplates.map((t) => ({
      id: String(t.id),
      name: t.name,
      description: t.description ?? '',
      treatmentType: t.treatmentType,
      slug: t.treatmentType,
      clinicSlug: t.clinic?.subdomain ?? '',
    }));

    return NextResponse.json({ templates });
  } catch (error) {
    logger.error('Failed to load intake templates', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return handleApiError(error, {
      context: { route: 'GET /api/patient-portal/intake/templates' },
    });
  }
});
