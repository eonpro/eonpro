/**
 * Accepted Upload Formats — Single Source of Truth
 *
 * All patient-portal upload components, API routes, and validation schemas
 * must reference these constants so format restrictions stay consistent.
 */

// ---------------------------------------------------------------------------
// Image formats accepted for patient photos (progress, medical, verification)
// ---------------------------------------------------------------------------
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const ACCEPTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
] as const;

export const ACCEPTED_IMAGE_LABEL = 'JPG, PNG, WebP, or HEIC';

/**
 * MIME-to-extension mapping for react-dropzone `accept` config.
 * Extensions are required so browsers that report HEIC as "" still match by filename.
 */
export const ACCEPTED_IMAGE_DROPZONE_ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

// ---------------------------------------------------------------------------
// Document formats accepted for the patient-portal documents section
// ---------------------------------------------------------------------------
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const ACCEPTED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'] as const;

export const ACCEPTED_DOCUMENT_LABEL = 'PDF, DOC, DOCX, or TXT';

// ---------------------------------------------------------------------------
// Combined: document + image formats for the documents upload page
// (patients can attach images of lab reports, insurance cards, etc.)
// ---------------------------------------------------------------------------
export const ACCEPTED_DOCUMENT_UPLOAD_MIME_TYPES = [
  ...ACCEPTED_DOCUMENT_MIME_TYPES,
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

export const ACCEPTED_DOCUMENT_UPLOAD_EXTENSIONS = [
  ...ACCEPTED_DOCUMENT_EXTENSIONS,
  '.jpg',
  '.jpeg',
  '.png',
] as const;

export const ACCEPTED_DOCUMENT_UPLOAD_LABEL = 'PDF, DOC, DOCX, TXT, JPG, or PNG';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type AcceptedMimeType =
  | (typeof ACCEPTED_IMAGE_MIME_TYPES)[number]
  | (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

export function isAcceptedImageType(mime: string): boolean {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

export function isAcceptedDocumentUploadType(mime: string): boolean {
  return (ACCEPTED_DOCUMENT_UPLOAD_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

export function humanReadableAcceptAttr(extensions: readonly string[]): string {
  return extensions.join(',');
}
