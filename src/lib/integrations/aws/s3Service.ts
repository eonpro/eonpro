/**
 * AWS S3 Storage Service
 * 
 * Handles file upload, download, and management operations
 */

import { logger } from '@/lib/logger';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  isS3Enabled, 
  s3Config, 
  STORAGE_CONFIG,
  FileCategory,
  FileStatus,
  FileAccessLevel,
  S3_ERRORS 
} from './s3Config';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { AppError, ApiResponse } from '@/types/common';

// Initialize S3 Client
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    if (!isS3Enabled()) {
      throw new Error(S3_ERRORS.NOT_CONFIGURED);
    }

    s3Client = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    });
  }

  return s3Client;
}

// File upload interface
export interface UploadFileParams {
  file: Buffer | Uint8Array | string;
  fileName: string;
  category: FileCategory;
  patientId?: number;
  providerId?: number;
  metadata?: Record<string, unknown>;
  accessLevel?: FileAccessLevel;
  contentType?: string;
}

// File response interface
export interface S3FileResponse {
  key: string;
  url: string;
  size: number;
  etag: string;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, unknown>;
}

// Generate unique S3 key
export function generateS3Key(
  category: FileCategory,
  fileName: string,
  patientId?: number
): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (patientId) {
    return `${STORAGE_CONFIG.PATHS.PATIENTS}/${patientId}/${category}/${timestamp}-${uuid}-${sanitizedFileName}`;
  }
  
  return `${category}/${timestamp}-${uuid}-${sanitizedFileName}`;
}

// Upload file to S3
export async function uploadToS3(params: UploadFileParams): Promise<S3FileResponse> {
  if (!isS3Enabled()) {
    // Return mock response for development
    return mockUpload(params);
  }

  try {
    const client = getS3Client();
    const key = generateS3Key(params.category, params.fileName, params.patientId);
    
    // Prepare upload command
    const command = new PutObjectCommand({
      Bucket: s3Config.bucketName,
      Key: key,
      Body: params.file,
      ContentType: params.contentType || 'application/octet-stream',
      Metadata: {
        ...params.metadata,
        category: params.category,
        patientId: params.patientId?.toString() || '',
        providerId: params.providerId?.toString() || '',
        accessLevel: params.accessLevel || FileAccessLevel.PRIVATE,
        uploadedAt: new Date().toISOString(),
      },
      ServerSideEncryption: 'AES256',
      ...(s3Config.kmsKeyId && { SSEKMSKeyId: s3Config.kmsKeyId }),
    });

    // Execute upload
    const response = await client.send(command);
    
    // Generate signed URL for access
    const url = await generateSignedUrl(key, 'GET', 3600); // 1 hour expiry
    
    return {
      key,
      url,
      size: params.file instanceof Buffer ? params.file.length : 
             params.file instanceof Uint8Array ? params.file.length : 
             new Blob([params.file]).size,
      etag: response.ETag || '',
      contentType: params.contentType || 'application/octet-stream',
      lastModified: new Date(),
      metadata: params.metadata,
    };
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Upload failed:', error);
    throw new Error(S3_ERRORS.UPLOAD_FAILED);
  }
}

// Download file from S3
export async function downloadFromS3(key: string): Promise<Buffer> {
  if (!isS3Enabled()) {
    // Return mock data for development
    return Buffer.from('Mock file content');
  }

  try {
    const client = getS3Client();
    
    const command = new GetObjectCommand({
      Bucket: s3Config.bucketName,
      Key: key,
    });

    const response = await client.send(command);
    
    if (!response.Body) {
      throw new Error(S3_ERRORS.FILE_NOT_FOUND);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Download failed:', error);
    
    if (error.Code === 'NoSuchKey') {
      throw new Error(S3_ERRORS.FILE_NOT_FOUND);
    }
    
    throw new Error(S3_ERRORS.DOWNLOAD_FAILED);
  }
}

// Generate signed URL for temporary access
export async function generateSignedUrl(
  key: string,
  operation: 'GET' | 'PUT' = 'GET',
  expiresIn: number = 3600
): Promise<string> {
  if (!isS3Enabled()) {
    // Return mock URL for development
    return `https://mock-s3.lifefile.com/${key}?expires=${Date.now() + expiresIn * 1000}`;
  }

  try {
    const client = getS3Client();
    
    const command = operation === 'PUT'
      ? new PutObjectCommand({
          Bucket: s3Config.bucketName,
          Key: key,
        })
      : new GetObjectCommand({
          Bucket: s3Config.bucketName,
          Key: key,
        });

    const url = await getSignedUrl(client, command, { expiresIn });
    
    // Use CloudFront URL if configured
    if (s3Config.cloudFrontUrl && operation === 'GET') {
      const cfUrl = new URL(url);
      cfUrl.host = new URL(s3Config.cloudFrontUrl).host;
      return cfUrl.toString();
    }
    
    return url;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Failed to generate signed URL:', error);
    throw new Error('Failed to generate file access URL');
  }
}

// Delete file from S3
export async function deleteFromS3(key: string): Promise<boolean> {
  if (!isS3Enabled()) {
    // Return success for development
    return true;
  }

  try {
    const client = getS3Client();
    
    const command = new DeleteObjectCommand({
      Bucket: s3Config.bucketName,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Delete failed:', error);
    throw new Error(S3_ERRORS.DELETE_FAILED);
  }
}

// List files in S3
export async function listS3Files(
  prefix: string,
  maxKeys: number = 100
): Promise<S3FileResponse[]> {
  if (!isS3Enabled()) {
    // Return mock list for development
    return [
      {
        key: 'mock/file1.pdf',
        url: 'https://mock-s3.lifefile.com/mock/file1.pdf',
        size: 1024,
        etag: 'mock-etag-1',
        contentType: 'application/pdf',
        lastModified: new Date(),
      },
      {
        key: 'mock/file2.jpg',
        url: 'https://mock-s3.lifefile.com/mock/file2.jpg',
        size: 2048,
        etag: 'mock-etag-2',
        contentType: 'image/jpeg',
        lastModified: new Date(),
      },
    ];
  }

  try {
    const client = getS3Client();
    
    const command = new ListObjectsV2Command({
      Bucket: s3Config.bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await client.send(command);
    const files: S3FileResponse[] = [];

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          const url = await generateSignedUrl(object.Key);
          files.push({
            key: object.Key,
            url,
            size: object.Size || 0,
            etag: object.ETag || '',
            contentType: 'application/octet-stream', // Would need HEAD request for actual type
            lastModified: object.LastModified || new Date(),
          });
        }
      }
    }

    return files;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] List failed:', error);
    return [];
  }
}

// Get file metadata
export async function getFileMetadata(key: string): Promise<Record<string, any>> {
  if (!isS3Enabled()) {
    return {
      mock: true,
      key,
      size: 1024,
      contentType: 'application/octet-stream',
    };
  }

  try {
    const client = getS3Client();
    
    const command = new HeadObjectCommand({
      Bucket: s3Config.bucketName,
      Key: key,
    });

    const response = await client.send(command);
    
    return {
      size: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
      metadata: response.Metadata,
      serverSideEncryption: response.ServerSideEncryption,
    };
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Failed to get metadata:', error);
    
    if (error.Code === 'NoSuchKey') {
      throw new Error(S3_ERRORS.FILE_NOT_FOUND);
    }
    
    throw error;
  }
}

// Archive file (move to archive folder)
export async function archiveFile(key: string): Promise<string> {
  if (!isS3Enabled()) {
    return `${STORAGE_CONFIG.PATHS.ARCHIVES}/${key}`;
  }

  try {
    const client = getS3Client();
    const archiveKey = `${STORAGE_CONFIG.PATHS.ARCHIVES}/${key}`;
    
    // Copy to archive
    const copyCommand = new CopyObjectCommand({
      Bucket: s3Config.bucketName,
      CopySource: `${s3Config.bucketName}/${key}`,
      Key: archiveKey,
    });

    await client.send(copyCommand);
    
    // Delete original
    await deleteFromS3(key);
    
    return archiveKey;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[S3] Archive failed:', error);
    throw new Error('Failed to archive file');
  }
}

// Validate file type
export function validateFileType(fileName: string, contentType: string): boolean {
  const allowedTypes = [
    ...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES,
    ...STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES,
    ...STORAGE_CONFIG.ALLOWED_MEDICAL_TYPES,
  ];
  
  return allowedTypes.includes(contentType);
}

// Validate file size
export function validateFileSize(size: number, contentType: string): boolean {
  if (STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return size <= STORAGE_CONFIG.MAX_IMAGE_SIZE;
  }
  
  if (STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES.includes(contentType)) {
    return size <= STORAGE_CONFIG.MAX_DOCUMENT_SIZE;
  }
  
  return size <= STORAGE_CONFIG.MAX_FILE_SIZE;
}

// Calculate file hash
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Mock upload for development
function mockUpload(params: UploadFileParams): S3FileResponse {
  const key = generateS3Key(params.category, params.fileName, params.patientId);
  
  return {
    key,
    url: `https://mock-s3.lifefile.com/${key}`,
    size: params.file instanceof Buffer ? params.file.length : 
           params.file instanceof Uint8Array ? params.file.length : 
           new Blob([params.file]).size,
    etag: 'mock-' + uuidv4(),
    contentType: params.contentType || 'application/octet-stream',
    lastModified: new Date(),
    metadata: params.metadata,
  };
}

// Export mock service for testing
export const mockS3Service = {
  uploadToS3: mockUpload,
  downloadFromS3: async (key: string) => Buffer.from(`Mock content for ${key}`),
  deleteFromS3: async (key: string) => true,
  listS3Files: async (prefix: string) => [
    {
      key: `${prefix}/mock-file.pdf`,
      url: `https://mock-s3.lifefile.com/${prefix}/mock-file.pdf`,
      size: 1024,
      etag: 'mock-etag',
      contentType: 'application/pdf',
      lastModified: new Date(),
    },
  ],
  generateSignedUrl: async (key: string) => `https://mock-s3.lifefile.com/${key}?mock=true`,
};
