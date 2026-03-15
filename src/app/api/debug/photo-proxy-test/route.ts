/**
 * TEMPORARY diagnostic endpoint - tests the patient-photos image proxy code path
 * without auth to identify the exact error. REMOVE after debugging.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const steps: string[] = [];
  
  try {
    // Step 1: Test basePrisma import
    steps.push('1: importing basePrisma');
    const { basePrisma } = await import('@/lib/db');
    steps.push('1: OK');

    // Step 2: Test patientPhoto model access (this is where the guard throws in prod)
    steps.push('2: accessing basePrisma.patientPhoto');
    const photoModel = (basePrisma as any).patientPhoto;
    steps.push(`2: OK - type=${typeof photoModel}`);

    // Step 3: Test actual DB query
    steps.push('3: querying patientPhoto id=575');
    const photo = await (basePrisma as any).patientPhoto.findUnique({
      where: { id: 575 },
      select: {
        id: true,
        s3Key: true,
        thumbnailKey: true,
        mimeType: true,
        clinicId: true,
        isDeleted: true,
      },
    });
    steps.push(`3: OK - found=${!!photo}, clinicId=${photo?.clinicId}, s3Key=${photo?.s3Key?.substring(0, 40)}, thumbKey=${photo?.thumbnailKey?.substring(0, 40)}`);

    // Step 4: Test S3 config
    steps.push('4: checking S3 config');
    const { isS3Enabled, isS3Configured, s3Config } = await import('@/lib/integrations/aws/s3Config');
    steps.push(`4: OK - enabled=${isS3Enabled()}, configured=${isS3Configured()}, bucket=${s3Config.bucketName}, region=${s3Config.region}, hasAccessKey=${!!s3Config.accessKeyId}, hasSecretKey=${!!s3Config.secretAccessKey}`);

    // Step 5: Test S3 download (only if photo found and S3 configured)
    if (photo?.thumbnailKey && isS3Enabled()) {
      steps.push(`5: downloading from S3 key=${photo.thumbnailKey.substring(0, 50)}`);
      try {
        const { downloadFromS3 } = await import('@/lib/integrations/aws/s3Service');
        const buffer = await downloadFromS3(photo.thumbnailKey);
        steps.push(`5: OK - buffer size=${buffer.length}`);
      } catch (s3Err) {
        steps.push(`5: FAILED - ${s3Err instanceof Error ? s3Err.message : String(s3Err)}`);
      }
    } else if (photo?.s3Key && isS3Enabled()) {
      steps.push(`5: downloading from S3 key=${photo.s3Key.substring(0, 50)}`);
      try {
        const { downloadFromS3 } = await import('@/lib/integrations/aws/s3Service');
        const buffer = await downloadFromS3(photo.s3Key);
        steps.push(`5: OK - buffer size=${buffer.length}`);
      } catch (s3Err) {
        steps.push(`5: FAILED - ${s3Err instanceof Error ? s3Err.message : String(s3Err)}`);
      }
    } else {
      steps.push(`5: SKIPPED - photo=${!!photo}, s3Enabled=${isS3Enabled()}`);
    }

    return NextResponse.json({ success: true, steps });
  } catch (err) {
    steps.push(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({
      success: false,
      steps,
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : typeof err,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
    }, { status: 500 });
  }
}
