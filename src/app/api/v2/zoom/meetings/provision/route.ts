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
      let existingPassword: string | null = null;
      let hostUrl: string | null = null;
      try {
        const existingSession = await prisma.telehealthSession.findFirst({
          where: { meetingId: appointment.zoomMeetingId },
          select: { password: true, hostUrl: true, clinicId: true },
        });
        existingPassword = existingSession?.password ?? null;
        hostUrl = existingSession?.hostUrl ?? null;

        // Fetch a fresh start_url so the provider joins as host
        let accessToken: string | null = null;
        if (existingSession?.clinicId) {
          const { getClinicZoomAccessToken: getToken } = await import('@/lib/clinic-zoom');
          accessToken = await getToken(existingSession.clinicId);
        }
        if (!accessToken && isZoomConfigured()) {
          const { getZoomAccessToken: getPlatformToken } = await import('@/lib/integrations/zoom/meetingService');
          accessToken = await getPlatformToken();
        }
        if (accessToken) {
          const meetingRes = await fetch(
            `https://api.zoom.us/v2/meetings/${appointment.zoomMeetingId}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(10_000),
            }
          );
          if (meetingRes.ok) {
            const meetingData = await meetingRes.json();
            hostUrl = meetingData.start_url ?? hostUrl;
            if (existingSession && meetingData.start_url) {
              await prisma.telehealthSession.updateMany({
                where: { meetingId: appointment.zoomMeetingId },
                data: { hostUrl: meetingData.start_url },
              });
            }
          }
        }
      } catch { /* non-blocking — fall back to stored URLs */ }

      return NextResponse.json({
        success: true,
        alreadyProvisioned: true,
        appointment: {
          id: appointmentId,
          zoomMeetingId: appointment.zoomMeetingId,
          zoomJoinUrl: appointment.zoomJoinUrl,
          hostUrl,
          videoLink: appointment.videoLink ?? appointment.zoomJoinUrl,
          password: existingPassword,
        },
      });
    }

    const clinicId = appointment.clinicId;
    const topic = appointment.title || 'Telehealth Consultation';
    const duration = appointment.duration || 15;
    let meetingId = '';
    let joinUrl = '';
    let startUrl = '';
    let password: string | undefined;
    let uuid: string | undefined;

    let meetingCreated = false;

    // Try clinic-specific Zoom first, then fall back to platform credentials
    if (clinicId) {
      try {
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
            meetingCreated = true;
          } else {
            logger.warn('[ZOOM_PROVISION] Clinic Zoom failed, trying platform fallback', {
              clinicId,
              appointmentId,
            });
          }
        }
      } catch (clinicErr) {
        logger.warn('[ZOOM_PROVISION] Clinic Zoom error, trying platform fallback', {
          clinicId,
          appointmentId,
          error: clinicErr instanceof Error ? clinicErr.message : 'Unknown',
        });
      }
    }

    // Platform fallback
    if (!meetingCreated && isZoomConfigured()) {
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
      meetingCreated = true;
    }

    if (!meetingCreated) {
      return NextResponse.json(
        { error: 'Zoom is not configured. Please set up Zoom credentials in Admin > Integrations.' },
        { status: 503 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          zoomMeetingId: meetingId,
          zoomJoinUrl: joinUrl,
          videoLink: joinUrl,
        },
      });

      try {
        await tx.telehealthSession.create({
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
    });

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointmentId,
        zoomMeetingId: meetingId,
        zoomJoinUrl: joinUrl,
        hostUrl: startUrl,
        videoLink: joinUrl,
        password: password ?? null,
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
