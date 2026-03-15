/**
 * Zoom Meeting Provision API
 *
 * Creates a Zoom meeting for a VIDEO appointment.
 * Uses per-clinic Zoom credentials with platform fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  createClinicZoomMeeting,
  isClinicZoomConfigured,
} from '@/lib/clinic-zoom';
import { createZoomMeeting } from '@/lib/integrations/zoom/meetingService';
import { isZoomConfigured } from '@/lib/integrations/zoom/config';

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

    if (appointment.providerId !== (user.providerId ?? user.id)) {
      return NextResponse.json({ error: 'Not authorized for this appointment' }, { status: 403 });
    }

    if (appointment.zoomMeetingId) {
      return NextResponse.json({
        success: true,
        alreadyProvisioned: true,
        appointment: {
          id: appointmentId,
          zoomMeetingId: appointment.zoomMeetingId,
          zoomJoinUrl: appointment.zoomJoinUrl,
          videoLink: appointment.videoLink ?? appointment.zoomJoinUrl,
        },
      });
    }

    const clinicId = appointment.clinicId;
    const topic = appointment.title || 'Telehealth Consultation';
    const duration = appointment.duration || 30;
    let meetingId: string;
    let joinUrl: string;
    let startUrl: string;
    let password: string | undefined;
    let uuid: string | undefined;

    if (clinicId) {
      const hasClinicZoom = await isClinicZoomConfigured(clinicId);
      if (hasClinicZoom) {
        const clinicMeeting = await createClinicZoomMeeting(clinicId, {
          topic,
          duration,
          startTime: appointment.startTime ?? undefined,
          agenda: `Virtual consultation — appointment #${appointmentId}`,
        });

        if (clinicMeeting) {
          meetingId = String(clinicMeeting.id);
          joinUrl = clinicMeeting.join_url;
          startUrl = clinicMeeting.start_url;
          password = clinicMeeting.password;
          uuid = clinicMeeting.uuid;
        } else {
          return NextResponse.json(
            { error: 'Failed to create meeting with clinic Zoom account' },
            { status: 502 }
          );
        }
      } else if (isZoomConfigured()) {
        const platformMeeting = await createZoomMeeting({
          topic,
          duration,
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          scheduledAt: appointment.startTime ?? undefined,
          agenda: `Virtual consultation — appointment #${appointmentId}`,
        });
        meetingId = String(platformMeeting.id);
        joinUrl = platformMeeting.joinUrl;
        startUrl = platformMeeting.startUrl;
        password = platformMeeting.password;
        uuid = platformMeeting.uuid;
      } else {
        return NextResponse.json({ error: 'Zoom credentials not configured' }, { status: 503 });
      }
    } else if (isZoomConfigured()) {
      const platformMeeting = await createZoomMeeting({
        topic,
        duration,
        patientId: appointment.patientId,
        providerId: appointment.providerId,
        scheduledAt: appointment.startTime ?? undefined,
        agenda: `Virtual consultation — appointment #${appointmentId}`,
      });
      meetingId = String(platformMeeting.id);
      joinUrl = platformMeeting.joinUrl;
      startUrl = platformMeeting.startUrl;
      password = platformMeeting.password;
      uuid = platformMeeting.uuid;
    } else {
      return NextResponse.json({ error: 'Zoom credentials not configured' }, { status: 503 });
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        zoomMeetingId: meetingId,
        zoomJoinUrl: joinUrl,
        videoLink: joinUrl,
      },
    });

    try {
      await prisma.telehealthSession.create({
        data: {
          clinicId: appointment.clinicId,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          meetingId,
          meetingUuid: uuid,
          joinUrl,
          hostUrl: startUrl,
          password,
          topic,
          scheduledAt: appointment.startTime,
          duration,
          status: 'SCHEDULED',
          platform: 'zoom',
        },
      });
    } catch (sessionErr) {
      logger.warn('[ZOOM_PROVISION] TelehealthSession creation failed (non-blocking)', {
        appointmentId,
        meetingId,
        error: sessionErr instanceof Error ? sessionErr.message : 'Unknown',
      });
    }

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointmentId,
        zoomMeetingId: meetingId,
        zoomJoinUrl: joinUrl,
        videoLink: joinUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ZOOM_PROVISION] Failed', {
      error: message,
      userId: user.id,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
