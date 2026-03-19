import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { generateHsaLetter } from '@/services/hsa/hsaLetterService';
import { handleApiError, BadRequestError, NotFoundError } from '@/domains/shared/errors';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { basePrisma } from '@/lib/db';

type Params = {
  params: Promise<{ id: string }>;
};

const hsaLetterHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id);

      if (isNaN(patientId) || patientId <= 0) {
        throw new BadRequestError('Invalid patient ID');
      }

      const url = new URL(request.url);
      const invoiceIdParam = url.searchParams.get('invoiceId');

      if (!invoiceIdParam) {
        throw new BadRequestError('invoiceId query parameter is required');
      }

      const invoiceId = parseInt(invoiceIdParam);
      if (isNaN(invoiceId) || invoiceId <= 0) {
        throw new BadRequestError('Invalid invoice ID');
      }

      // Verify patient belongs to user's clinic (unless super_admin)
      if (user.role !== 'super_admin') {
        const patient = await basePrisma.patient.findUnique({
          where: { id: patientId },
          select: { clinicId: true },
        });

        if (!patient) {
          throw new NotFoundError('Patient not found');
        }

        if (user.clinicId && patient.clinicId !== user.clinicId) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }

      const { pdf, filename } = await generateHsaLetter(invoiceId, patientId);

      await auditLog(request, {
        eventType: AuditEventType.DOCUMENT_DOWNLOAD,
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        resourceType: 'hsa_letter',
        resourceId: String(invoiceId),
        patientId,
        action: 'document_download',
        outcome: 'SUCCESS',
        metadata: { invoiceId, filename },
      });

      return new NextResponse(pdf as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(pdf.byteLength),
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/patients/[id]/hsa-letter', patientId: (await params).id },
      });
    }
  },
  { roles: ['admin', 'super_admin', 'provider', 'staff'] }
);

export const GET = hsaLetterHandler;
