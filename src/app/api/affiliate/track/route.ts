/**
 * Affiliate Tracking API
 *
 * Records affiliate touches for attribution tracking.
 * Public endpoint (no auth required) - used by tracking script.
 *
 * POST /api/affiliate/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Rate limiting (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`aff_ip_salt:${ip}`).digest('hex');
}

interface TrackRequest {
  visitorFingerprint: string;
  cookieId?: string;
  refCode: string;
  touchType?: 'CLICK' | 'IMPRESSION' | 'POSTBACK';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  subId4?: string;
  subId5?: string;
  landingPage?: string;
  referrerUrl?: string;
  userAgent?: string;
  // For postback tracking
  clinicId?: number;
  affiliateId?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';

    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Parse body
    const body: TrackRequest = await request.json();

    // Validate required fields
    if (!body.visitorFingerprint || !body.refCode) {
      return NextResponse.json(
        { error: 'Missing required fields: visitorFingerprint, refCode' },
        { status: 400 }
      );
    }

    // Look up the ref code to find the affiliate and clinic
    const refCodeRecord = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode: body.refCode,
        isActive: true,
      },
      include: {
        affiliate: {
          select: {
            id: true,
            status: true,
            clinicId: true,
          },
        },
      },
    });

    if (!refCodeRecord) {
      // Invalid ref code - log but don't error
      logger.warn('[Tracking] Invalid ref code', { refCode: body.refCode });
      return NextResponse.json({ success: false, reason: 'invalid_ref_code' });
    }

    if (refCodeRecord.affiliate.status !== 'ACTIVE') {
      logger.warn('[Tracking] Affiliate not active', {
        refCode: body.refCode,
        affiliateId: refCodeRecord.affiliateId,
        status: refCodeRecord.affiliate.status,
      });
      return NextResponse.json({ success: false, reason: 'affiliate_inactive' });
    }

    const clinicId = refCodeRecord.affiliate.clinicId;
    const affiliateId = refCodeRecord.affiliateId;

    // Hash the IP for privacy
    const ipAddressHash = hashIp(clientIp);

    // Create the touch record
    const touch = await prisma.affiliateTouch.create({
      data: {
        clinicId,
        affiliateId,
        visitorFingerprint: body.visitorFingerprint,
        cookieId: body.cookieId,
        ipAddressHash,
        userAgent: body.userAgent || request.headers.get('user-agent') || undefined,
        refCode: body.refCode,
        touchType: body.touchType || 'CLICK',
        utmSource: body.utmSource,
        utmMedium: body.utmMedium,
        utmCampaign: body.utmCampaign,
        utmContent: body.utmContent,
        utmTerm: body.utmTerm,
        subId1: body.subId1,
        subId2: body.subId2,
        subId3: body.subId3,
        subId4: body.subId4,
        subId5: body.subId5,
        landingPage: body.landingPage?.substring(0, 2000), // Limit URL length
        referrerUrl: body.referrerUrl?.substring(0, 2000),
      },
    });

    logger.info('[Tracking] Touch recorded', {
      touchId: touch.id,
      clinicId,
      affiliateId,
      refCode: body.refCode,
      touchType: body.touchType || 'CLICK',
    });

    return NextResponse.json({
      success: true,
      touchId: touch.id,
    });
  } catch (error) {
    logger.error('[Tracking] Failed to record touch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to record touch' }, { status: 500 });
  }
}

/**
 * Server-to-server postback tracking
 * Used for tracking conversions from external systems
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const refCode = searchParams.get('ref') || searchParams.get('refcode');
    const clickId = searchParams.get('clickid') || searchParams.get('click_id');
    const subId1 = searchParams.get('sub1') || searchParams.get('subid1');
    const subId2 = searchParams.get('sub2') || searchParams.get('subid2');

    if (!refCode) {
      return NextResponse.json({ error: 'Missing ref code' }, { status: 400 });
    }

    // Look up the ref code
    const refCodeRecord = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode,
        isActive: true,
      },
      include: {
        affiliate: {
          select: {
            id: true,
            status: true,
            clinicId: true,
          },
        },
      },
    });

    if (!refCodeRecord || refCodeRecord.affiliate.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, reason: 'invalid' });
    }

    // Get client IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || 'unknown';

    // Create postback touch
    const touch = await prisma.affiliateTouch.create({
      data: {
        clinicId: refCodeRecord.affiliate.clinicId,
        affiliateId: refCodeRecord.affiliateId,
        visitorFingerprint: clickId || `postback_${Date.now()}`,
        ipAddressHash: hashIp(clientIp),
        refCode,
        touchType: 'POSTBACK',
        subId1,
        subId2,
      },
    });

    logger.info('[Tracking] Postback recorded', {
      touchId: touch.id,
      refCode,
    });

    // Return 1x1 transparent GIF for pixel tracking
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

    return new NextResponse(gif, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('[Tracking] Postback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
