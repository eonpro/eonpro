import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { handleApiError, BadRequestError } from '@/domains/shared/errors';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma, runWithClinicContext, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { parseDocumentData } from '@/lib/utils/vitals-extraction';

interface Params {
  params: Promise<{ id: string }>;
}

const getIntakeDataHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      requirePermission(toPermissionContext(user), 'patient:view');
      const { id: rawId } = await params;
      const patientId = Number(rawId);
      if (Number.isNaN(patientId) || patientId <= 0) {
        throw new BadRequestError('Invalid patient id');
      }

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const [documents, intakeFormSubmissions] = await Promise.all([
        runWithClinicContext(clinicId, () =>
          prisma.patientDocument.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              filename: true,
              mimeType: true,
              createdAt: true,
              externalUrl: true,
              category: true,
              sourceSubmissionId: true,
            },
          })
        ),
        withoutClinicFilter(() =>
          prisma.intakeFormSubmission.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              template: {
                select: { id: true, name: true, treatmentType: true, version: true },
              },
              responses: { include: { question: true } },
            },
          })
        ),
      ]);

      // Fetch binary data for intake form documents and parse to JSON
      const intakeDocIds = documents
        .filter((d) => d.category === 'MEDICAL_INTAKE_FORM')
        .map((d) => d.id);

      let documentsWithData = documents as any[];

      if (intakeDocIds.length > 0) {
        const rawDocs = await runWithClinicContext(clinicId, () =>
          prisma.patientDocument.findMany({
            where: { id: { in: intakeDocIds } },
            select: { id: true, data: true },
          })
        ).catch(() => [] as any[]);

        if (rawDocs.length > 0) {
          const dataMap = new Map(
            rawDocs.map((d: any) => [d.id, parseDocumentData(d.data)])
          );
          documentsWithData = documents.map((doc) => ({
            ...doc,
            data: dataMap.get(doc.id) ?? null,
          }));
        }
      }

      return NextResponse.json({
        documents: documentsWithData,
        intakeFormSubmissions,
      });
    } catch (error) {
      logger.error('[intake-data] Error:', {
        patientId: (await params).id,
        error: error instanceof Error ? error.message : String(error),
      });
      return handleApiError(error, { context: { route: 'GET /api/patients/[id]/intake-data' } });
    }
  }
);

export const GET = getIntakeDataHandler;
