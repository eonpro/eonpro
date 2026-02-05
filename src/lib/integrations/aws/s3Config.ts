/**
 * AWS S3 Storage Configuration
 * 
 * Handles AWS S3 setup for secure document storage
 */

import { isFeatureEnabled } from '@/lib/features';

// AWS S3 Configuration Interface
export interface AWSS3Config {
  region: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  cloudFrontUrl?: string;
  kmsKeyId?: string; // For encryption
}

// Load configuration from environment
export const s3Config: AWSS3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucketName: process.env.AWS_S3_BUCKET_NAME || 'lifefile-documents',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  cloudFrontUrl: process.env.AWS_CLOUDFRONT_URL,
  kmsKeyId: process.env.AWS_KMS_KEY_ID,
};

// Validate S3 configuration
export function isS3Configured(): boolean {
  return !!(
    s3Config.bucketName && 
    s3Config.accessKeyId && 
    s3Config.secretAccessKey &&
    s3Config.region
  );
}

// Check if S3 is enabled and configured
export function isS3Enabled(): boolean {
  return isFeatureEnabled('AWS_S3_STORAGE') && isS3Configured();
}

// File Type Categories
export enum FileCategory {
  MEDICAL_RECORDS = 'medical-records',
  LAB_RESULTS = 'lab-results',
  PRESCRIPTIONS = 'prescriptions',
  IMAGING = 'imaging',
  INSURANCE = 'insurance',
  CONSENT_FORMS = 'consent-forms',
  INTAKE_FORMS = 'intake-forms',
  BRANDING = 'branding', // Clinic branding assets (logo, icon, favicon)
  PROFILE_PICTURES = 'profile-pictures', // User profile pictures
  PATIENT_PHOTOS = 'patient-photos', // Patient progress/ID/medical photos
  OTHER = 'other',
}

// File Status
export enum FileStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  AVAILABLE = 'available',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
  ERROR = 'error',
}

// File Access Level
export enum FileAccessLevel {
  PUBLIC = 'public',          // Anyone with link
  PRIVATE = 'private',        // Only owner
  RESTRICTED = 'restricted',  // Owner + specific users
  PROVIDER = 'provider',      // All providers
  PATIENT = 'patient',        // Patient only
}

// Storage Configuration
export const STORAGE_CONFIG = {
  // Size limits
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_DOCUMENT_SIZE: 50 * 1024 * 1024, // 50MB
  
  // Allowed file types
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ],
  
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf',
  ],
  
  ALLOWED_MEDICAL_TYPES: [
    'application/dicom', // Medical imaging
    'application/hl7-v2+er7', // HL7 messages
    'application/fhir+json', // FHIR resources
  ],
  
  // S3 paths
  PATHS: {
    PATIENTS: 'patients',
    PROVIDERS: 'providers',
    CLINICS: 'clinics',
    BRANDING: 'branding',
    PROFILE_PICTURES: 'profile-pictures',
    PATIENT_PHOTOS: 'patient-photos',
    TEMP: 'temp',
    ARCHIVES: 'archives',
  },
  
  // Retention policies (in days)
  RETENTION: {
    TEMP_FILES: 1,
    DELETED_FILES: 30,
    ARCHIVED_FILES: 2555, // 7 years for HIPAA
    AUDIT_LOGS: 2190, // 6 years
  },
  
  // Encryption
  ENCRYPTION: {
    ALGORITHM: 'AES256',
    KMS_ENABLED: true,
  },
  
  // Lifecycle rules
  LIFECYCLE: {
    ENABLE_GLACIER: true,
    GLACIER_TRANSITION_DAYS: 90,
    DEEP_ARCHIVE_DAYS: 365,
  },
};

// S3 Bucket Policies
export const BUCKET_POLICIES = {
  // CORS configuration
  CORS: {
    AllowedHeaders: ['*'],
    AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
    AllowedOrigins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],
    ExposeHeaders: ['ETag', 'x-amz-server-side-encryption'],
    MaxAgeSeconds: 3000,
  },
  
  // Versioning
  VERSIONING: {
    Status: 'Enabled',
    MFADelete: 'Disabled',
  },
  
  // Server-side encryption
  ENCRYPTION: {
    Rules: [{
      ApplyServerSideEncryptionByDefault: {
        SSEAlgorithm: 'AES256',
        KMSMasterKeyID: s3Config.kmsKeyId,
      },
    }],
  },
  
  // Lifecycle rules
  LIFECYCLE_RULES: [
    {
      Id: 'DeleteTempFiles',
      Status: 'Enabled',
      Filter: { Prefix: 'temp/' },
      Expiration: { Days: 1 },
    },
    {
      Id: 'TransitionToGlacier',
      Status: 'Enabled',
      Transitions: [
        {
          Days: 90,
          StorageClass: 'GLACIER',
        },
        {
          Days: 365,
          StorageClass: 'DEEP_ARCHIVE',
        },
      ],
    },
  ],
};

// Error Messages
export const S3_ERRORS = {
  NOT_CONFIGURED: 'AWS S3 is not configured. Please add AWS credentials.',
  NOT_ENABLED: 'AWS S3 Storage feature is not enabled.',
  UPLOAD_FAILED: 'Failed to upload file. Please try again.',
  DOWNLOAD_FAILED: 'Failed to download file.',
  DELETE_FAILED: 'Failed to delete file.',
  FILE_TOO_LARGE: 'File size exceeds the maximum allowed size.',
  INVALID_FILE_TYPE: 'File type is not allowed.',
  ACCESS_DENIED: 'You do not have permission to access this file.',
  FILE_NOT_FOUND: 'File not found.',
  BUCKET_NOT_FOUND: 'S3 bucket not found.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
};