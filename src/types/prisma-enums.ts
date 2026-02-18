/**
 * Client-safe Prisma enum types
 *
 * These mirror the Prisma schema enums but are plain TypeScript string literal unions.
 * Use these in 'use client' components instead of importing from '@prisma/client',
 * which pulls Node.js-only runtime code into the client bundle.
 *
 * IMPORTANT: Keep in sync with prisma/schema.prisma enums.
 */

// Patient Photo Types
export type PatientPhotoType =
  | 'PROGRESS_FRONT'
  | 'PROGRESS_SIDE'
  | 'PROGRESS_BACK'
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'SELFIE'
  | 'MEDICAL_SKIN'
  | 'MEDICAL_INJURY'
  | 'MEDICAL_SYMPTOM'
  | 'MEDICAL_BEFORE'
  | 'MEDICAL_AFTER'
  | 'MEDICAL_OTHER'
  | 'PROFILE_AVATAR';

export type PatientPhotoVerificationStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type WebhookStatus =
  | 'SUCCESS'
  | 'ERROR'
  | 'INVALID_AUTH'
  | 'INVALID_PAYLOAD'
  | 'PROCESSING_ERROR';

export const WebhookStatus = {
  SUCCESS: 'SUCCESS' as const,
  ERROR: 'ERROR' as const,
  INVALID_AUTH: 'INVALID_AUTH' as const,
  INVALID_PAYLOAD: 'INVALID_PAYLOAD' as const,
  PROCESSING_ERROR: 'PROCESSING_ERROR' as const,
};
