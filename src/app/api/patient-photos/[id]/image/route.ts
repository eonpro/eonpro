/**
 * GET /api/patient-photos/[id]/image
 *
 * Server-side image proxy for PatientPhoto records.
 * Downloads from S3 and streams to the browser as same-origin,
 * avoiding S3 CORS issues on subdomains like wellmedr.eonpro.io.
 *
 * Supports ?thumb=1 query param to serve the thumbnail variant.
 *
 * Uses basePrisma (no tenant filter) for the lookup because this route
 * does its own clinic-access check and must work regardless of how the
 * middleware resolved the effective clinicId.
 *
 * Uses withAuth (not withAuthParams) because withAuth creates a proper
 * NextRequest preserving nextUrl; withAuthParams uses req.clone() which
 * drops NextRequest properties and causes 500 in addSecurityHeaders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { downloadFromS3 } from '@/lib/integrations/aws/s3Service';
import { logger } from '@/lib/logger';
import { hasClinicAccess } from '@/lib/auth/middleware-cache';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withAuth<RouteContext>(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const photoId = parseInt(id, 10);
      if (isNaN(photoId)) {
        return new NextResponse('Invalid photo ID', { status: 400 });
      }

      const useThumb = req.nextUrl.searchParams.get('thumb') === '1';

      let photo;
      try {
        photo = await basePrisma.patientPhoto.findUnique({
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
      } catch (dbError) {
        logger.error('[PatientPhoto] DB lookup failed', {
          photoId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
        return new NextResponse('Service temporarily unavailable', { status: 503 });
      }

      if (!photo || photo.isDeleted) {
        return new NextResponse('Not found', { status: 404 });
      }

      if (user.role !== 'super_admin') {
        const clinicMatch =
          user.clinicId === photo.clinicId ||
          (photo.clinicId != null &&
            (await hasClinicAccess(user.id, photo.clinicId, user.providerId)));
        if (!clinicMatch) {
          return new NextResponse('Access denied', { status: 403 });
        }
      }

      const s3Key = useThumb && photo.thumbnailKey ? photo.thumbnailKey : photo.s3Key;
      if (!s3Key) {
        return new NextResponse('No image available', { status: 404 });
      }

      try {
        const imageBuffer = await downloadFromS3(s3Key);

        return new NextResponse(new Uint8Array(imageBuffer), {
          headers: {
            'Content-Type': photo.mimeType || 'image/jpeg',
            'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
            'Content-Length': String(imageBuffer.length),
          },
        });
      } catch (s3Error) {
        logger.error('[PatientPhoto] S3 download failed', {
          photoId,
          s3Key: s3Key.substring(0, 60),
          error: s3Error instanceof Error ? s3Error.message : String(s3Error),
          errorName: s3Error instanceof Error ? s3Error.constructor.name : undefined,
        });
        return new NextResponse('Failed to load image', { status: 502 });
      }
    } catch (outerError) {
      logger.error('[PatientPhoto] Unhandled error in image proxy', {
        error: outerError instanceof Error ? outerError.message : String(outerError),
      });
      return NextResponse.json(
        {
          error: 'UNHANDLED_ERROR',
          message: outerError instanceof Error ? outerError.message : String(outerError),
        },
        { status: 500 }
      );
    }
  }
);
