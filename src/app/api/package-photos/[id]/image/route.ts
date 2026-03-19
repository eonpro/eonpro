import { NextRequest, NextResponse } from 'next/server';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { downloadFromS3 } from '@/lib/integrations/aws/s3Service';
import { logger } from '@/lib/logger';

async function getHandler(
  req: NextRequest,
  user: AuthUser,
  context?: unknown,
) {
  try {
    const ctx = context as { params: Promise<{ id: string }> };
    const { id } = await ctx.params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return new NextResponse('Invalid photo ID', { status: 400 });
    }

    const photo = await prisma.packagePhoto.findUnique({
      where: { id: photoId },
      select: { id: true, s3Key: true, contentType: true },
    });

    if (!photo) {
      return new NextResponse('Not found', { status: 404 });
    }

    if (!photo.s3Key) {
      return new NextResponse('No image available', { status: 404 });
    }

    const imageBuffer = await downloadFromS3(photo.s3Key);

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': photo.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
        'Content-Length': String(imageBuffer.length),
      },
    });
  } catch (error: unknown) {
    logger.error('[PackagePhoto] Image proxy failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse('Failed to load image', { status: 500 });
  }
}

export const GET = withPharmacyAccessAuth(getHandler);
