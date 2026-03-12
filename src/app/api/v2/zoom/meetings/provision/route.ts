import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';

export const POST = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  let step = 'start';
  try {
    step = 'parse_body';
    const body = await req.json();
    const appointmentId = Number(body.appointmentId);
    if (!appointmentId || isNaN(appointmentId)) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    step = 'find_appointment';
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, type: true, clinicId: true, zoomMeetingId: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (appointment.zoomMeetingId) {
      return NextResponse.json({ success: true, message: 'Already provisioned', alreadyProvisioned: true });
    }

    step = 'import_zoom';
    const { isZoomConfigured } = await import('@/lib/integrations/zoom/config');
    const configured = isZoomConfigured();

    if (!configured) {
      return NextResponse.json({ error: 'Zoom not configured', step }, { status: 503 });
    }

    step = 'import_telehealth';
    const { ensureZoomMeetingForAppointment } = await import('@/lib/integrations/zoom/telehealthService');

    step = 'provision_meeting';
    const result = await ensureZoomMeetingForAppointment(appointmentId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Zoom meeting creation failed', step },
        { status: 502 }
      );
    }

    step = 'fetch_updated';
    const updated = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, zoomMeetingId: true, zoomJoinUrl: true, videoLink: true },
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : '';
    return NextResponse.json(
      { error: message, step, stack },
      { status: 500 }
    );
  }
});
