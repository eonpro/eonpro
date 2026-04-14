import { NextRequest, NextResponse } from 'next/server';
import { withPharmacyAccessAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const patchSchema = z.object({
  trackingNumber: z.string().min(1).max(100).optional(),
  notes: z.string().max(500).optional(),
  assignedClinicId: z.number().int().positive().nullable().optional(),
});

async function patchHandler(req: NextRequest, user: AuthUser, context?: unknown) {
  try {
    const ctx = context as { params: Promise<{ id: string }> };
    const { id } = await ctx.params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }

    const body = await req.json();
    const validated = patchSchema.parse(body);

    const existing = await prisma.packagePhoto.findUnique({
      where: { id: photoId },
      select: { id: true, clinicId: true, trackingNumber: true, matched: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Package photo not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (validated.trackingNumber !== undefined) {
      updateData.trackingNumber = validated.trackingNumber.trim();
      updateData.trackingSource = 'manual';
    }

    if (validated.notes !== undefined) {
      updateData.notes = validated.notes.trim() || null;
    }

    if (validated.assignedClinicId !== undefined) {
      if (validated.assignedClinicId !== null) {
        const clinic = await basePrisma.clinic.findFirst({
          where: { id: validated.assignedClinicId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!clinic) {
          return NextResponse.json(
            { error: 'Assigned clinic not found or inactive' },
            { status: 400 }
          );
        }
      }
      updateData.assignedClinicId = validated.assignedClinicId;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.packagePhoto.update({
      where: { id: photoId },
      data: updateData,
      select: {
        id: true,
        lifefileId: true,
        trackingNumber: true,
        trackingSource: true,
        matched: true,
        matchStrategy: true,
        patientId: true,
        orderId: true,
        s3Url: true,
        notes: true,
        createdAt: true,
        assignedClinicId: true,
        assignedClinic: { select: { id: true, name: true } },
      },
    });

    logger.info('[PackagePhoto] Updated', {
      packagePhotoId: updated.id,
      lifefileId: updated.lifefileId,
      fieldsUpdated: Object.keys(updateData),
      updatedById: user.id,
      clinicId: user.clinicId,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return handleApiError(error, { context: { route: 'PATCH /api/package-photos/[id]' } });
  }
}

export const PATCH = withPharmacyAccessAuth(patchHandler);
