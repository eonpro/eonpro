import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';
import { extractVitalsFromIntake, parseDocumentData } from '@/lib/utils/vitals-extraction';

/**
 * GET /api/patient-portal/vitals
 *
 * Returns the patient's initial intake vitals (height, weight, BMI)
 * from their intake form submission.
 *
 * Uses the shared vitals extraction utility for consistency with the admin view.
 */

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    // Only patients can access this endpoint
    if (user.role !== 'patient' || !user.patientId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const patientId = user.patientId;

    // Fetch patient with intake documents and submissions
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        documents: {
          where: { category: 'MEDICAL_INTAKE_FORM' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            patientId: true,
            category: true,
            filename: true,
            createdAt: true,
            data: true,
          },
        },
        intakeSubmissions: {
          include: {
            responses: {
              include: {
                question: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const documentsWithParsedData = patient.documents.map((doc: any) => ({
      ...doc,
      data: parseDocumentData(doc.data),
    }));

    const vitals = extractVitalsFromIntake(documentsWithParsedData, patient.intakeSubmissions as any[]);

    logger.info('Patient portal vitals fetched', { patientId });

    try {
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: patient.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Patient',
        resourceId: String(patientId),
        patientId,
        action: 'portal_vitals',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for portal vitals', {
        patientId,
        userId: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      data: vitals,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/vitals',
      context: { patientId: user?.patientId },
    });
  }
});

export const GET = getHandler;
