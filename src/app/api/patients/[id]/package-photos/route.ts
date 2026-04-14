/**
 * GET /api/patients/[id]/package-photos
 *
 * Returns package photos linked to a specific patient.
 * These are photos taken by pharmacy reps when fulfilling prescriptions,
 * matched to the patient via LifeFile order ID or patient LifeFile ID.
 *
 * Each photo includes its linked order and Rx (prescription) details
 * so the UI can show which prescription the package photo belongs to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { ensureTenantResource } from '@/lib/tenant-response';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled } from '@/lib/integrations/aws/s3Config';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const GET = withAuthParams(async (req: NextRequest, user: any, context: RouteContext) => {
  try {
    const resolvedParams = await context.params;
    const patientId = parseInt(resolvedParams.id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
    const notFound = ensureTenantResource(patient, clinicId);
    if (notFound) return notFound;

    const url = new URL(req.url);
    const params = querySchema.parse(Object.fromEntries(url.searchParams));

    const where: Record<string, unknown> = { patientId };
    if (clinicId) {
      where.clinicId = clinicId;
    }

    const [photos, total] = await Promise.all([
      prisma.packagePhoto.findMany({
        where,
        include: {
          capturedBy: { select: { id: true, firstName: true, lastName: true } },
          order: {
            select: {
              id: true,
              lifefileOrderId: true,
              status: true,
              trackingNumber: true,
              primaryMedName: true,
              primaryMedStrength: true,
              primaryMedForm: true,
              createdAt: true,
              rxs: {
                select: {
                  id: true,
                  medName: true,
                  strength: true,
                  form: true,
                  quantity: true,
                  sig: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.packagePhoto.count({ where }),
    ]);

    const s3Active = isS3Enabled();
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        let freshUrl: string | null = photo.s3Url;

        if (s3Active && photo.s3Key) {
          try {
            freshUrl = await generateSignedUrl(photo.s3Key, 'GET', 3600);
          } catch {
            logger.warn('[PatientPackagePhotos] Failed to generate signed URL', {
              photoId: photo.id,
              s3Key: photo.s3Key,
            });
          }
        }

        if (freshUrl?.includes('mock-s3')) {
          freshUrl = null;
        }

        return {
          id: photo.id,
          createdAt: photo.createdAt,
          lifefileId: photo.lifefileId,
          trackingNumber: photo.trackingNumber,
          trackingSource: photo.trackingSource,
          s3Url: freshUrl,
          contentType: photo.contentType,
          fileSize: photo.fileSize,
          notes: photo.notes,
          matched: photo.matched,
          matchStrategy: photo.matchStrategy,
          capturedBy: photo.capturedBy,
          order: photo.order
            ? {
                id: photo.order.id,
                lifefileOrderId: photo.order.lifefileOrderId,
                status: photo.order.status,
                trackingNumber: photo.order.trackingNumber,
                primaryMedName: photo.order.primaryMedName,
                primaryMedStrength: photo.order.primaryMedStrength,
                primaryMedForm: photo.order.primaryMedForm,
                createdAt: photo.order.createdAt,
                rxs: photo.order.rxs,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: photosWithUrls,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  } catch (error: unknown) {
    logger.error('[PatientPackagePhotos] GET error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load package photos' }, { status: 500 });
  }
});
