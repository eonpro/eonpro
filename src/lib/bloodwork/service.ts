/**
 * Bloodwork lab report service: create lab report from parsed Quest data and store PDF.
 * Validates that the patient name on the PDF matches the profile when requireNameMatch is true.
 * PHI: Do not log patient identifiers or result values.
 * Throws AppError subclasses for structured error handling (BadRequestError, ServiceUnavailableError).
 */

import { prisma } from '@/lib/db';
import { Prisma, PatientDocumentCategory } from '@prisma/client';
import { storeFile, isAllowedFileType } from '@/lib/storage/secure-storage';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { parseQuestBloodworkPdf } from './quest-parser';
import type { QuestParsedResult } from './quest-parser';
import { validateQuestParsedResult } from './validation';
import { logger } from '@/lib/logger';
import { BadRequestError, ServiceUnavailableError } from '@/domains/shared/errors';
import crypto from 'crypto';

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

export async function createBloodworkReportFromPdf(
  input: CreateBloodworkReportInput
): Promise<CreateBloodworkReportResult> {
  const {
    patientId,
    clinicId,
    pdfBuffer,
    filename,
    mimeType,
    uploadedByUserId,
    requireNameMatch = true,
  } = input;

  if (!isAllowedFileType(mimeType)) {
    throw new BadRequestError('File type not allowed. Please upload a PDF.', {
      cause: 'BLOODWORK_FILE_TYPE',
    });
  }

  let parsed: QuestParsedResult;
  try {
    parsed = await parseQuestBloodworkPdf(pdfBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse PDF';
    logger.warn('Bloodwork PDF parse failed', { patientId, clinicId, error: msg });
    // Deployment/environment issues (missing native deps on Vercel serverless, etc.)
    const isEnvUnavailable =
      msg.includes('unavailable in this environment') ||
      msg.includes('missing canvas support') ||
      msg.includes('PDF parsing library not available');
    if (isEnvUnavailable) {
      throw new ServiceUnavailableError(
        'Lab report parsing is temporarily unavailable on this server. This often happens when deployed to Vercel or other serverless runtimes. Please contact your administrator or try again later.',
        5
      );
    }
    throw new BadRequestError(
      msg.includes('PDF') ? msg : 'Failed to parse lab report. Please use a valid Quest Diagnostics text-based PDF.',
      { cause: 'BLOODWORK_PARSE' }
    );
  }

  try {
    parsed = validateQuestParsedResult(parsed);
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.warn('Bloodwork validation failed', { patientId, clinicId, error: err instanceof Error ? err.message : 'Unknown' });
    throw new BadRequestError(
      'Lab report validation failed. Please use a valid Quest Diagnostics lab report.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }

  if (requireNameMatch) {
    if (!parsed.parsedPatientName) {
      throw new BadRequestError(
        'Could not find a patient name on this lab report. Please upload a Quest Diagnostics report that clearly shows the patient name (e.g. "Patient Name: Last, First").',
        { cause: 'BLOODWORK_NO_NAME' }
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
        throw new BadRequestError(
          "The patient name on this lab report does not match the profile. Please upload the correct patient's results.",
          { cause: 'BLOODWORK_NAME_MISMATCH' }
        );
      }
    }
  }

  const contentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  const existing = await prisma.patientDocument.findFirst({
    where: {
      patientId,
      category: PatientDocumentCategory.LAB_RESULTS,
      source: 'bloodwork_upload',
      contentHash,
    },
    select: { id: true, labReport: { select: { id: true } } },
  });
  if (existing?.labReport) {
    const labReport = existing.labReport;
    const count = await prisma.labReportResult.count({ where: { labReportId: labReport.id } });
    logger.info('Bloodwork upload duplicate skipped (idempotent)', {
      labReportId: labReport.id,
      patientId,
      clinicId,
    });
    return {
      labReportId: labReport.id,
      documentId: existing.id,
      resultCount: count,
    };
  }

  let storagePath: string;
  try {
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
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : 'Storage failed';
    logger.error('Bloodwork storage failed', { patientId, clinicId, error: msg });
    throw new ServiceUnavailableError(
      'Document storage is temporarily unavailable. Please try again later.'
    );
  }

  const collectedAt = parsed.collectedAt ?? null;
  const reportedAt = parsed.reportedAt ?? null;
  const fasting = parsed.fasting ?? null;
  const specimenId = parsed.specimenId ?? null;

  let result: CreateBloodworkReportResult;
  try {
    result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const document = await tx.patientDocument.create({
          data: {
            patientId,
            clinicId,
            filename,
            mimeType: mimeType || 'application/pdf',
            category: PatientDocumentCategory.LAB_RESULTS,
            source: 'bloodwork_upload',
            externalUrl: storagePath,
            contentHash,
          },
        });

        const labReport = await tx.labReport.create({
          data: {
            patientId,
            clinicId,
            documentId: document.id,
            labName: 'Quest Diagnostics',
            parserVersion: 'quest-2025-02',
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
      },
      { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  } catch (txErr) {
    if (txErr instanceof Prisma.PrismaClientKnownRequestError && txErr.code === 'P2002') {
      const existing = await prisma.patientDocument.findFirst({
        where: {
          patientId,
          category: PatientDocumentCategory.LAB_RESULTS,
          source: 'bloodwork_upload',
          contentHash,
        },
        select: { id: true, labReport: { select: { id: true } } },
      });
      if (existing?.labReport) {
        const count = await prisma.labReportResult.count({ where: { labReportId: existing.labReport.id } });
        logger.info('Bloodwork upload duplicate skipped (race)', {
          labReportId: existing.labReport.id,
          patientId,
          clinicId,
        });
        return {
          labReportId: existing.labReport.id,
          documentId: existing.id,
          resultCount: count,
        };
      }
    }
    throw txErr;
  }

  logger.info('Bloodwork report created', {
    labReportId: result.labReportId,
    patientId,
    clinicId,
    resultCount: result.resultCount,
  });

  return result;
}
