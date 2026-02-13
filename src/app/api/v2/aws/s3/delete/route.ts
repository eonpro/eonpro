/**
 * AWS S3 Delete API Endpoint
 *
 * Handles secure file deletion from S3
 * PROTECTED: Requires authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteFromS3, mockS3Service } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, S3_ERRORS } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function deleteHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can delete files
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: 'File key is required' }, { status: 400 });
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Use mock service
      const success = await mockS3Service.deleteFromS3(key);
      return NextResponse.json({
        success,
        message: 'Using mock S3 service (feature not enabled)',
      });
    }

    // Check if S3 is configured
    if (!isS3Enabled()) {
      return NextResponse.json({ error: S3_ERRORS.NOT_CONFIGURED }, { status: 503 });
    }

    // Delete from S3
    const success = await deleteFromS3(key);

    // Log deletion for audit
    logger.debug('[S3 Delete] Success:', { key });

    return NextResponse.json({ success });
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 Delete] Error:', error);

    return NextResponse.json({ error: errorMessage || S3_ERRORS.DELETE_FAILED }, { status: 500 });
  }
}

export const DELETE = withAuth(deleteHandler);
