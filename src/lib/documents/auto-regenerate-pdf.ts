/**
 * Auto-regenerate PDF for legacy documents that have JSON in the data column.
 *
 * Used by the document view and download endpoints to transparently convert
 * legacy intake JSON into a proper PDF on first access, so patients and staff
 * never see the "needs regeneration" error.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storePdfData } from '@/lib/storage/document-data-store';
import type { NormalizedIntake } from '@/lib/medlink/types';

interface LegacyDocument {
  id: number;
  patientId: number;
  clinicId: number | null;
  filename: string;
  category: string;
  createdAt: Date;
  sourceSubmissionId: string | null;
}

/**
 * Attempt to auto-regenerate a PDF from legacy JSON intake data.
 *
 * @param jsonBuffer - Raw buffer containing JSON intake data
 * @param document  - Document metadata (must include category, clinicId, etc.)
 * @returns The generated PDF buffer, or null if regeneration is not possible
 */
export async function tryAutoRegeneratePdf(
  jsonBuffer: Buffer,
  document: LegacyDocument
): Promise<Buffer | null> {
  if (document.category !== 'MEDICAL_INTAKE_FORM') {
    return null;
  }

  try {
    const jsonStr = jsonBuffer.toString('utf8').trim();
    const intakeDataSource = JSON.parse(jsonStr) as Record<string, unknown>;

    const patient = await prisma.patient.findUnique({
      where: { id: document.patientId },
    });

    if (!patient) {
      logger.warn('Auto-regenerate: patient not found', {
        documentId: document.id,
        patientId: document.patientId,
      });
      return null;
    }

    const patientData = (intakeDataSource?.patient as Record<string, unknown>) ?? {};
    const intake: NormalizedIntake = {
      submissionId:
        (intakeDataSource?.submissionId as string) ??
        document.sourceSubmissionId ??
        `auto-regen-${document.id}`,
      submittedAt: new Date(
        (intakeDataSource?.receivedAt as string) ?? document.createdAt
      ),
      patient: {
        firstName: (patientData.firstName as string) ?? patient.firstName ?? '',
        lastName: (patientData.lastName as string) ?? patient.lastName ?? '',
        email: (patientData.email as string) ?? patient.email ?? '',
        phone: (patientData.phone as string) ?? patient.phone ?? '',
        dob: (patientData.dob as string) ?? patient.dob ?? '',
        gender: (patientData.gender as string) ?? patient.gender ?? undefined,
        address1: (patientData.address1 as string) ?? patient.address1 ?? undefined,
        address2: (patientData.address2 as string) ?? (patient.address2 ?? undefined),
        city: (patientData.city as string) ?? patient.city ?? undefined,
        state: (patientData.state as string) ?? patient.state ?? undefined,
        zip: (patientData.zip as string) ?? patient.zip ?? undefined,
      },
      sections: (intakeDataSource?.sections as NormalizedIntake['sections']) ?? [],
      answers: (intakeDataSource?.answers as NormalizedIntake['answers']) ?? [],
    };

    const pdfBuffer = await generateIntakePdf(intake, patient);

    const stored = await storePdfData(pdfBuffer, {
      documentId: document.id,
      patientId: document.patientId,
      clinicId: document.clinicId,
      filename: document.filename,
    });

    await prisma.patientDocument.update({
      where: { id: document.id },
        data: {
        data: new Uint8Array(stored.dataBuffer),
        s3DataKey: stored.s3DataKey,
        mimeType: 'application/pdf',
      },
    });

    logger.info('Auto-regenerated PDF for legacy document', {
      documentId: document.id,
      patientId: document.patientId,
      pdfSize: pdfBuffer.length,
    });

    return pdfBuffer;
  } catch (err) {
    logger.error('Auto-regenerate PDF failed', {
      documentId: document.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
