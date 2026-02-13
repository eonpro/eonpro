import { NextRequest, NextResponse } from 'next/server';
import { PatientDocumentCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withClinicalAuth, type AuthUser } from '@/lib/auth/middleware';

async function handleGet(_request: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const intakes = await prisma.patientDocument.findMany({
      where: {
        category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
        patient: { clinicId },
      },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            tags: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ intakes });
  } catch (error: unknown) {
    logger.error('[Intakes] Error fetching intakes', {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch intakes' }, { status: 500 });
  }
}

export const GET = withClinicalAuth(handleGet);
