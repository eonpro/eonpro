/**
 * Zoom Meeting Provision API
 *
 * Retries Zoom meeting creation for VIDEO appointments that are
 * missing video links (e.g. due to a previous provisioning failure).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { isZoomConfigured } from '@/lib/integrations/zoom/config';
import { ensureZoomMeetingForAppointment } from '@/lib/integrations/zoom/telehealthService';
import { prisma } from '@/lib/db';

const provisionSchema = z.object({
  appointmentId: z.number().positive('Appointment ID is required'),
});

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!isZoomConfigured()) {
      return NextResponse.json(
        { error: 'Zoom is not configured. Please add API credentials.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const parsed = provisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { appointmentId } = parsed.data;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, type: true, providerId: true, clinicId: true, zoomMeetingId: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (appointment.type !== 'VIDEO') {
      return NextResponse.json(
        { error: 'Only video appointments can be provisioned' },
        { status: 400 }
      );
    }

    if (appointment.zoomMeetingId) {
      return NextResponse.json({
        success: true,
        message: 'Meeting already exists',
        alreadyProvisioned: true,
      });
    }

    const result = await ensureZoomMeetingForAppointment(appointmentId);

    if (!result.success) {
      logger.error('Zoom provision retry failed', {
        appointmentId,
        error: result.error,
      });
      return NextResponse.json(
        { error: result.error || 'Failed to create Zoom meeting' },
        { status: 502 }
      );
    }

    const updatedAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        zoomMeetingId: true,
        zoomJoinUrl: true,
        videoLink: true,
      },
    });

    logger.info('Zoom meeting provisioned on retry', {
      appointmentId,
      meetingId: updatedAppointment?.zoomMeetingId,
    });

    return NextResponse.json({
      success: true,
      appointment: updatedAppointment,
      session: result.session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Zoom provision endpoint error', { error: message });
    return NextResponse.json(
      { error: 'Failed to provision Zoom meeting' },
      { status: 500 }
    );
  }
});
