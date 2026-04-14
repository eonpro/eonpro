/**
 * Zoom Host URL API
 *
 * Returns a fresh start_url (host link) for a provider's telehealth session.
 * Zoom start_urls expire ~2 hours after creation, so this endpoint fetches
 * a new one from the Zoom API each time the provider is about to join.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getZoomAccessToken } from '@/lib/integrations/zoom/meetingService';
import { isZoomConfigured } from '@/lib/integrations/zoom/config';
import { getClinicZoomAccessToken } from '@/lib/clinic-zoom';

const ZOOM_API_TIMEOUT_MS = 15_000;

async function fetchFreshMeeting(
  meetingId: string,
  accessToken: string
): Promise<{ start_url: string; join_url: string } | null> {
  const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    logger.error('[ZOOM_HOST_URL] Failed to fetch meeting from Zoom API', {
      meetingId,
      status: response.status,
    });
    return null;
  }

  const data = await response.json();
  return { start_url: data.start_url, join_url: data.join_url };
}

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const sessionId = body.sessionId ? Number(body.sessionId) : undefined;
    const meetingId = body.meetingId ? String(body.meetingId) : undefined;

    if (!sessionId && !meetingId) {
      return NextResponse.json({ error: 'sessionId or meetingId required' }, { status: 400 });
    }

    const session = await prisma.telehealthSession.findFirst({
      where: {
        ...(sessionId ? { id: sessionId } : {}),
        ...(meetingId && !sessionId ? { meetingId } : {}),
        providerId: user.providerId ?? user.id,
      },
      select: {
        id: true,
        meetingId: true,
        clinicId: true,
        hostUrl: true,
        joinUrl: true,
      },
    });

    if (!session || !session.meetingId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let accessToken: string | null = null;

    if (session.clinicId) {
      accessToken = await getClinicZoomAccessToken(session.clinicId);
    }
    if (!accessToken && isZoomConfigured()) {
      accessToken = await getZoomAccessToken();
    }

    if (!accessToken) {
      logger.warn('[ZOOM_HOST_URL] No Zoom credentials available, returning stored URL', {
        sessionId: session.id,
      });
      return NextResponse.json({
        hostUrl: session.hostUrl ?? session.joinUrl,
        fresh: false,
      });
    }

    const freshMeeting = await fetchFreshMeeting(session.meetingId, accessToken);
    if (!freshMeeting) {
      return NextResponse.json({
        hostUrl: session.hostUrl ?? session.joinUrl,
        fresh: false,
      });
    }

    await prisma.telehealthSession.update({
      where: { id: session.id },
      data: { hostUrl: freshMeeting.start_url },
    });

    logger.info('[ZOOM_HOST_URL] Fresh host URL issued', {
      sessionId: session.id,
      meetingId: session.meetingId,
      providerId: user.providerId ?? user.id,
    });

    return NextResponse.json({
      hostUrl: freshMeeting.start_url,
      fresh: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_HOST_URL] Failed', { error: message, userId: user.id });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
