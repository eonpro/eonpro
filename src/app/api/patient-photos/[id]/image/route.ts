/**
 * GET /api/patient-photos/[id]/image
 *
 * Server-side image proxy for PatientPhoto records.
 * Downloads from S3 and streams to the browser as same-origin,
 * avoiding S3 CORS issues on subdomains like wellmedr.eonpro.io.
 *
 * Supports ?thumb=1 query param to serve the thumbnail variant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { downloadFromS3 } from '@/lib/integrations/aws/s3Service';
import { logger } from '@/lib/logger';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withAuthParams(async (req: NextRequest, user: any, context: RouteContext) => {
  try {
    const { id } = await context.params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return new NextResponse('Invalid photo ID', { status: 400 });
    }

    const useThumb = req.nextUrl.searchParams.get('thumb') === '1';

    const photo = await prisma.patientPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        s3Key: true,
        thumbnailKey: true,
        mimeType: true,
        clinicId: true,
        isDeleted: true,
      },
    });

    if (!photo || photo.isDeleted) {
      return new NextResponse('Not found', { status: 404 });
    }

    if (user.role !== 'super_admin' && user.clinicId !== photo.clinicId) {
      return new NextResponse('Access denied', { status: 403 });
    }

    const s3Key = useThumb && photo.thumbnailKey ? photo.thumbnailKey : photo.s3Key;
    if (!s3Key) {
      return new NextResponse('No image available', { status: 404 });
    }

    const imageBuffer = await downloadFromS3(s3Key);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': photo.mimeType || 'image/jpeg',
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
        'Content-Length': String(imageBuffer.length),
      },
    });
  } catch (error: unknown) {
    logger.error('[PatientPhoto] Image proxy failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse('Failed to load image', { status: 500 });
  }
});
