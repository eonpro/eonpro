/**
 * AWS S3 Archive API Endpoint
 * 
 * Archives files to long-term storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { archiveFile, mockS3Service } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, S3_ERRORS } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: 'File key is required' },
        { status: 400 }
      );
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Mock response
      const archiveKey = `archives/${key}`;
      return NextResponse.json({
        success: true,
        originalKey: key,
        archiveKey,
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

    // Archive the file
    const archiveKey = await archiveFile(key);

    return NextResponse.json({
      success: true,
      originalKey: key,
      archiveKey,
      message: 'File archived successfully',
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 Archive] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to archive file' },
      { status: 500 }
    );
  }
}
