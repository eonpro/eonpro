/**
 * Admin Verification Queue API
 *
 * Manages ID verification photos for admin review.
 * GET - List pending verifications with filtering
 * PATCH - Update verification status (approve/reject)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { PatientPhotoVerificationStatus } from '@prisma/client';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';

// =============================================================================
// Request Schemas
// =============================================================================

const updateVerificationSchema = z.object({
  photoId: z.number(),
  action: z.enum(['approve', 'reject', 'request_resubmit']),
  notes: z.string().optional(),
});

// =============================================================================
// GET /api/admin/verification-queue
// =============================================================================

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || 'PENDING';
    const clinicId = searchParams.get('clinicId');

    // Build where clause
    const where: any = {
      type: { in: ['ID_FRONT', 'ID_BACK', 'SELFIE'] },
      isDeleted: false,
    };

    // Filter by status
    if (status !== 'all') {
      where.verificationStatus = status as PatientPhotoVerificationStatus;
    }

    // Filter by clinic (unless super_admin viewing all)
    if (user.role !== 'super_admin') {
      where.clinicId = user.clinicId;
    } else if (clinicId) {
      where.clinicId = parseInt(clinicId);
    }

    // Get total count
    const total = await prisma.patientPhoto.count({ where });

    // Get photos with patient info
    const photos = await prisma.patientPhoto.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        type: true,
        s3Key: true,
        thumbnailKey: true,
        verificationStatus: true,
        verificationNotes: true,
        verifiedAt: true,
        verifiedBy: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            patientId: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first
      skip: (page - 1) * limit,
      take: limit,
    });

    // Generate signed URLs for photos
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        try {
          const [s3Url, thumbnailUrl] = await Promise.all([
            generateSignedUrl(photo.s3Key, 'GET', 3600),
            photo.thumbnailKey ? generateSignedUrl(photo.thumbnailKey, 'GET', 3600) : null,
          ]);
          return { ...photo, s3Url, thumbnailUrl };
        } catch {
          return { ...photo, s3Url: null, thumbnailUrl: null };
        }
      })
    );

    // Group photos by patient for easier review
    const grouped = photosWithUrls.reduce((acc: any, photo) => {
      const patientId = photo.patient.id;
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: photo.patient,
          clinic: photo.clinic,
          photos: [],
        };
      }
      acc[patientId].photos.push(photo);
      return acc;
    }, {});

    // Get stats
    const stats = await prisma.patientPhoto.groupBy({
      by: ['verificationStatus'],
      where: {
        type: { in: ['ID_FRONT', 'ID_BACK', 'SELFIE'] },
        isDeleted: false,
        ...(user.role !== 'super_admin' ? { clinicId: user.clinicId } : {}),
      },
      _count: true,
    });

    const statsByStatus = stats.reduce((acc: Record<string, number>, s) => {
      acc[s.verificationStatus] = s._count;
      return acc;
    }, {});

    return NextResponse.json({
      verifications: Object.values(grouped),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        byStatus: statsByStatus,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isPrismaError =
      errorMessage.includes('does not exist') ||
      errorMessage.includes('P2021') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('table');

    logger.error('[Verification Queue] GET error', {
      userId: user.id,
      error: errorMessage,
      isPrismaError,
    });

    if (isPrismaError) {
      // Table might not exist yet - return empty result gracefully
      return NextResponse.json({
        verifications: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
        stats: {
          byStatus: {},
        },
      });
    }

    return NextResponse.json({ error: 'Failed to fetch verification queue' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/admin/verification-queue
// =============================================================================

async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = updateVerificationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { photoId, action, notes } = parsed.data;

    // Get the photo
    const photo = await prisma.patientPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        type: true,
        verificationStatus: true,
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && user.clinicId !== photo.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Determine new status based on action
    let newStatus: PatientPhotoVerificationStatus;
    switch (action) {
      case 'approve':
        newStatus = 'VERIFIED';
        break;
      case 'reject':
        newStatus = 'REJECTED';
        break;
      case 'request_resubmit':
        // Using EXPIRED to indicate resubmission needed (per schema enum)
        newStatus = 'EXPIRED';
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update the photo
    const updated = await prisma.patientPhoto.update({
      where: { id: photoId },
      data: {
        verificationStatus: newStatus,
        verificationNotes: notes,
        verifiedAt: new Date(),
        verifiedBy: user.id,
      },
      select: {
        id: true,
        type: true,
        verificationStatus: true,
        verificationNotes: true,
        verifiedAt: true,
      },
    });

    // Log audit trail
    logger.info('[Verification Queue] Photo verification updated', {
      photoId,
      patientId: photo.patientId,
      clinicId: photo.clinicId,
      action,
      newStatus,
      verifiedBy: user.id,
    });

    // Check if all ID photos for this patient are now verified
    if (action === 'approve') {
      const pendingPhotos = await prisma.patientPhoto.count({
        where: {
          patientId: photo.patientId,
          type: { in: ['ID_FRONT', 'ID_BACK', 'SELFIE'] },
          verificationStatus: { not: 'VERIFIED' },
          isDeleted: false,
        },
      });

      if (pendingPhotos === 0) {
        // All ID photos verified - could trigger notification or update patient status
        logger.info('[Verification Queue] Patient fully verified', {
          patientId: photo.patientId,
          clinicId: photo.clinicId,
        });
      }
    }

    return NextResponse.json({
      photo: updated,
      message: `Photo ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'marked for resubmission'}`,
    });
  } catch (error) {
    logger.error('[Verification Queue] PATCH error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 });
  }
}

// =============================================================================
// Exports
// =============================================================================

export const GET = withAdminAuth(handleGet);
export const PATCH = withAdminAuth(handlePatch);
