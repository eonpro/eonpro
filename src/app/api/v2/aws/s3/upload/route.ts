/**
 * AWS S3 Upload API Endpoint
 * 
 * Handles secure file uploads to S3 with validation
 * PROTECTED: Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  uploadToS3,
  validateFileType,
  validateFileSize,
  calculateFileHash,
  mockS3Service,
} from '@/lib/integrations/aws/s3Service';
import { 
  FileCategory,
  FileAccessLevel,
  isS3Enabled,
  S3_ERRORS,
} from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function uploadHandler(request: NextRequest, user: AuthUser) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string || file.name;
    const category = formData.get('category') as FileCategory || FileCategory.OTHER;
    const contentType = formData.get('contentType') as string || file.type;
    const accessLevel = formData.get('accessLevel') as FileAccessLevel || FileAccessLevel.PRIVATE;
    const patientId = formData.get('patientId') ? parseInt(formData.get('patientId') as string) : undefined;
    const providerId = formData.get('providerId') ? parseInt(formData.get('providerId') as string) : undefined;

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type (always validate, even in mock mode)
    if (!validateFileType(fileName, contentType)) {
      return NextResponse.json(
        { error: S3_ERRORS.INVALID_FILE_TYPE },
        { status: 400 }
      );
    }

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file size (always validate, even in mock mode)
    if (!validateFileSize(buffer.length, contentType)) {
      return NextResponse.json(
        { error: S3_ERRORS.FILE_TOO_LARGE },
        { status: 400 }
      );
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Use mock service for testing
      const mockResponse = await mockS3Service.uploadToS3({
        file: buffer,
        fileName,
        category,
        patientId,
        providerId,
        contentType,
        accessLevel,
      });

      return NextResponse.json({
        ...mockResponse,
        message: 'Using mock S3 service (feature not enabled)',
      });
    }

    // Calculate file hash for deduplication
    const fileHash = calculateFileHash(buffer);

    // Upload to S3
    const result = await uploadToS3({
      file: buffer,
      fileName,
      category,
      patientId,
      providerId,
      contentType,
      accessLevel,
      metadata: {
        fileHash,
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
      } as any,
    });

    // Log upload for audit
    logger.debug('[S3 Upload] Success:', {
      key: result.key,
      size: result.size,
      category,
      patientId,
      providerId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 Upload] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || S3_ERRORS.UPLOAD_FAILED },
      { status: 500 }
    );
  }
}

export const POST = withAuth(uploadHandler);

// Note: For large file uploads, configure body size limits in next.config.js