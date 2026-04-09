/**
 * Zoom Meeting SDK Signature Generation
 *
 * Generates JWT signatures for the Zoom Meeting SDK Component View.
 * Required for providers to join embedded Zoom meetings in-browser.
 *
 * Security: Requires provider auth, validates meeting ownership,
 * generates short-lived signatures, and logs HIPAA audit trail.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { SignJWT } from 'jose';
import { z } from 'zod';

import { withProviderAuth, type AuthUser } from '@/lib/auth/middleware';
import { zoomConfig, isZoomConfigured } from '@/lib/integrations/zoom/config';
import { getZoomAccessToken } from '@/lib/integrations/zoom/meetingService';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { prisma } from '@/lib/db';

const signatureSchema = z.object({
  meetingNumber: z.union([z.string(), z.number()]).transform(String),
  role: z.union([z.literal(0), z.literal(1)]).default(1),
});

async function fetchZakToken(): Promise<string | null> {
  try {
    const accessToken = await getZoomAccessToken();
    const res = await fetch('https://api.zoom.us/v2/users/me/zak', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!isZoomConfigured()) {
      return NextResponse.json(
        { error: 'Zoom Telehealth is not enabled' },
        { status: 403 }
      );
    }

    const sdkKey = zoomConfig.sdkKey || zoomConfig.clientId;
    const sdkSecret = zoomConfig.sdkSecret || zoomConfig.clientSecret;
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

    const session = await prisma.telehealthSession.findFirst({
      where: {
        meetingId: meetingNumber,
        providerId: user.providerId ?? user.id,
      },
      select: { id: true, patientId: true, appointmentId: true },
    });

    if (!session && role === 1) {
      logger.warn('[ZOOM_SDK] Provider not associated with meeting', {
        userId: user.id,
        meetingNumber,
      });
      return NextResponse.json(
        { error: 'You are not the host of this meeting' },
        { status: 403 }
      );
    }

    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 60 * 30;

    const secret = new TextEncoder().encode(sdkSecret);
    const signature = await new SignJWT({
      appKey: sdkKey,
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

    let zak: string | null = null;
    if (role === 1) {
      zak = await fetchZakToken();
    }

    logger.info('[ZOOM_SDK] Signature generated', {
      userId: user.id,
      clinicId: user.clinicId,
      meetingNumber,
      role,
      hasZak: !!zak,
    });

    auditLog(req, {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      eventType: AuditEventType.SYSTEM_ACCESS,
      resourceType: 'TelehealthSession',
      resourceId: session?.id ?? meetingNumber,
      patientId: session?.patientId,
      action: 'TELEHEALTH_JOIN',
      outcome: 'SUCCESS',
      metadata: { meetingNumber, role },
    }).catch((err: unknown) => {
      logger.debug('Audit log failed (non-blocking)', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });

    return NextResponse.json({ signature, sdkKey, ...(zak ? { zak } : {}) });
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
