/**
 * Zoom Meeting Provision API
 *
 * Lightweight endpoint that creates a Zoom meeting for a VIDEO appointment.
 * Uses direct Zoom API calls instead of the heavy telehealthService import chain.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';

async function getZoomToken(): Promise<string | null> {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=account_credentials&account_id=${accountId}`,
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

async function createMeeting(token: string, topic: string, duration: number, startTime?: string) {
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: startTime ? 2 : 1,
      duration,
      start_time: startTime,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        mute_upon_entry: true,
        waiting_room: false,
        auto_recording: 'none',
        meeting_authentication: false,
        enforce_login: false,
        approval_type: 2,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zoom API ${res.status}: ${errText}`);
  }

  return res.json();
}

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const appointmentId = Number(body.appointmentId);
    if (!appointmentId || isNaN(appointmentId)) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (appointment.type !== 'VIDEO') {
      return NextResponse.json({ error: 'Not a video appointment' }, { status: 400 });
    }

    if (appointment.zoomMeetingId) {
      return NextResponse.json({ success: true, alreadyProvisioned: true });
    }

    const token = await getZoomToken();
    if (!token) {
      return NextResponse.json({ error: 'Zoom credentials not configured' }, { status: 503 });
    }

    const topic = appointment.title || 'Telehealth Consultation';
    const meeting = await createMeeting(token, topic, appointment.duration || 30, appointment.startTime?.toISOString());

    // Update appointment with Zoom data
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        zoomMeetingId: String(meeting.id),
        zoomJoinUrl: meeting.join_url,
        videoLink: meeting.join_url,
      },
    });

    // Try to create TelehealthSession (non-blocking)
    try {
      await prisma.telehealthSession.create({
        data: {
          clinicId: appointment.clinicId,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          meetingId: String(meeting.id),
          meetingUuid: meeting.uuid,
          joinUrl: meeting.join_url,
          hostUrl: meeting.start_url,
          password: meeting.password,
          topic,
          scheduledAt: appointment.startTime,
          duration: appointment.duration || 30,
          status: 'SCHEDULED',
          platform: 'zoom',
        },
      });
    } catch {
      // TelehealthSession table might not exist yet -- appointment is still updated
    }

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointmentId,
        zoomMeetingId: String(meeting.id),
        zoomJoinUrl: meeting.join_url,
        videoLink: meeting.join_url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
