/**
 * Sales Rep Tracking API
 *
 * Records sales rep link clicks for attribution (like affiliate track).
 * Public endpoint - no auth. Used by tracking script or redirect from rep link.
 *
 * POST /api/sales-rep/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma, prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const trackSchema = z.object({
  visitorFingerprint: z.string().min(1).max(512),
  cookieId: z.string().max(512).optional(),
  refCode: z.string().min(1).max(50),
  touchType: z.enum(['CLICK', 'IMPRESSION', 'POSTBACK']).optional(),
  utmSource: z.string().max(256).optional(),
  utmMedium: z.string().max(256).optional(),
  utmCampaign: z.string().max(256).optional(),
  utmContent: z.string().max(256).optional(),
  utmTerm: z.string().max(256).optional(),
  landingPage: z.string().max(2000).optional(),
  referrerUrl: z.string().max(2000).optional(),
  userAgent: z.string().max(512).optional(),
});

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`salesrep_ip_salt:${ip}`).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const ipAddressHash = hashIp(clientIp);

    const rawBody = await request.json();
    const parsed = trackSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid tracking data' },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const refCodeNorm = body.refCode.trim().toUpperCase();

    const refCodeRecord = await basePrisma.salesRepRefCode.findFirst({
      where: { refCode: refCodeNorm, isActive: true },
      select: { id: true, clinicId: true, salesRepId: true },
    });

    if (!refCodeRecord) {
      logger.warn('[SalesRep Track] Invalid ref code', { refCode: refCodeNorm });
      return NextResponse.json({ success: false, reason: 'invalid_ref_code' });
    }

    const { clinicId, salesRepId } = refCodeRecord;

    const touch = await runWithClinicContext(clinicId, async () => {
      return prisma.salesRepTouch.create({
        data: {
          clinicId,
          salesRepId,
          visitorFingerprint: body.visitorFingerprint,
          cookieId: body.cookieId,
          ipAddressHash,
          userAgent: body.userAgent ?? request.headers.get('user-agent') ?? undefined,
          refCode: refCodeNorm,
          touchType: body.touchType ?? 'CLICK',
          utmSource: body.utmSource,
          utmMedium: body.utmMedium,
          utmCampaign: body.utmCampaign,
          utmContent: body.utmContent,
          utmTerm: body.utmTerm,
          landingPage: body.landingPage?.substring(0, 2000),
          referrerUrl: body.referrerUrl?.substring(0, 2000),
        },
      });
    });

    logger.info('[SalesRep Track] Touch recorded', {
      touchId: touch.id,
      clinicId,
      salesRepId,
      refCode: refCodeNorm,
    });

    return NextResponse.json({
      success: true,
      touchId: touch.id,
    });
  } catch (error) {
    logger.error('[SalesRep Track] Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
