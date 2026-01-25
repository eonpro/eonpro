/**
 * Affiliate Profile Update API
 * 
 * PATCH - Update affiliate display name and contact info
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handlePatch(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    const influencerId = user.influencerId;
    
    const body = await request.json();
    const { displayName, email, phone } = body;

    // Handle legacy Influencer users
    if (!affiliateId && influencerId) {
      await prisma.influencer.update({
        where: { id: influencerId },
        data: {
          ...(displayName && { name: displayName }),
          ...(email && { email }),
          ...(phone && { phone }),
        },
      });

      // Also update User if email/phone provided
      if (email || phone) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(email && { email }),
            ...(phone && { phone }),
          },
        });
      }

      return NextResponse.json({ success: true });
    }
    
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Update affiliate displayName
    if (displayName) {
      await prisma.affiliate.update({
        where: { id: affiliateId },
        data: { displayName },
      });
    }

    // Update User email/phone
    if (email || phone) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(email && { email }),
          ...(phone && { phone }),
        },
      });
    }

    logger.info('[Affiliate Profile] Updated', { affiliateId, userId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Affiliate Profile] PATCH error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

export const PATCH = withAffiliateAuth(handlePatch);
