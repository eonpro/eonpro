/**
 * AWS S3 Health Check API Endpoint
 * 
 * Checks if S3 bucket is accessible
 */

import { NextRequest, NextResponse } from 'next/server';
import { getS3Client } from '@/lib/integrations/aws/s3Service';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { isS3Enabled, s3Config } from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';

export async function GET(request: NextRequest) {
  try {
    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      return NextResponse.json({
        healthy: true,
        message: 'Using mock S3 service (feature not enabled)',
        mock: true,
      });
    }

    // Check if S3 is configured
    if (!isS3Enabled()) {
      return NextResponse.json({
        healthy: false,
        message: 'S3 is not properly configured',
        configured: false,
      });
    }

    // Try to access the bucket
    try {
      const client = getS3Client();
      const command = new HeadBucketCommand({
        Bucket: s3Config.bucketName,
      });
      
      await client.send(command);
      
      return NextResponse.json({
        healthy: true,
        message: 'S3 bucket is accessible',
        bucket: s3Config.bucketName,
      });
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
        healthy: false,
        message: `Cannot access bucket: ${errorMessage}`,
        error: error.Code || error.name,
      });
    }
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      healthy: false,
      message: errorMessage || 'Health check failed',
    });
  }
}
