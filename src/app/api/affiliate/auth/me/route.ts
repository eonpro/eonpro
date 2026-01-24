/**
 * Get Current Affiliate User
 * 
 * Returns the authenticated affiliate's information.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'affiliate-portal-secret-key-change-in-production'
);

const COOKIE_NAME = 'affiliate_session';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify JWT
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    const affiliateId = payload.affiliateId as number;

    // Get affiliate data
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
      return NextResponse.json(
        { error: 'Account not found or suspended' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      id: affiliate.id,
      displayName: affiliate.displayName,
      email: affiliate.user.email,
      phone: affiliate.user.phone,
      tier: affiliate.currentTier?.name || 'Standard',
      tierLevel: affiliate.currentTier?.level || 1,
      lifetimeEarnings: affiliate.lifetimeRevenueCents,
      lifetimeConversions: affiliate.lifetimeConversions,
      joinedAt: affiliate.createdAt,
    });
  } catch (error) {
    console.error('[Affiliate Auth] Me error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
