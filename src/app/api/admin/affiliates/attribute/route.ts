/**
 * POST /api/admin/affiliates/attribute
 *
 * Manually attribute a patient to an affiliate ref code.
 * Used for data reconciliation when automatic attribution was missed.
 *
 * Body: { patientId: number, refCode: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { attributeFromIntake } from '@/services/affiliate/attributionService';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { badRequest, notFound, serverError } from '@/lib/api/error-response';

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId, refCode, force } = body as {
      patientId?: number;
      refCode?: string;
      force?: boolean; // If true, overwrite existing attribution
    };

    if (!patientId || !refCode) {
      return badRequest('patientId and refCode are required');
    }

    const normalizedCode = refCode.trim().toUpperCase();

    // Look up the patient
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

    // If attributeFromIntake returned null, the ref code likely doesn't exist
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

export const POST = withAdminAuth(handler);
