/**
 * Affiliate Tracking API
 *
 * Records affiliate touches for attribution tracking.
 * Public endpoint (no auth required) - used by tracking script.
 *
 * POST /api/affiliate/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';
import { badRequest, serverError } from '@/lib/api/error-response';
import crypto from 'crypto';

// Redis-backed rate limiters (works in serverless, unlike the old in-memory Map)
const trackingRateLimiter = createRateLimiter({
  identifier: 'affiliate-track',
  windowSeconds: 60,
  maxRequests: 100,
  message: 'Too many tracking requests. Please try again later.',
});

const postbackRateLimiter = createRateLimiter({
  identifier: 'affiliate-postback',
  windowSeconds: 60,
  maxRequests: 100,
  message: 'Too many postback requests.',
});

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
  subId1: z.string().max(256).optional(),
  subId2: z.string().max(256).optional(),
  subId3: z.string().max(256).optional(),
  subId4: z.string().max(256).optional(),
  subId5: z.string().max(256).optional(),
  landingPage: z.string().max(2000).optional(),
  referrerUrl: z.string().max(2000).optional(),
  userAgent: z.string().max(512).optional(),
  clinicId: z.number().int().positive().optional(),
  affiliateId: z.number().int().positive().optional(),
});

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

async function handlePost(request: NextRequest) {
  try {
    // Get client IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';

    // Parse and validate body
    const rawBody = await request.json();
    const parsed = trackSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid tracking data' },
        { status: 400 }
      );
    }

    const body: TrackRequest = parsed.data;

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

    // Deduplication: Check if a touch with the same visitor+code exists within a 30-minute window
    // This prevents inflated click counts from page refreshes or accidental double-clicks
    const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS);

    const visitorId = body.visitorFingerprint || body.cookieId;

    // Use a PostgreSQL advisory lock to serialize dedup check-then-create for the same
    // visitor+code combination. This prevents two concurrent clicks from the same visitor
    // from both seeing "no existing touch" and both creating one.
    // The lock key is a hash of (clinicId, refCode, visitorId) reduced to a 32-bit int.
    if (visitorId) {
      const lockKeyStr = `${clinicId}:${body.refCode}:${visitorId}`;
      // Convert string to a stable 32-bit integer hash for pg_advisory_xact_lock
      let lockKey = 0;
      for (let i = 0; i < lockKeyStr.length; i++) {
        lockKey = ((lockKey << 5) - lockKey + lockKeyStr.charCodeAt(i)) | 0;
      }

      const dedupResult = await prisma.$transaction(async (tx) => {
        // Acquire advisory lock scoped to this transaction (auto-released on commit/rollback)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

        const existingTouch = await tx.affiliateTouch.findFirst({
          where: {
            clinicId,
            refCode: body.refCode,
            affiliateId,
            createdAt: { gte: dedupCutoff },
            OR: [
              ...(body.visitorFingerprint ? [{ visitorFingerprint: body.visitorFingerprint }] : []),
              ...(body.cookieId ? [{ cookieId: body.cookieId }] : []),
            ],
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });

        if (existingTouch) {
          // Duplicate within window - update the existing touch instead of creating a new one
          await tx.affiliateTouch.update({
            where: { id: existingTouch.id },
            data: {
              // Update with latest UTM/landing page data
              ...(body.utmSource && { utmSource: body.utmSource }),
              ...(body.utmMedium && { utmMedium: body.utmMedium }),
              ...(body.utmCampaign && { utmCampaign: body.utmCampaign }),
              ...(body.landingPage && { landingPage: body.landingPage.substring(0, 2000) }),
            },
          });
          return { deduplicated: true, touchId: existingTouch.id };
        }

        // No duplicate found — create INSIDE the transaction while holding the advisory lock.
        // This prevents the race condition where two concurrent requests both pass the dedup
        // check and both create a touch.
        const newTouch = await tx.affiliateTouch.create({
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
            landingPage: body.landingPage?.substring(0, 2000),
            referrerUrl: body.referrerUrl?.substring(0, 2000),
          },
        });
        return { deduplicated: false, touchId: newTouch.id };
      }, { timeout: 15000 });

      if (dedupResult.deduplicated) {
        logger.debug('[Tracking] Deduplicated touch (within 30min window)', {
          touchId: dedupResult.touchId,
          refCode: body.refCode,
          affiliateId,
        });
      } else {
        logger.info('[Tracking] Touch recorded', {
          touchId: dedupResult.touchId,
          clinicId,
          affiliateId,
          refCode: body.refCode,
          touchType: body.touchType || 'CLICK',
        });
      }

      return NextResponse.json({
        success: true,
        touchId: dedupResult.touchId,
        deduplicated: dedupResult.deduplicated,
      });
    }

    // No visitor identifier — no dedup possible, create touch directly
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
        landingPage: body.landingPage?.substring(0, 2000),
        referrerUrl: body.referrerUrl?.substring(0, 2000),
      },
    });

    logger.info('[Tracking] Touch recorded (no visitor ID for dedup)', {
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

    return serverError('Failed to record touch');
  }
}

/**
 * Server-to-server postback tracking
 * Used for tracking conversions from external systems
 */
async function handleGet(request: NextRequest) {
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

// Apply Redis-backed rate limiting to both endpoints
export const POST = trackingRateLimiter(handlePost);
export const GET = postbackRateLimiter(handleGet);
