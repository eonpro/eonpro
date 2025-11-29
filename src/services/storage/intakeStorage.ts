import { mkdir, writeFile } from "fs/promises";
import path from "path";

const DEFAULT_STORAGE_DIR = path.join(process.cwd(), "public", "intake-pdfs");

export type StoredPdf = {
  filePath: string;
  filename: string;
  publicPath: string;
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

  await mkdir(baseDir, { recursive: true });

  const filename = `patient_${patientId}_${submissionId}.pdf`;
  const filePath = path.join(baseDir, filename);

  await writeFile(filePath, pdfBuffer);

  // Return a public URL path that can be served
  const publicPath = `/intake-pdfs/${filename}`;

  return {
    filePath,
    filename,
    publicPath,
  };
}
