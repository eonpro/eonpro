/**
 * Affiliate Profile Update API
 *
 * PATCH - Update affiliate display name and contact info
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { standardRateLimiter } from '@/lib/security/rate-limiter-redis';

const profilePatchSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().regex(/^\+?\d{10,15}$/, 'Invalid phone number').optional(),
});

async function handlePatch(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;

    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const rawBody = await request.json();
    const parsed = profilePatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid profile data' },
        { status: 400 }
      );
    }

    const { displayName, email, phone } = parsed.data;

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
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export const PATCH = standardRateLimiter(withAffiliateAuth(handlePatch));
