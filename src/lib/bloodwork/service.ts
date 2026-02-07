/**
 * Bloodwork lab report service: create lab report from parsed Quest data and store PDF.
 * Validates that the patient name on the PDF matches the profile when requireNameMatch is true.
 * PHI: Do not log patient identifiers or result values.
 */

import { prisma } from '@/lib/db';
import { PatientDocumentCategory } from '@prisma/client';
import { storeFile, isAllowedFileType } from '@/lib/storage/secure-storage';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { parseQuestBloodworkPdf } from './quest-parser';
import type { QuestParsedResult } from './quest-parser';
import { logger } from '@/lib/logger';

export interface CreateBloodworkReportInput {
  patientId: number;
  clinicId: number;
  pdfBuffer: Buffer;
  filename: string;
  mimeType: string;
  uploadedByUserId: number;
  /** When true (default), reject upload if PDF patient name does not match profile. Prevents wrong-patient uploads. */
  requireNameMatch?: boolean;
}

export interface CreateBloodworkReportResult {
  labReportId: number;
  documentId: number;
  resultCount: number;
}

/**
 * Parse PDF, store file (S3 or local), create PatientDocument + LabReport + LabReportResult in a transaction.
 */
/** Normalize name for comparison: uppercase, single space, no extra punctuation. */
function normalizeNameForMatch(firstName: string, lastName: string): string {
  const last = (lastName || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const first = (firstName || '').toUpperCase().replace(/\s+/g, ' ').trim();
  return `${last} ${first}`.trim();
}

export async function createBloodworkReportFromPdf(input: CreateBloodworkReportInput): Promise<CreateBloodworkReportResult> {
  const { patientId, clinicId, pdfBuffer, filename, mimeType, uploadedByUserId, requireNameMatch = true } = input;

  if (!isAllowedFileType(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}. Please upload a PDF.`);
  }

  const parsed: QuestParsedResult = await parseQuestBloodworkPdf(pdfBuffer);

  if (requireNameMatch) {
    if (!parsed.parsedPatientName) {
      throw new Error(
        'Could not find a patient name on this lab report. Please upload a Quest Diagnostics report that clearly shows the patient name (e.g. "Patient Name: Last, First").'
      );
    }
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    if (patient) {
      let profileLast = '';
      let profileFirst = '';
      try {
        profileLast = decryptPHI(patient.lastName) ?? patient.lastName ?? '';
        profileFirst = decryptPHI(patient.firstName) ?? patient.firstName ?? '';
      } catch {
        profileLast = (patient.lastName as string) ?? '';
        profileFirst = (patient.firstName as string) ?? '';
      }
      const profileNormalized = normalizeNameForMatch(profileFirst, profileLast);
      const pdfNormalized = normalizeNameForMatch(
        parsed.parsedPatientName.firstName,
        parsed.parsedPatientName.lastName
      );
      if (profileNormalized !== pdfNormalized) {
        throw new Error(
          'The patient name on this lab report does not match the profile. Please upload the correct patient\'s results.'
        );
      }
    }
  }

  let storagePath: string;

  if (isS3Enabled()) {
    const s3Result = await uploadToS3({
      file: pdfBuffer,
      fileName: filename,
      category: FileCategory.LAB_RESULTS,
      patientId,
      metadata: { clinicId: clinicId.toString(), uploadedBy: uploadedByUserId.toString() },
      contentType: mimeType || 'application/pdf',
    });
    storagePath = s3Result.key;
  } else {
    const stored = await storeFile(pdfBuffer, filename, 'lab-results', {
      patientId,
      clinicId,
      uploadedBy: uploadedByUserId,
      mimeType: mimeType || 'application/pdf',
    });
    storagePath = stored.path;
  }

  const collectedAt = parsed.collectedAt ?? null;
  const reportedAt = parsed.reportedAt ?? null;
  const fasting = parsed.fasting ?? null;
  const specimenId = parsed.specimenId ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.patientDocument.create({
      data: {
        patientId,
        clinicId,
        filename,
        mimeType: mimeType || 'application/pdf',
        category: PatientDocumentCategory.LAB_RESULTS,
        source: 'bloodwork_upload',
        externalUrl: storagePath,
      },
    });

    const labReport = await tx.labReport.create({
      data: {
        patientId,
        clinicId,
        documentId: document.id,
        labName: 'Quest Diagnostics',
        specimenId,
        collectedAt,
        reportedAt,
        fasting,
      },
    });

    await tx.labReportResult.createMany({
      data: parsed.results.map((r, i) => ({
        labReportId: labReport.id,
        testName: r.testName,
        value: r.value,
        valueNumeric: r.valueNumeric,
        unit: r.unit,
        referenceRange: r.referenceRange,
        flag: r.flag,
        category: r.category,
        sortOrder: i,
      })),
    });

    return {
      labReportId: labReport.id,
      documentId: document.id,
      resultCount: parsed.results.length,
    };
  });

  logger.info('Bloodwork report created', {
    labReportId: result.labReportId,
    patientId,
    clinicId,
    resultCount: result.resultCount,
  });

  return result;
}
