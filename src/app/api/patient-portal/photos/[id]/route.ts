/**
 * Patient Portal - Single Photo API
 *
 * Handles operations on individual photos.
 *
 * GET - Get photo details with fresh signed URL
 * PATCH - Update photo metadata (title, notes, etc.)
 * DELETE - Soft delete a photo
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { generateSignedUrl, deleteFromS3 } from '@/lib/integrations/aws/s3Service';
import { logPHIAccess, logPHIUpdate, logPHIDelete } from '@/lib/audit/hipaa-audit';

// =============================================================================
// Request Schemas
// =============================================================================

const updatePhotoSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  weight: z.number().optional(),
  takenAt: z.string().datetime().optional(),
  category: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

// =============================================================================
// Helpers
// =============================================================================

async function getPhotoWithAccess(
  photoId: number,
  user: AuthUser
): Promise<{
  photo: any;
  canAccess: boolean;
  canModify: boolean;
}> {
  const photo = await prisma.patientPhoto.findUnique({
    where: { id: photoId },
    include: {
      patient: {
        select: { id: true, clinicId: true },
      },
    },
  });

  if (!photo) {
    return { photo: null, canAccess: false, canModify: false };
  }

  // Super admin can access all
  if (user.role === 'super_admin') {
    return { photo, canAccess: true, canModify: true };
  }

  // Patient can only access their own photos
  if (user.role === 'patient') {
    const isOwner = user.patientId === photo.patientId;
    return { photo, canAccess: isOwner, canModify: isOwner };
  }

  // Staff/Provider/Admin - check clinic access
  const hasClinicAccess = user.clinicId === photo.patient.clinicId;
  return { photo, canAccess: hasClinicAccess, canModify: hasClinicAccess };
}

// =============================================================================
// GET /api/patient-portal/photos/[id]
// =============================================================================

async function handleGet(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const photoId = parseInt(id);

    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const { photo, canAccess } = await getPhotoWithAccess(photoId, user);

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generate fresh signed URLs
    const [s3Url, thumbnailUrl] = await Promise.all([
      generateSignedUrl(photo.s3Key, 'GET', 3600),
      photo.thumbnailKey ? generateSignedUrl(photo.thumbnailKey, 'GET', 3600) : null,
    ]);

    // Remove internal fields
    const { patient, ...photoData } = photo;

    await logPHIAccess(req, user, 'PatientPhoto', String(photoId), photo.patientId, {
      photoType: photo.type,
    });

    return NextResponse.json({
      photo: {
        ...photoData,
        s3Url,
        thumbnailUrl,
      },
    });
  } catch (error) {
    logger.error('[Photos API] GET single error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch photo' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/patient-portal/photos/[id]
// =============================================================================

async function handlePatch(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const photoId = parseInt(id);

    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updatePhotoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { photo, canAccess, canModify } = await getPhotoWithAccess(photoId, user);

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!canModify) {
      return NextResponse.json({ error: 'Cannot modify this photo' }, { status: 403 });
    }

    // Don't allow modification of deleted photos
    if (photo.isDeleted) {
      return NextResponse.json({ error: 'Cannot modify deleted photo' }, { status: 400 });
    }

    // Build update data
    const updateData: any = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.weight !== undefined) updateData.weight = parsed.data.weight;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.isPrivate !== undefined) updateData.isPrivate = parsed.data.isPrivate;
    if (parsed.data.takenAt !== undefined) updateData.takenAt = new Date(parsed.data.takenAt);

    // Update photo
    const updatedPhoto = await prisma.patientPhoto.update({
      where: { id: photoId },
      data: updateData,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        type: true,
        category: true,
        s3Key: true,
        thumbnailKey: true,
        title: true,
        notes: true,
        weight: true,
        takenAt: true,
        verificationStatus: true,
        isPrivate: true,
      },
    });

    // Generate fresh signed URLs
    const [s3Url, thumbnailUrl] = await Promise.all([
      generateSignedUrl(updatedPhoto.s3Key, 'GET', 3600),
      updatedPhoto.thumbnailKey ? generateSignedUrl(updatedPhoto.thumbnailKey, 'GET', 3600) : null,
    ]);

    logger.info('[Photos API] Photo updated', {
      photoId,
      updatedBy: user.id,
      fields: Object.keys(updateData),
    });

    await logPHIUpdate(req, user, 'PatientPhoto', String(photoId), photo.patientId, Object.keys(updateData));

    return NextResponse.json({
      photo: {
        ...updatedPhoto,
        s3Url,
        thumbnailUrl,
      },
    });
  } catch (error) {
    logger.error('[Photos API] PATCH error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/patient-portal/photos/[id]
// =============================================================================

async function handleDelete(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const photoId = parseInt(id);

    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const permanent = searchParams.get('permanent') === 'true';
    const reason = searchParams.get('reason') || undefined;

    const { photo, canAccess, canModify } = await getPhotoWithAccess(photoId, user);

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!canModify) {
      return NextResponse.json({ error: 'Cannot delete this photo' }, { status: 403 });
    }

    // Permanent deletion (only for super_admin or if already soft-deleted)
    if (permanent && (user.role === 'super_admin' || photo.isDeleted)) {
      // Delete from S3
      try {
        await deleteFromS3(photo.s3Key);
        if (photo.thumbnailKey) {
          await deleteFromS3(photo.thumbnailKey);
        }
      } catch (error) {
        logger.warn('[Photos API] Failed to delete from S3', {
          photoId,
          s3Key: photo.s3Key,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with DB deletion even if S3 fails
      }

      // Hard delete from database
      await prisma.patientPhoto.delete({
        where: { id: photoId },
      });

      logger.info('[Photos API] Photo permanently deleted', {
        photoId,
        deletedBy: user.id,
      });

      await logPHIDelete(req, user, 'PatientPhoto', String(photoId), photo.patientId, reason || 'Permanent deletion');

      return NextResponse.json({ success: true, permanent: true });
    }

    // Soft delete
    if (photo.isDeleted) {
      return NextResponse.json({ error: 'Photo already deleted' }, { status: 400 });
    }

    await prisma.patientPhoto.update({
      where: { id: photoId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
        deletionReason: reason,
      },
    });

    logger.info('[Photos API] Photo soft deleted', {
      photoId,
      deletedBy: user.id,
      reason,
    });

    await logPHIDelete(req, user, 'PatientPhoto', String(photoId), photo.patientId, reason || 'Soft deletion');

    return NextResponse.json({ success: true, permanent: false });
  } catch (error) {
    logger.error('[Photos API] DELETE error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
  }
}

// =============================================================================
// Exports with context
// =============================================================================

export const GET = withAuth(
  (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
    handleGet(req, user, context!)
);

export const PATCH = withAuth(
  (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
    handlePatch(req, user, context!)
);

export const DELETE = withAuth(
  (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
    handleDelete(req, user, context!)
);
