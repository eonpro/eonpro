/**
 * Admin - Photo Verification API
 *
 * Allows admin/staff to verify or reject ID photos.
 *
 * POST - Verify or reject a photo
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { PatientPhotoVerificationStatus, PatientPhotoType } from '@prisma/client';

// =============================================================================
// Request Schema
// =============================================================================

const verifyRequestSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  notes: z.string().optional(),
});

// =============================================================================
// ID Photo Types (require verification)
// =============================================================================

const ID_PHOTO_TYPES: PatientPhotoType[] = [
  PatientPhotoType.ID_FRONT,
  PatientPhotoType.ID_BACK,
  PatientPhotoType.SELFIE,
];

// =============================================================================
// POST /api/admin/patient-photos/[id]/verify
// =============================================================================

async function handlePost(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Only admin, provider, or staff can verify photos
    if (!['super_admin', 'admin', 'provider', 'staff'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await context.params;
    const photoId = parseInt(id);

    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = verifyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Get photo
    const photo = await prisma.patientPhoto.findUnique({
      where: { id: photoId },
      include: {
        patient: {
          select: { id: true, clinicId: true, firstName: true, lastName: true },
        },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Check clinic access for non-super admins
    if (user.role !== 'super_admin' && user.clinicId !== photo.patient.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if photo is an ID photo (only ID photos need verification)
    if (!ID_PHOTO_TYPES.includes(photo.type)) {
      return NextResponse.json(
        { error: 'This photo type does not require verification' },
        { status: 400 }
      );
    }

    // Check if photo is in a verifiable state
    const verifiableStatuses: PatientPhotoVerificationStatus[] = ['PENDING', 'IN_REVIEW'];
    if (!verifiableStatuses.includes(photo.verificationStatus)) {
      return NextResponse.json(
        {
          error: `Photo cannot be verified. Current status: ${photo.verificationStatus}`,
        },
        { status: 400 }
      );
    }

    // Update photo verification status
    const updatedPhoto = await prisma.patientPhoto.update({
      where: { id: photoId },
      data: {
        verificationStatus: parsed.data.status as PatientPhotoVerificationStatus,
        verifiedAt: new Date(),
        verifiedBy: user.id,
        verificationNotes: parsed.data.notes,
      },
      select: {
        id: true,
        type: true,
        verificationStatus: true,
        verifiedAt: true,
        verificationNotes: true,
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Log the verification action
    logger.info('[Photo Verification] Photo verification status updated', {
      photoId,
      patientId: photo.patientId,
      previousStatus: photo.verificationStatus,
      newStatus: parsed.data.status,
      verifiedBy: user.id,
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: parsed.data.status === 'VERIFIED' ? 'PHOTO_VERIFIED' : 'PHOTO_REJECTED',
        details: {
          photoId,
          photoType: photo.type,
          patientId: photo.patientId,
          notes: parsed.data.notes,
        },
        resource: 'PatientPhoto',
        resourceId: photoId,
        clinicId: user.clinicId || photo.patient.clinicId,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      photo: updatedPhoto,
    });
  } catch (error) {
    logger.error('[Photo Verification] Error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to verify photo' }, { status: 500 });
  }
}

// =============================================================================
// Export
// =============================================================================

export const POST = withAuth(
  (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
    handlePost(req, user, context!)
);
