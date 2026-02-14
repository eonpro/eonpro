/**
 * Get Current Affiliate User
 *
 * Returns the authenticated affiliate's information.
 * Uses the standard withAffiliateAuth wrapper for consistent auth handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handler(request: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const affiliateId = user.affiliateId;

    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

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
  } catch (error) {
    logger.error('[Affiliate Auth] Me error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handler);
