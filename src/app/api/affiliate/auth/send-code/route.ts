/**
 * Send OTP Code for Affiliate Login
 *
 * Sends a 6-digit code via SMS for phone-based authentication.
 * Rate limited to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';
import crypto from 'crypto';

const sendCodeSchema = z.object({
  phone: z.string().regex(/^\+?\d{10,15}$/, 'Invalid phone number format'),
});

// Redis-backed rate limiter: 3 attempts per 15 minutes per IP
const sendCodeRateLimiter = createRateLimiter({
  identifier: 'affiliate-send-code',
  windowSeconds: 15 * 60,
  maxRequests: 3,
  blockDurationSeconds: 15 * 60,
  message: 'Too many code requests. Please try again in 15 minutes.',
});

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid phone number' },
        { status: 400 }
      );
    }

    const { phone } = parsed.data;

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');

    // Find affiliate by phone
    // Only ACTIVE affiliates can log in (AffiliateStatus enum: ACTIVE, PAUSED, SUSPENDED, INACTIVE)
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: {
          phone: {
            endsWith: normalizedPhone.slice(-10),
          },
        },
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });

    if (!affiliate) {
      // Don't reveal if phone exists or not for security
      // Still return success to prevent phone enumeration
      logger.info('[Affiliate Auth] Phone not found (returning success anyway)', {
        phoneLastFour: normalizedPhone.slice(-4),
      });

      return NextResponse.json({ success: true });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store code in database
    await prisma.affiliateOtpCode.upsert({
      where: { affiliateId: affiliate.id },
      create: {
        affiliateId: affiliate.id,
        code,
        expiresAt,
        attempts: 0,
      },
      update: {
        code,
        expiresAt,
        attempts: 0,
      },
    });

    // Send SMS via Twilio
    try {
      const { sendSMS } = await import('@/lib/integrations/twilio/smsService');
      await sendSMS({
        to: phone,
        body: `Your verification code is: ${code}. It expires in 10 minutes.`,
      });
    } catch (smsError) {
      logger.error('[Affiliate Auth] Failed to send SMS', {
        error: smsError instanceof Error ? smsError.message : 'Unknown error',
        affiliateId: affiliate.id,
      });

      // In development, log the code
      if (process.env.NODE_ENV === 'development') {
        logger.info(`[DEV] OTP Code for ${phone}: ${code}`);
      }
    }

    logger.info('[Affiliate Auth] OTP sent', {
      affiliateId: affiliate.id,
      phoneLastFour: normalizedPhone.slice(-4),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Affiliate Auth] Send code error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
  }
}

// Apply Redis-backed rate limiting
export const POST = sendCodeRateLimiter(handlePost);
