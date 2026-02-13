/**
 * Admin - Pending Photo Verification Queue
 *
 * Lists photos that require verification (ID photos).
 *
 * GET - List pending ID photos for verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@prisma/client';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';

// =============================================================================
// ID Photo Types (require verification)
// =============================================================================

const ID_PHOTO_TYPES = [
  PatientPhotoType.ID_FRONT,
  PatientPhotoType.ID_BACK,
  PatientPhotoType.SELFIE,
];

// =============================================================================
// GET /api/admin/patient-photos/pending
// =============================================================================

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Only admin, provider, or staff can view pending verifications
    if (!['super_admin', 'admin', 'provider', 'staff'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || 'PENDING';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build query
    const where: any = {
      type: { in: ID_PHOTO_TYPES },
      verificationStatus: status as PatientPhotoVerificationStatus,
      isDeleted: false,
    };

    // Non-super admins can only see their clinic's photos
    if (user.role !== 'super_admin' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    // Get total count
    const total = await prisma.patientPhoto.count({ where });

    // Get pending photos with patient info
    const photos = await prisma.patientPhoto.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first for FIFO processing
      skip: (page - 1) * limit,
      take: limit,
    });

    // Generate signed URLs for photos
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        try {
          const s3Url = await generateSignedUrl(photo.s3Key, 'GET', 3600);
          const thumbnailUrl = photo.thumbnailKey
            ? await generateSignedUrl(photo.thumbnailKey, 'GET', 3600)
            : null;

          return {
            id: photo.id,
            createdAt: photo.createdAt,
            type: photo.type,
            s3Url,
            thumbnailUrl,
            verificationStatus: photo.verificationStatus,
            patient: photo.patient,
            clinic: photo.clinic,
          };
        } catch (error) {
          logger.warn('[Pending Photos] Failed to generate URL', {
            photoId: photo.id,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          return {
            id: photo.id,
            createdAt: photo.createdAt,
            type: photo.type,
            s3Url: null,
            thumbnailUrl: null,
            verificationStatus: photo.verificationStatus,
            patient: photo.patient,
            clinic: photo.clinic,
          };
        }
      })
    );

    // Get counts by status for overview
    const counts = await prisma.patientPhoto.groupBy({
      by: ['verificationStatus'],
      where: {
        type: { in: ID_PHOTO_TYPES },
        isDeleted: false,
        ...(user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : {}),
      },
      _count: true,
    });

    const statusCounts = counts.reduce(
      (acc, item) => {
        acc[item.verificationStatus] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      photos: photosWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statusCounts: {
        PENDING: statusCounts.PENDING || 0,
        IN_REVIEW: statusCounts.IN_REVIEW || 0,
        VERIFIED: statusCounts.VERIFIED || 0,
        REJECTED: statusCounts.REJECTED || 0,
      },
    });
  } catch (error) {
    logger.error('[Pending Photos] Error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch pending photos' }, { status: 500 });
  }
}

// =============================================================================
// Export
// =============================================================================

export const GET = withAuth(handleGet);
