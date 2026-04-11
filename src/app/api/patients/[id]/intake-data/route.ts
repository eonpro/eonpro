import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { handleApiError, BadRequestError } from '@/domains/shared/errors';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { readIntakeData } from '@/lib/storage/document-data-store';

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

      const [documents, intakeFormSubmissions, latestInvoice] = await Promise.all([
        // withoutClinicFilter: documents with clinicId=null (legacy) must
        // still be found; we scope by patientId which is already verified.
        withoutClinicFilter(() =>
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
        prisma.invoice.findFirst({
          where: {
            patientId,
            status: 'PAID',
            ...(clinicId ? { clinicId } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        }).catch(() => null),
      ]);

      // Fetch binary data + S3 key for intake form documents and parse to JSON
      const intakeDocIds = documents
        .filter((d) => d.category === 'MEDICAL_INTAKE_FORM')
        .map((d) => d.id);

      let documentsWithData = documents as any[];

      if (intakeDocIds.length > 0) {
        const rawDocs = await withoutClinicFilter(() =>
          prisma.patientDocument.findMany({
            where: { id: { in: intakeDocIds } },
            select: { id: true, patientId: true, clinicId: true, data: true, s3DataKey: true },
          })
        ).catch(() => [] as any[]);

        if (rawDocs.length > 0) {
          const dataEntries = await Promise.all(
            rawDocs.map(async (d: any) => {
              const parsed = await readIntakeData(d);
              return [d.id, parsed] as const;
            })
          );
          const dataMap = new Map(dataEntries);
          documentsWithData = documents.map((doc) => ({
            ...doc,
            data: dataMap.get(doc.id) ?? null,
          }));
        }
      }

      const invoiceMeta = latestInvoice?.metadata as Record<string, unknown> | null;
      const previousGlp1Details =
        (invoiceMeta?.previousGlp1Details || invoiceMeta?.previous_glp1_details) as string | undefined;

      return NextResponse.json({
        documents: documentsWithData,
        intakeFormSubmissions,
        ...(previousGlp1Details ? { previousGlp1Details } : {}),
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
