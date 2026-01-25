/**
 * Affiliate Ref Codes API
 * 
 * GET - List affiliate's referral codes with stats
 * POST - Create a new referral code
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const MAX_REF_CODES = 10;

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get affiliate with clinic info
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        clinicId: true,
        clinic: {
          select: {
            subdomain: true,
            customDomain: true,
            name: true,
          },
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Get all ref codes for this affiliate
    const refCodes = await prisma.affiliateRefCode.findMany({
      where: {
        affiliateId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get stats for each ref code
    const refCodeStats = await Promise.all(
      refCodes.map(async (code: typeof refCodes[number]) => {
        // Get click count and last click from touches
        const [clickCount, lastClick] = await Promise.all([
          prisma.affiliateTouch.count({
            where: { 
              affiliateId,
              refCode: code.refCode,
            },
          }),
          prisma.affiliateTouch.findFirst({
            where: { 
              affiliateId,
              refCode: code.refCode,
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ]);

        // Get conversion count by finding touches with this refCode that have commission events
        // Note: This is an approximation since touchId links are optional
        const touchesWithRefCode = await prisma.affiliateTouch.findMany({
          where: { 
            affiliateId,
            refCode: code.refCode,
          },
          select: { id: true },
        });
        
        const conversions = touchesWithRefCode.length > 0 
          ? await prisma.affiliateCommissionEvent.count({
              where: {
                affiliateId,
                touchId: { in: touchesWithRefCode.map((t: { id: number }) => t.id) },
              },
            })
          : 0;

        return {
          id: code.id.toString(),
          code: code.refCode,
          name: code.description || code.refCode,
          isDefault: refCodes.indexOf(code) === 0, // First code is default
          clickCount,
          conversionCount: conversions,
          lastClickAt: lastClick?.createdAt.toISOString(),
          createdAt: code.createdAt.toISOString(),
        };
      })
    );

    // Determine base URL - prefer custom domain, then subdomain
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
    if (affiliate.clinic.customDomain) {
      baseUrl = `https://${affiliate.clinic.customDomain}`;
    } else if (affiliate.clinic.subdomain) {
      baseUrl = `https://${affiliate.clinic.subdomain}.eonpro.io`;
    }

    return NextResponse.json({
      baseUrl,
      refCodes: refCodeStats,
      canCreateMore: refCodes.length < MAX_REF_CODES,
      maxCodes: MAX_REF_CODES,
    });
  } catch (error) {
    logger.error('[Affiliate RefCodes] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to fetch ref codes' },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Get affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { id: true, clinicId: true },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check current count
    const currentCount = await prisma.affiliateRefCode.count({
      where: { affiliateId, isActive: true },
    });

    if (currentCount >= MAX_REF_CODES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_REF_CODES} referral codes allowed` },
        { status: 400 }
      );
    }

    // Generate unique ref code
    let refCode: string;
    let attempts = 0;
    
    do {
      // Generate a short, readable code
      const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
      refCode = `${name.trim().replace(/\s+/g, '').slice(0, 4).toUpperCase()}${randomPart}`;
      attempts++;
    } while (
      attempts < 10 &&
      await prisma.affiliateRefCode.findFirst({
        where: { clinicId: affiliate.clinicId, refCode },
      })
    );

    // Create ref code
    const newRefCode = await prisma.affiliateRefCode.create({
      data: {
        clinicId: affiliate.clinicId,
        affiliateId,
        refCode,
        description: name.trim(),
        isActive: true,
      },
    });

    logger.info('[Affiliate RefCodes] Created new ref code', {
      affiliateId,
      refCode,
    });

    return NextResponse.json({
      id: newRefCode.id.toString(),
      code: newRefCode.refCode,
      name: newRefCode.description,
      isDefault: false,
      clickCount: 0,
      conversionCount: 0,
      createdAt: newRefCode.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error('[Affiliate RefCodes] POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to create ref code' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handleGet);
export const POST = withAffiliateAuth(handlePost);
