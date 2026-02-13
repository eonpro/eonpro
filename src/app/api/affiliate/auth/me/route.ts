/**
 * Get Current Affiliate User
 *
 * Returns the authenticated affiliate's information.
 * Supports both new Affiliate model and legacy Influencer model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { JWT_SECRET } from '@/lib/auth/config';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Try both cookie names for compatibility
    let token = cookieStore.get('affiliate_session')?.value;
    if (!token) {
      token = cookieStore.get('influencer-token')?.value;
    }

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify JWT
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch (err) {
      logger.error('[Affiliate Auth] JWT verification failed', { error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Check if this is an Affiliate or Influencer login
    const affiliateId = payload.affiliateId as number | undefined;
    const influencerId = payload.influencerId as number | undefined;

    // Handle new Affiliate model
    if (affiliateId) {
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
        select: {
          id: true,
          displayName: true,
          status: true,
          clinicId: true,
          currentTierId: true,
          lifetimeRevenueCents: true,
          lifetimeConversions: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              phone: true,
            },
          },
          currentTier: {
            select: {
              name: true,
              level: true,
            },
          },
        },
      });

      if (!affiliate || affiliate.status === 'SUSPENDED') {
        return NextResponse.json({ error: 'Account not found or suspended' }, { status: 401 });
      }

      return NextResponse.json({
        id: affiliate.id,
        type: 'affiliate',
        displayName: affiliate.displayName,
        email: affiliate.user?.email,
        phone: affiliate.user?.phone,
        tier: affiliate.currentTier?.name || 'Standard',
        tierLevel: affiliate.currentTier?.level || 1,
        lifetimeEarnings: affiliate.lifetimeRevenueCents,
        lifetimeConversions: affiliate.lifetimeConversions,
        joinedAt: affiliate.createdAt,
      });
    }

    // Handle legacy Influencer model
    if (influencerId) {
      const influencer = await prisma.influencer.findUnique({
        where: { id: influencerId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          promoCode: true,
          commissionRate: true,
          createdAt: true,
        },
      });

      if (!influencer || influencer.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'Account not found or inactive' }, { status: 401 });
      }

      return NextResponse.json({
        id: influencer.id,
        type: 'influencer',
        displayName: influencer.name,
        email: influencer.email,
        phone: influencer.phone,
        promoCode: influencer.promoCode,
        commissionRate: influencer.commissionRate,
        tier: 'Standard',
        tierLevel: 1,
        lifetimeEarnings: 0,
        lifetimeConversions: 0,
        joinedAt: influencer.createdAt,
      });
    }

    // No valid ID in token
    return NextResponse.json({ error: 'Invalid session data' }, { status: 401 });
  } catch (error) {
    logger.error('[Affiliate Auth] Me error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
