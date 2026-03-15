/**
 * API endpoint for managing Zoom meetings
 *
 * All handlers require provider-level authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  createZoomMeeting,
  getZoomMeeting,
  cancelZoomMeeting,
  getMeetingParticipants,
  ZoomParticipant,
} from '@/lib/integrations/zoom/meetingService';
import { isZoomConfigured } from '@/lib/integrations/zoom/config';

const createMeetingSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  patientId: z.number().positive().optional(),
  duration: z.number().min(5).max(480),
  scheduledAt: z.string().datetime().optional(),
  agenda: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!isFeatureEnabled('ZOOM_TELEHEALTH')) {
      return NextResponse.json(
        { error: 'Zoom Telehealth feature is not enabled' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { topic, patientId, duration, scheduledAt, agenda, settings } = parsed.data;
    const isMockMode = !isZoomConfigured() || process.env.ZOOM_USE_MOCK === 'true';

    const meeting = await createZoomMeeting({
      topic,
      duration,
      patientId: patientId || 0,
      providerId: user.id,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      agenda,
      settings,
    });

    logger.info('[ZOOM_API] Meeting created', {
      meetingId: meeting.id,
      userId: user.id,
      clinicId: user.clinicId,
    });

    return NextResponse.json({
      success: true,
      meetingId: meeting.id?.toString(),
      joinUrl: meeting.joinUrl,
      startUrl: meeting.startUrl,
      password: meeting.password,
      topic: meeting.topic,
      duration: meeting.duration,
      scheduledAt: meeting.startTime,
      mock: isMockMode,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Meeting creation failed', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }
});

export const GET = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'status') {
      const enabled = isFeatureEnabled('ZOOM_TELEHEALTH');
      const configured = isZoomConfigured();
      let waitingRoomEnabled = false;
      let accountEmail: string | undefined;

      if (configured && user.clinicId) {
        try {
          const { getClinicZoomStatus } = await import('@/lib/clinic-zoom');
          const clinicStatus = await getClinicZoomStatus(user.clinicId);
          waitingRoomEnabled = clinicStatus.settings.waitingRoomEnabled;
          accountEmail = clinicStatus.accountEmail;
        } catch {
          // Fall back to defaults
        }
      }

      return NextResponse.json({
        configured,
        enabled,
        waitingRoomEnabled,
        accountEmail,
      });
    }

    if (!isFeatureEnabled('ZOOM_TELEHEALTH')) {
      return NextResponse.json(
        { error: 'Zoom Telehealth feature is not enabled' },
        { status: 403 }
      );
    }

    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
    }

    const meeting = await getZoomMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    let participants: ZoomParticipant[] = [];
    try {
      participants = await getMeetingParticipants(meetingId);
    } catch (err) {
      logger.debug('[ZOOM_API] Could not get participants', {
        meetingId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return NextResponse.json({ success: true, meeting, participants });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Failed to get meeting', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to get meeting' }, { status: 500 });
  }
});

export const DELETE = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!isFeatureEnabled('ZOOM_TELEHEALTH')) {
      return NextResponse.json(
        { error: 'Zoom Telehealth feature is not enabled' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
    }

    const success = await cancelZoomMeeting(meetingId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to cancel meeting' }, { status: 500 });
    }

    logger.info('[ZOOM_API] Meeting cancelled', {
      meetingId,
      userId: user.id,
      clinicId: user.clinicId,
    });

    return NextResponse.json({ success: true, message: 'Meeting cancelled successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_API] Failed to cancel meeting', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to cancel meeting' }, { status: 500 });
  }
});
