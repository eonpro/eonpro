/**
 * AWS S3 Download API Endpoint
 * 
 * Handles secure file downloads from S3
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { 
  downloadFromS3,
  generateSignedUrl,
  mockS3Service,
} from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, S3_ERRORS } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const redirect = searchParams.get('redirect') === 'true';

    if (!key) {
      return NextResponse.json(
        { error: 'File key is required' },
        { status: 400 }
      );
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Use mock service
      if (redirect) {
        const mockUrl = await mockS3Service.generateSignedUrl(key);
        return NextResponse.redirect(mockUrl);
      }
      
      const mockContent = await mockS3Service.downloadFromS3(key);
      return new NextResponse(new Uint8Array(mockContent), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
          'X-Mock-Service': 'true',
        },
      });
    }

    // Check if S3 is configured
    if (!isS3Enabled()) {
      return NextResponse.json(
        { error: S3_ERRORS.NOT_CONFIGURED },
        { status: 503 }
      );
    }

    // Option 1: Redirect to signed URL (recommended for large files)
    if (redirect) {
      const signedUrl = await generateSignedUrl(key, 'GET', 3600);
      return NextResponse.redirect(signedUrl);
    }

    // Option 2: Stream file through API (for small files or when direct access is not desired)
    const fileBuffer = await downloadFromS3(key);
    
    // Get filename from key
    const fileName = key.split('/').pop() || 'download';
    
    // Return file as response
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 Download] Error:', error);
    
    if (errorMessage === S3_ERRORS.FILE_NOT_FOUND) {
      return NextResponse.json(
        { error: S3_ERRORS.FILE_NOT_FOUND },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || S3_ERRORS.DOWNLOAD_FAILED },
      { status: 500 }
    );
  }
}