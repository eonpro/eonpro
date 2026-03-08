/**
 * Zoom Meeting SDK Signature Generation
 *
 * Generates JWT signatures for the Zoom Meeting SDK Component View.
 * Required for providers to join embedded Zoom meetings in-browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { zoomConfig, isZoomEnabled } from '@/lib/integrations/zoom/config';
import { logger } from '@/lib/logger';

const signatureSchema = z.object({
  meetingNumber: z.union([z.string(), z.number()]).transform(String),
  role: z.union([z.literal(0), z.literal(1)]).default(1),
});

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!isZoomEnabled()) {
      return NextResponse.json(
        { error: 'Zoom Telehealth is not enabled' },
        { status: 403 }
      );
    }

    const { sdkKey, sdkSecret } = zoomConfig;
    if (!sdkKey || !sdkSecret) {
      return NextResponse.json(
        { error: 'Zoom SDK credentials not configured' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const parsed = signatureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { meetingNumber, role } = parsed.data;

    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours

    const secret = new TextEncoder().encode(sdkSecret);
    const signature = await new SignJWT({
      sdkKey,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp: exp,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(secret);

    logger.info('[ZOOM_SDK] Signature generated', {
      userId: user.id,
      clinicId: user.clinicId,
      meetingNumber,
      role,
    });

    return NextResponse.json({ signature, sdkKey });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_SDK] Signature generation failed', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to generate SDK signature' },
      { status: 500 }
    );
  }
});
