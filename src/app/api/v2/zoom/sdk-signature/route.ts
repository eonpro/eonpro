/**
 * Zoom Meeting SDK Signature Generation
 *
 * Generates JWT signatures for the Zoom Meeting SDK Component View.
 * Providers always join as host (role=1) with a ZAK token so they
 * are auto-authenticated — no separate Zoom login required.
 *
 * Supports both platform-level and per-clinic Zoom credentials.
 */

import { type NextRequest, NextResponse } from 'next/server';

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { withProviderAuth, type AuthUser } from '@/lib/auth/middleware';
import { zoomConfig, isZoomConfigured } from '@/lib/integrations/zoom/config';
import { getZoomAccessToken } from '@/lib/integrations/zoom/meetingService';
import { getClinicZoomCredentials, getClinicZoomAccessToken } from '@/lib/clinic-zoom';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { prisma } from '@/lib/db';

const signatureSchema = z.object({
  meetingNumber: z.union([z.string(), z.number()]).transform(String),
  role: z.union([z.literal(0), z.literal(1)]).default(1),
  sessionId: z.number().optional(),
});

async function fetchZakToken(accessToken: string): Promise<string | null> {
  try {
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
    const body = await req.json();
    const parsed = signatureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { meetingNumber, sessionId } = parsed.data;
    let role = parsed.data.role;

    const session = await prisma.telehealthSession.findFirst({
      where: {
        ...(sessionId ? { id: sessionId } : { meetingId: meetingNumber }),
        providerId: user.providerId ?? user.id,
      },
      select: { id: true, patientId: true, appointmentId: true, clinicId: true },
    });

    // Resolve SDK credentials: clinic-specific first, then platform
    let sdkKey: string | undefined;
    let sdkSecret: string | undefined;
    let accessToken: string | null = null;

    if (session?.clinicId) {
      const clinicCreds = await getClinicZoomCredentials(session.clinicId);
      if (clinicCreds) {
        sdkKey = clinicCreds.sdkKey || clinicCreds.clientId;
        sdkSecret = clinicCreds.sdkSecret || clinicCreds.clientSecret;
        accessToken = await getClinicZoomAccessToken(session.clinicId);
      }
    }

    if (!sdkKey || !sdkSecret) {
      if (!isZoomConfigured()) {
        return NextResponse.json(
          { error: 'Zoom Telehealth is not enabled' },
          { status: 403 },
        );
      }
      sdkKey = zoomConfig.sdkKey || zoomConfig.clientId;
      sdkSecret = zoomConfig.sdkSecret || zoomConfig.clientSecret;
    }

    if (!sdkKey || !sdkSecret) {
      return NextResponse.json(
        { error: 'Zoom SDK credentials not configured' },
        { status: 500 },
      );
    }

    if (!accessToken && isZoomConfigured()) {
      accessToken = await getZoomAccessToken();
    }

    // Provider is the assigned host — always get a ZAK so the SDK
    // authenticates them as host without any Zoom login prompt.
    let zak: string | null = null;
    if (role === 1 && session && accessToken) {
      zak = await fetchZakToken(accessToken);
      if (!zak) {
        logger.warn('[ZOOM_SDK] ZAK unavailable — provider will still join but may not have full host controls', {
          userId: user.id,
          meetingNumber,
        });
      }
    }

    if (role === 1 && !session) {
      role = 0;
    }

    const iat = Math.round(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2;

    const signature = jwt.sign(
      {
        sdkKey,
        appKey: sdkKey,
        mn: meetingNumber,
        role,
        iat,
        exp,
        tokenExp: exp,
      },
      sdkSecret,
      { header: { alg: 'HS256', typ: 'JWT' } },
    );

    logger.info('[ZOOM_SDK] Signature generated', {
      userId: user.id,
      clinicId: user.clinicId,
      meetingNumber,
      role,
      hasZak: !!zak,
      clinicSpecific: !!session?.clinicId,
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

    return NextResponse.json({
      signature,
      sdkKey,
      role,
      ...(zak ? { zak } : {}),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_SDK] Signature generation failed', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to generate SDK signature' },
      { status: 500 },
    );
  }
});
