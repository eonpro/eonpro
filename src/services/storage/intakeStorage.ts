import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";

// On Vercel, use /tmp which is writable; locally use public folder
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const DEFAULT_STORAGE_DIR = isVercel
  ? "/tmp/intake-pdfs"
  : path.join(process.cwd(), "public", "intake-pdfs");

export type StoredPdf = {
  filePath: string;
  filename: string;
  publicPath: string;
  storedInDatabase: boolean;
};

export type StoreIntakePdfOptions = {
  patientId: number;
  submissionId: string;
  pdfBuffer: Buffer;
};

export async function storeIntakePdf(options: StoreIntakePdfOptions): Promise<StoredPdf> {
  const { patientId, submissionId, pdfBuffer } = options;
  
  const baseDir = process.env.STORAGE_INTAKE_DIR
    ? path.resolve(process.env.STORAGE_INTAKE_DIR)
    : DEFAULT_STORAGE_DIR;

  const filename = `patient_${patientId}_${submissionId}.pdf`;
  const filePath = path.join(baseDir, filename);

  try {
    await mkdir(baseDir, { recursive: true });
    await writeFile(filePath, pdfBuffer);
    
    logger.info(`[INTAKE STORAGE] PDF stored at ${filePath}`);

    // On Vercel /tmp files are ephemeral - mark as stored in DB primarily
    // For production, integrate with S3 for persistent storage
    const publicPath = isVercel
      ? `database://intake-pdfs/${filename}` // Indicates PDF data is in database
      : `/intake-pdfs/${filename}`;

    return {
      filePath,
      filename,
      publicPath,
      storedInDatabase: true,
    };
  } catch (error) {
    // If filesystem write fails (e.g., read-only), store only in database
    logger.warn(`[INTAKE STORAGE] Filesystem write failed, storing in database only: ${error}`);
    
    return {
      filePath: "database",
      filename,
      publicPath: `database://intake-pdfs/${filename}`,
      storedInDatabase: true,
    };
  }
}
