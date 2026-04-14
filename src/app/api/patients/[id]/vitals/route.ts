import { NextResponse } from 'next/server';

import { handleApiError, BadRequestError } from '@/domains/shared/errors';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { queryOptimizer } from '@/lib/database';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { readIntakeData } from '@/lib/storage/document-data-store';
import { extractVitalsFromIntake } from '@/lib/utils/vitals-extraction';

interface Params {
  params: Promise<{ id: string }>;
}

const getVitalsHandler = withAuthParams(async (_request, user, { params }: Params) => {
  try {
    requirePermission(toPermissionContext(user), 'patient:view');
    const { id: rawId } = await params;
    const patientId = Number(rawId);
    if (Number.isNaN(patientId) || patientId <= 0) {
      throw new BadRequestError('Invalid patient id');
    }

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;
    const cacheKey = `vitals:v3:c${clinicId ?? 'all'}:p${patientId}`;

    const vitals = await queryOptimizer.query(
      async () => {
        const [documents, submissions] = await Promise.all([
          withoutClinicFilter(() =>
            prisma.patientDocument.findMany({
              where: { patientId, category: 'MEDICAL_INTAKE_FORM' },
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                patientId: true,
                clinicId: true,
                category: true,
                data: true,
                s3DataKey: true,
              },
            })
          ),
          withoutClinicFilter(() =>
            prisma.intakeFormSubmission.findMany({
              where: { patientId },
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                responses: { include: { question: true } },
              },
            })
          ),
        ]);

        const parsedDocs = await Promise.all(
          documents.map(async (doc) => ({
            ...doc,
            data: (await readIntakeData(doc)) as Record<string, unknown> | null,
          }))
        );

        return extractVitalsFromIntake(parsedDocs, submissions);
      },
      {
        cacheKey,
        cache: { ttl: 300, prefix: 'patient', useL1Cache: true, l1Ttl: 30 },
      }
    );

    return NextResponse.json(vitals, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    logger.error('[vitals] Error:', {
      patientId: (await params).id,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, { context: { route: 'GET /api/patients/[id]/vitals' } });
  }
});

export const GET = getVitalsHandler;
