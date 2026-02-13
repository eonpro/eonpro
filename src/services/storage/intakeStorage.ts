import { logger } from '@/lib/logger';

export type StoredPdf = {
  filename: string;
  pdfBuffer: Buffer;
  storedInDatabase: true;
};

export type StoreIntakePdfOptions = {
  patientId: number;
  submissionId: string;
  pdfBuffer: Buffer;
};

/**
 * Prepares PDF for database storage.
 * PDFs are stored directly in the database to ensure persistence on Vercel
 * (where /tmp is ephemeral and files are lost between function invocations).
 *
 * This function returns the buffer to be stored in the PatientDocument.data field.
 */
export async function storeIntakePdf(options: StoreIntakePdfOptions): Promise<StoredPdf> {
  const { patientId, submissionId, pdfBuffer } = options;

  // Generate a clean filename
  const timestamp = Date.now();
  const cleanSubmissionId = submissionId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30);
  const filename = `patient_${patientId}_${cleanSubmissionId}-${timestamp}.pdf`;

  logger.info(
    `[INTAKE STORAGE] Prepared PDF for database storage: ${filename}, size: ${pdfBuffer.length} bytes`
  );

  // Return the buffer to be stored in the database
  // The webhook handler will store this in PatientDocument.data
  return {
    filename,
    pdfBuffer,
    storedInDatabase: true,
  };
}
