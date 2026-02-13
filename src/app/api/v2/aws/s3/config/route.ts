/**
 * AWS S3 Configuration API Endpoint
 *
 * Returns current S3 configuration status
 */

import { NextRequest, NextResponse } from 'next/server';
import { isS3Configured, isS3Enabled, s3Config } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  const featureEnabled = isFeatureEnabled('AWS_S3_STORAGE');
  const configured = isS3Configured();
  const enabled = isS3Enabled();

  return NextResponse.json({
    featureEnabled,
    configured,
    enabled,
    config: {
      region: s3Config.region,
      bucketName: s3Config.bucketName,
      hasAccessKey: !!s3Config.accessKeyId,
      hasSecretKey: !!s3Config.secretAccessKey,
      hasCloudFront: !!s3Config.cloudFrontUrl,
      hasKmsKey: !!s3Config.kmsKeyId,
    },
    message: enabled
      ? 'S3 is fully configured and enabled'
      : !featureEnabled
        ? 'Feature flag AWS_S3_STORAGE is not enabled'
        : 'S3 credentials are not fully configured',
  });
}
