/**
 * POST /api/admin/affiliates/attribute
 *
 * Manually attribute a patient to an affiliate ref code.
 * Used for data reconciliation when automatic attribution was missed.
 *
 * Body: { patientId: number, refCode: string, force?: boolean }
 *
 * DELETE /api/admin/affiliates/attribute
 *
 * Remove affiliate attribution from a patient.
 *
 * Body: { patientId: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { attributeFromIntake } from '@/services/affiliate/attributionService';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { badRequest, notFound, serverError } from '@/lib/api/error-response';

// ---------------------------------------------------------------------------
// POST — attribute patient to affiliate
// ---------------------------------------------------------------------------
async function handlePost(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId, refCode, force } = body as {
      patientId?: number;
      refCode?: string;
      force?: boolean;
    };

    if (!patientId || !refCode) {
      return badRequest('patientId and refCode are required');
    }

    const normalizedCode = refCode.trim().toUpperCase();

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        clinicId: true,
        attributionAffiliateId: true,
        attributionRefCode: true,
      },
    });

    if (!patient) {
      return notFound('Patient not found');
    }

    // Check if already attributed
    if (patient.attributionAffiliateId && !force) {
      return NextResponse.json(
        {
          success: false,
          message: `Patient is already attributed to affiliate ID ${patient.attributionAffiliateId} (refCode: ${patient.attributionRefCode}). Pass force=true to override.`,
        },
        { status: 409 }
      );
    }

    // If force is true and patient already attributed, clear existing attribution first
    if (force && patient.attributionAffiliateId) {
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          attributionAffiliateId: null,
          attributionRefCode: null,
          attributionFirstTouchAt: null,
        },
      });
      logger.info('[ManualAttribution] Cleared existing attribution for force override', {
        patientId,
        previousAffiliateId: patient.attributionAffiliateId,
        previousRefCode: patient.attributionRefCode,
      });
    }

    // Attempt attribution
    const result = await attributeFromIntake(
      patientId,
      normalizedCode,
      patient.clinicId,
      'manual-admin'
    );

    if (result) {
      logger.info('[ManualAttribution] Successfully attributed patient', {
        patientId,
        refCode: normalizedCode,
        affiliateId: result.affiliateId,
      });

      return NextResponse.json({
        success: true,
        attribution: {
          patientId,
          refCode: result.refCode,
          affiliateId: result.affiliateId,
          model: result.model,
          confidence: result.confidence,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: `No active AffiliateRefCode found for "${normalizedCode}". Check that the code exists and is active.`,
      },
      { status: 404 }
    );
  } catch (error) {
    logger.error('[ManualAttribution] Failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return serverError('Manual attribution failed');
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove affiliate attribution from patient
// ---------------------------------------------------------------------------
async function handleDelete(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId } = body as { patientId?: number };

    if (!patientId) {
      return badRequest('patientId is required');
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        attributionAffiliateId: true,
        attributionRefCode: true,
        tags: true,
      },
    });

    if (!patient) {
      return notFound('Patient not found');
    }

    if (!patient.attributionAffiliateId && !patient.attributionRefCode) {
      return NextResponse.json({ success: true, message: 'No attribution to remove' });
    }

    // Remove affiliate tags
    const existingTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];
    const filteredTags = existingTags.filter((t) => !t.startsWith('affiliate:'));

    await prisma.patient.update({
      where: { id: patientId },
      data: {
        attributionAffiliateId: null,
        attributionRefCode: null,
        attributionFirstTouchAt: null,
        tags: filteredTags,
      },
    });

    logger.info('[ManualAttribution] Removed attribution from patient', {
      patientId,
      previousAffiliateId: patient.attributionAffiliateId,
      previousRefCode: patient.attributionRefCode,
    });

    return NextResponse.json({
      success: true,
      message: `Attribution removed (was: affiliate ${patient.attributionAffiliateId}, code ${patient.attributionRefCode})`,
    });
  } catch (error) {
    logger.error('[ManualAttribution] Remove failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return serverError('Failed to remove attribution');
  }
}

export const POST = withAdminAuth(handlePost);
export const DELETE = withAdminAuth(handleDelete);
