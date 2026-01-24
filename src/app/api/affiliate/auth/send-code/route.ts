/**
 * Send OTP Code for Affiliate Login
 * 
 * Sends a 6-digit code via SMS for phone-based authentication.
 * Rate limited to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Rate limit: 3 attempts per phone per 15 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Rate limiting
    const now = Date.now();
    const rateKey = normalizedPhone;
    const rateLimit = rateLimitMap.get(rateKey);
    
    if (rateLimit && rateLimit.resetAt > now && rateLimit.count >= 3) {
      const waitMinutes = Math.ceil((rateLimit.resetAt - now) / 60000);
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${waitMinutes} minutes.` },
        { status: 429 }
      );
    }

    // Update rate limit
    if (!rateLimit || rateLimit.resetAt <= now) {
      rateLimitMap.set(rateKey, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else {
      rateLimit.count++;
    }

    // Find affiliate by phone
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: {
          phone: {
            endsWith: normalizedPhone.slice(-10),
          },
        },
        status: { in: ['ACTIVE', 'PENDING'] },
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
    
    return NextResponse.json(
      { error: 'Failed to send code' },
      { status: 500 }
    );
  }
}
