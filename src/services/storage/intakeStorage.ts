import { logger } from '@/lib/logger';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, FileCategory } from '@/lib/integrations/aws/s3Config';

export type StoredPdf = {
  filename: string;
  pdfBuffer: Buffer;
  s3Key: string | null;
  storedInDatabase: true;
};

export type StoreIntakePdfOptions = {
  patientId: number;
  submissionId: string;
  pdfBuffer: Buffer;
  source?: string;
};

/**
 * Prepares PDF for storage and uploads to S3 when available.
 *
 * Returns:
 *   - filename: deterministic name for the PDF
 *   - pdfBuffer: the raw bytes (caller can still use if needed)
 *   - s3Key: S3 object key for the PDF — use as `externalUrl` on PatientDocument
 *
 * If S3 is unavailable the s3Key is null and the PDF lives only as long as
 * the caller decides to persist the buffer elsewhere.
 */
export async function storeIntakePdf(options: StoreIntakePdfOptions): Promise<StoredPdf> {
  const { patientId, submissionId, pdfBuffer, source } = options;

  const timestamp = Date.now();
  const cleanSubmissionId = submissionId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30);
  const filename = `patient_${patientId}_${cleanSubmissionId}-${timestamp}.pdf`;

  let s3Key: string | null = null;

  try {
    if (isS3Enabled()) {
      const s3Result = await uploadToS3({
        file: pdfBuffer,
        fileName: filename,
        category: FileCategory.INTAKE_FORMS,
        patientId,
        contentType: 'application/pdf',
        metadata: {
          submissionId,
          source: source || 'webhook',
        },
      });
      s3Key = s3Result.key;
      logger.info(`[INTAKE STORAGE] PDF uploaded to S3: ${s3Key}, ${pdfBuffer.length} bytes`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[INTAKE STORAGE] S3 upload failed (non-fatal): ${errMsg}`);
  }

  if (!s3Key) {
    logger.info(
      `[INTAKE STORAGE] Prepared PDF (S3 unavailable): ${filename}, ${pdfBuffer.length} bytes`
    );
  }

  return {
    filename,
    pdfBuffer,
    s3Key,
    storedInDatabase: true,
  };
}
