/**
 * AWS S3 Signed URL API Endpoint
 * 
 * Generates signed URLs for secure file access
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSignedUrl, mockS3Service } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, S3_ERRORS } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { key, operation = 'GET', expiresIn = 3600 } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: 'File key is required' },
        { status: 400 }
      );
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Use mock service
      const mockUrl = await mockS3Service.generateSignedUrl(key);
      return NextResponse.json({
        url: mockUrl,
        expiresIn,
        message: '⚠️ Using mock S3 service (feature not enabled)',
      });
    }

    // Check if S3 is configured
    if (!isS3Enabled()) {
      return NextResponse.json(
        { error: S3_ERRORS.NOT_CONFIGURED },
        { status: 503 }
      );
    }

    // Generate signed URL
    const url = await generateSignedUrl(key, operation as 'GET' | 'PUT', expiresIn);

    return NextResponse.json({
      url,
      expiresIn,
      operation,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 Signed URL] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
}
