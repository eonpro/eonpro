/**
 * Document Upload Diagnostics — S3/Storage readiness for patient documents
 * ==========================================================================
 *
 * GET /api/diagnostics/document-upload
 * Admin/provider only. Returns S3 feature flag, config, and bucket accessibility
 * to troubleshoot 503 on POST /api/patients/:id/documents.
 *
 * Does NOT expose secrets. Use to verify env vars and bucket before upload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { withAuth } from '@/lib/auth/middleware';
import {
  isS3Enabled,
  isS3Configured,
  s3Config,
} from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { getS3Client } from '@/lib/integrations/aws/s3Service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(
  async (request: NextRequest, user: { role: string }) => {
    if (user.role !== 'admin' && user.role !== 'provider' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin or provider required' }, { status: 403 });
    }

    const featureEnabled = isFeatureEnabled('AWS_S3_STORAGE');
    const hasBucket =
      !!process.env.AWS_S3_DOCUMENTS_BUCKET_NAME || !!process.env.AWS_S3_BUCKET_NAME;
    const hasCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    const hasRegion = !!process.env.AWS_REGION;
    const configured = isS3Configured();
    const enabled = isS3Enabled();
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    const diagnostics: Record<string, unknown> = {
      featureEnabled,
      hasBucket,
      hasCredentials,
      hasRegion,
      configured,
      enabled,
      isProduction,
      bucketName: s3Config.bucketName || '(not set)',
      region: s3Config.region || '(not set)',
    };

    let headBucketOk: boolean | null = null;
    let headBucketError: string | null = null;
    let awsErrorCode: string | null = null;

    if (enabled) {
      try {
        const client = getS3Client();
        await client.send(
          new HeadBucketCommand({ Bucket: s3Config.bucketName })
        );
        headBucketOk = true;
      } catch (err: unknown) {
        headBucketOk = false;
        const e = err as { Code?: string; message?: string };
        headBucketError = e?.message || String(err);
        awsErrorCode = e?.Code || null;
      }
    }

    Object.assign(diagnostics, {
      headBucketOk,
      headBucketError: headBucketError ? headBucketError.slice(0, 200) : null,
      awsErrorCode,
    });

    const ok = enabled && headBucketOk !== false;
    const suggestions: string[] = [];

    if (!featureEnabled) {
      suggestions.push(
        'Set NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true in Vercel. Redeploy required (NEXT_PUBLIC_ vars are inlined at build).'
      );
    }
    if (!hasCredentials) {
      suggestions.push('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel.');
    }
    if (!hasBucket) {
      suggestions.push(
        'Set AWS_S3_DOCUMENTS_BUCKET_NAME or AWS_S3_BUCKET_NAME in Vercel.'
      );
    }
    if (!hasRegion) {
      suggestions.push('Set AWS_REGION in Vercel (e.g. us-east-2).');
    }
    if (enabled && headBucketOk === false) {
      const hint =
        awsErrorCode === 'NotFound' || awsErrorCode === 'NoSuchBucket'
          ? 'Create the bucket in AWS S3, or fix the bucket name.'
          : awsErrorCode === 'AccessDenied' || awsErrorCode === 'Forbidden'
            ? 'IAM user needs s3:ListBucket (HeadBucket) and s3:PutObject on the bucket.'
            : 'Check IAM permissions and bucket region.';
      suggestions.push(hint);
    }

    return NextResponse.json({
      ok,
      diagnostics,
      suggestions: suggestions.length ? suggestions : ok ? [] : ['See docs/DOCUMENT_UPLOAD_503_RUNBOOK.md'],
    });
  },
  { roles: ['admin', 'provider', 'super_admin'] }
);
