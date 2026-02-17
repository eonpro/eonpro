/**
 * API v1 Intakes Endpoint
 *
 * Receives intake submissions from external platforms.
 * This is an alternative to the webhook endpoint, used by the EMR client.
 *
 * POST /api/v1/intakes - Submit an intake
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeMedLinkPayload } from '@/lib/medlink/intakeNormalizer';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { logger } from '@/lib/logger';
import { PatientDocumentCategory } from '@prisma/client';
import { buildPatientSearchIndex } from '@/lib/utils/search';
import { storeIntakeData } from '@/lib/storage/document-data-store';

export async function POST(req: NextRequest) {
  const requestId = `v1-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();

  logger.info(`[V1 INTAKES ${requestId}] Received intake submission`);

  // Verify authentication
  const secret =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  const expectedSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return Response.json(
      {
        success: false,
        error: 'Server not configured',
      },
      { status: 500 }
    );
  }

  if (!secret || secret !== expectedSecret) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  try {
    const payload = await req.json();

    // Normalize the payload
    const normalized = normalizeMedLinkPayload(payload);

    // Find EONMEDS clinic (use select for backwards compatibility)
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'eonmeds' },
          { name: { contains: 'EONMEDS', mode: 'insensitive' } },
          { name: { contains: 'EONMeds', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, subdomain: true },
    });

    const clinicId = clinic?.id || 3;

    // Extract patient data from normalized intake
    const patientData = normalized.patient;

    // Create or update patient
    let patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        email: patientData.email,
      },
    });

    const isNewPatient = !patient;

    if (patient) {
      // Get existing tags safely
      const existingTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];
      const updatedTags = existingTags.includes('v1-intake')
        ? existingTags
        : [...existingTags, 'v1-intake'];

      const updateSearchIndex = buildPatientSearchIndex({
        firstName: patientData.firstName || patient.firstName,
        lastName: patientData.lastName || patient.lastName,
        email: patient.email,
        phone: patientData.phone || patient.phone,
        patientId: patient.patientId,
      });
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: {
          firstName: patientData.firstName || patient.firstName,
          lastName: patientData.lastName || patient.lastName,
          phone: patientData.phone || patient.phone,
          dob: patientData.dob || patient.dob,
          gender: patientData.gender || patient.gender,
          address1: patientData.address1 || patient.address1,
          city: patientData.city || patient.city,
          state: patientData.state || patient.state,
          zip: patientData.zip || patient.zip,
          clinicId,
          tags: updatedTags,
          searchIndex: updateSearchIndex,
        },
      });
    } else {
      const patientCount = await prisma.patient.count();
      const patientId = String(patientCount + 1).padStart(6, '0');
      const searchIndex = buildPatientSearchIndex({
        firstName: patientData.firstName || 'Unknown',
        lastName: patientData.lastName || 'Patient',
        email: patientData.email,
        phone: patientData.phone,
        patientId,
      });

      patient = await prisma.patient.create({
        data: {
          patientId,
          firstName: patientData.firstName || 'Unknown',
          lastName: patientData.lastName || 'Patient',
          email: patientData.email || `unknown-${Date.now()}@intake.local`,
          phone: patientData.phone || '',
          dob: patientData.dob || '1900-01-01',
          gender: patientData.gender || 'Unknown',
          address1: patientData.address1 || '',
          city: patientData.city || '',
          state: patientData.state || '',
          zip: patientData.zip || '',
          clinicId,
          source: 'api',
          searchIndex,
          tags: ['v1-intake', 'complete-intake'],
        },
      });
    }

    // Generate PDF
    let documentId: number | null = null;
    try {
      const pdfContent = await generateIntakePdf(normalized, patient);
      const stored = await storeIntakePdf({
        patientId: patient.id,
        submissionId: normalized.submissionId,
        pdfBuffer: pdfContent,
      });

      // Prepare intake data to store
      const intakeDataToStore = {
        submissionId: normalized.submissionId,
        sections: normalized.sections,
        answers: normalized.answers || [],
        source: 'v1-intakes',
        receivedAt: new Date().toISOString(),
      };

      // Dual-write: S3 + DB `data` column (Phase 3.3)
      const { s3DataKey, dataBuffer: intakeDataBuffer } = await storeIntakeData(
        intakeDataToStore,
        { patientId: patient.id, clinicId }
      );

      const doc = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          clinicId,
          filename: stored.filename,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          mimeType: 'application/pdf',
          data: intakeDataBuffer,
          ...(s3DataKey != null ? { s3DataKey } : {}),
          sourceSubmissionId: normalized.submissionId,
        },
      });
      documentId = doc.id;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn(`[V1 INTAKES ${requestId}] PDF generation failed:`, { error: errMsg });
    }

    // Generate SOAP Note
    let soapNoteId: number | null = null;
    if (documentId) {
      try {
        const soapNote = await generateSOAPFromIntake(patient.id, documentId);
        soapNoteId = soapNote.id;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`[V1 INTAKES ${requestId}] SOAP generation failed:`, { error: errMsg });
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[V1 INTAKES ${requestId}] Success in ${duration}ms`);

    return Response.json({
      success: true,
      requestId,
      data: {
        submissionId: normalized.submissionId,
        patientId: patient.id,
        documentId,
        soapNoteId,
        isNewPatient,
        clinic: clinic?.name || 'EONMEDS',
      },
      processingTime: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      `[V1 INTAKES ${requestId}] Error:`,
      error instanceof Error ? error : new Error(errorMessage)
    );
    return Response.json(
      {
        success: false,
        error: errorMessage,
        requestId,
      },
      { status: 500 }
    );
  }
}
