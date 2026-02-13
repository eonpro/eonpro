import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { generateIntakePdf } from '@/services/intakePdfService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import type { NormalizedIntake } from '@/lib/heyflow/types';

/**
 * POST /api/patients/[id]/documents/[documentId]/regenerate
 * Regenerate PDF for a single document (clinical auth: provider/admin, same clinic).
 * Only MEDICAL_INTAKE_FORM documents can be regenerated.
 */
export const POST = withAuthParams(
  async (
    request: NextRequest,
    user: { id: number; role: string; clinicId: number | null; patientId?: number },
    context: { params: Promise<{ id: string; documentId: string }> }
  ) => {
    try {
      const params = await context.params;
      const patientId = parseInt(params.id);
      const documentId = parseInt(params.documentId);

      if (isNaN(patientId) || isNaN(documentId)) {
        return NextResponse.json({ error: 'Invalid patient or document ID' }, { status: 400 });
      }

      // Patients cannot regenerate; only providers and admins
      if (user.role === 'patient') {
        return NextResponse.json(
          { error: 'Only providers and admins can regenerate documents' },
          { status: 403 }
        );
      }

      // Check patient exists and user has clinic access
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });

      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && user.clinicId != null && patient.clinicId !== user.clinicId) {
        logger.security('Cross-clinic document regenerate attempt', {
          userId: user.id,
          userClinicId: user.clinicId,
          patientClinicId: patient.clinicId,
          documentId,
        });
        return NextResponse.json({ error: 'Patient not in your clinic' }, { status: 403 });
      }

      const doc = await prisma.patientDocument.findFirst({
        where: {
          id: documentId,
          patientId: patientId,
        },
        include: {
          patient: true,
        },
      });

      if (!doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      if (doc.category !== 'MEDICAL_INTAKE_FORM') {
        return NextResponse.json(
          { error: 'Only medical intake form documents can be regenerated' },
          { status: 400 }
        );
      }

      // Resolve intake source: from document.data (JSON), intakeData, or minimal from patient
      let intakeDataSource: Record<string, unknown> | null = null;

      if (doc.data) {
        try {
          let buffer: Buffer;
          if (doc.data instanceof Uint8Array) {
            buffer = Buffer.from(doc.data);
          } else if (Buffer.isBuffer(doc.data)) {
            buffer = doc.data;
          } else {
            buffer = Buffer.from((doc.data as { data?: number[] })?.data ?? (doc.data as number[]));
          }
          const str = buffer.toString('utf8').trim();
          if (str.startsWith('{') || str.startsWith('[')) {
            intakeDataSource = JSON.parse(str) as Record<string, unknown>;
          }
        } catch {
          // Not JSON; may already be PDF
        }
      }

      if (!intakeDataSource) {
        intakeDataSource = {
          submissionId: doc.sourceSubmissionId ?? `regen-${doc.id}`,
          patient: {
            firstName: doc.patient.firstName,
            lastName: doc.patient.lastName,
            email: doc.patient.email,
            phone: doc.patient.phone,
            dob: doc.patient.dob,
            gender: doc.patient.gender,
            address1: doc.patient.address1,
            city: doc.patient.city,
            state: doc.patient.state,
            zip: doc.patient.zip,
          },
          sections: [
            {
              title: 'Patient Information',
              entries: [
                { label: 'Name', value: `${doc.patient.firstName} ${doc.patient.lastName}` },
                { label: 'Email', value: (doc.patient.email as string) ?? '' },
                { label: 'Phone', value: (doc.patient.phone as string) ?? '' },
              ],
            },
          ],
          answers: [],
        };
      }

      const patientData = (intakeDataSource?.patient as Record<string, unknown>) ?? {};
      const intake: NormalizedIntake = {
        submissionId:
          (intakeDataSource?.submissionId as string) ?? doc.sourceSubmissionId ?? `regen-${doc.id}`,
        submittedAt: new Date(
          (intakeDataSource?.receivedAt as string) ?? (doc.createdAt as Date)
        ),
        patient: {
          firstName: (patientData.firstName as string) ?? doc.patient.firstName,
          lastName: (patientData.lastName as string) ?? doc.patient.lastName,
          email: (patientData.email as string) ?? doc.patient.email,
          phone: (patientData.phone as string) ?? doc.patient.phone,
          dob: (patientData.dob as string) ?? doc.patient.dob,
          gender: (patientData.gender as string) ?? doc.patient.gender,
          address1: (patientData.address1 as string) ?? doc.patient.address1,
          address2: (patientData.address2 as string) ?? (doc.patient.address2 ?? ''),
          city: (patientData.city as string) ?? doc.patient.city,
          state: (patientData.state as string) ?? doc.patient.state,
          zip: (patientData.zip as string) ?? doc.patient.zip,
        },
        sections: (intakeDataSource?.sections as NormalizedIntake['sections']) ?? [],
        answers: (intakeDataSource?.answers as NormalizedIntake['answers']) ?? [],
      };

      logger.debug('Regenerating PDF for document', { documentId, patientId, userId: user.id });
      const pdfBuffer = await generateIntakePdf(intake, doc.patient);

      await prisma.patientDocument.update({
        where: { id: doc.id },
        data: {
          data: pdfBuffer,
          externalUrl: null,
        },
      });

      logger.info('Document PDF regenerated', {
        documentId: doc.id,
        patientId,
        userId: user.id,
        size: pdfBuffer.length,
      });

      try {
        await auditLog(request, {
          eventType: AuditEventType.PHI_UPDATE,
          userId: user.id,
          userRole: user.role,
          patientId,
          resourceType: 'PatientDocument',
          resourceId: doc.id.toString(),
          clinicId: patient.clinicId ?? undefined,
          action: 'document_regenerate',
          outcome: 'SUCCESS',
          metadata: { pdfSize: pdfBuffer.length },
        });
      } catch (auditErr) {
        logger.error('Failed to create HIPAA audit log for document regenerate', {
          error: auditErr instanceof Error ? auditErr.message : 'Unknown',
        });
      }

      return NextResponse.json({ success: true, documentId: doc.id });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Document regenerate failed', { error: errorMessage, userId: user.id });
      return NextResponse.json(
        { error: `Failed to regenerate PDF: ${errorMessage}` },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);
