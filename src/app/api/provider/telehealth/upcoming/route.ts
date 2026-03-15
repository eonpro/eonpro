/**
 * Provider Upcoming Telehealth Sessions API
 *
 * Returns upcoming video consultations for the authenticated provider.
 * Combines TelehealthSession records with VIDEO appointments that
 * don't have a session yet (e.g. when Zoom isn't fully configured).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { isZoomConfigured } from '@/lib/integrations/zoom/config';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

function safeDecryptPatient(patient: any): any {
  if (!patient) return patient;
  try {
    return decryptPatientPHI(
      { id: patient.id, firstName: patient.firstName, lastName: patient.lastName },
      ['firstName', 'lastName'] as any
    );
  } catch {
    return { id: patient.id, firstName: patient.firstName, lastName: patient.lastName };
  }
}

export const GET = withProviderAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Resolve provider with multiple fallback strategies
    let provider = user.providerId
      ? await prisma.provider.findUnique({ where: { id: user.providerId } })
      : null;

    if (!provider) {
      provider = await prisma.provider.findFirst({
        where: { OR: [{ email: user.email }, { user: { id: user.id } }] },
      });
    }

    if (!provider) {
      logger.warn('Telehealth: Provider not found for user', {
        userId: user.id,
        email: user.email,
        providerId: user.providerId,
      });

      // Fallback: use raw SQL to avoid Prisma client initialization issues
      try {
        const rows = user.clinicId
          ? await prisma.$queryRaw<any[]>`
              SELECT a.id, a.title, a.reason, a."startTime", a.duration, a.status,
                     a."zoomJoinUrl", a."videoLink", a."zoomMeetingId",
                     p.id as "patientId", p."firstName", p."lastName"
              FROM "Appointment" a
              LEFT JOIN "Patient" p ON a."patientId" = p.id
              WHERE a.type = 'VIDEO'
                AND a."startTime" >= NOW() - INTERVAL '7 days'
                AND a."startTime" <= NOW() + INTERVAL '7 days'
                AND a.status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
                AND a."clinicId" = ${user.clinicId}
              ORDER BY a."startTime" ASC
              LIMIT 20`
          : await prisma.$queryRaw<any[]>`
              SELECT a.id, a.title, a.reason, a."startTime", a.duration, a.status,
                     a."zoomJoinUrl", a."videoLink", a."zoomMeetingId",
                     p.id as "patientId", p."firstName", p."lastName"
              FROM "Appointment" a
              LEFT JOIN "Patient" p ON a."patientId" = p.id
              WHERE a.type = 'VIDEO'
                AND a."startTime" >= NOW() - INTERVAL '7 days'
                AND a."startTime" <= NOW() + INTERVAL '7 days'
                AND a.status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
              ORDER BY a."startTime" ASC
              LIMIT 20`;

        const fallbackSessions = await Promise.all(rows.map(async (r: any) => ({
          id: r.id,
          topic: r.title ?? r.reason ?? 'Video Consultation',
          scheduledAt: new Date(r.startTime).toISOString(),
          duration: r.duration ?? 30,
          status: r.status === 'CONFIRMED' ? 'SCHEDULED' : r.status,
          joinUrl: r.zoomJoinUrl ?? r.videoLink ?? '',
          hostUrl: null,
          meetingId: r.zoomMeetingId,
          password: null,
          patient: r.patientId
            ? safeDecryptPatient({ id: r.patientId, firstName: r.firstName, lastName: r.lastName })
            : null,
          appointment: { id: r.id, title: r.title, reason: r.reason },
          source: 'fallback',
        })));

        return NextResponse.json({
          sessions: fallbackSessions,
          totalCount: fallbackSessions.length,
          zoomEnabled: isZoomConfigured(),
          debug: {
            reason: 'provider_not_found_using_raw_fallback',
            userId: user.id,
            clinicId: user.clinicId,
            fallbackCount: fallbackSessions.length,
          },
        });
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown';
        logger.error('Fallback raw query failed', { error: fbMsg });
        return NextResponse.json({
          sessions: [],
          totalCount: 0,
          zoomEnabled: isZoomConfigured(),
          debug: { reason: 'raw_fallback_failed', userId: user.id, error: fbMsg },
        });
      }
    }

    const now = new Date();
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 7);
    lookbackStart.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const sessionResults: any[] = [];
    const seenAppointmentIds = new Set<number>();

    // 1. Try TelehealthSession records first (full Zoom integration)
    try {
      const telehealthSessions = await prisma.telehealthSession.findMany({
        where: {
          providerId: provider.id,
          OR: [
            { scheduledAt: { gte: lookbackStart, lte: endDate } },
            { status: 'IN_PROGRESS' },
          ],
          status: { in: ['SCHEDULED', 'WAITING', 'IN_PROGRESS'] },
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, title: true, reason: true },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      });

      for (const s of telehealthSessions) {
        if (s.appointmentId) seenAppointmentIds.add(s.appointmentId);
        const patient = s.patient
          ? safeDecryptPatient(s.patient)
          : s.patient;
        sessionResults.push({
          id: s.id,
          topic: s.topic,
          scheduledAt: s.scheduledAt.toISOString(),
          duration: s.duration,
          status: s.status,
          joinUrl: s.hostUrl ?? s.joinUrl,
          hostUrl: s.hostUrl,
          meetingId: s.meetingId,
          password: s.password,
          patient,
          appointment: s.appointment,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('does not exist') || msg.includes('relation')) {
        logger.warn('TelehealthSession table not found — using appointments fallback');
      } else {
        logger.error('Error querying telehealth sessions', { error: msg });
      }
    }

    // 2. Also fetch VIDEO appointments that don't have a TelehealthSession
    let videoAppointments: any[] = [];
    try {
    videoAppointments = await prisma.appointment.findMany({
      where: {
        providerId: provider.id,
        type: 'VIDEO',
        OR: [
          { startTime: { gte: lookbackStart, lte: endDate } },
          { status: 'IN_PROGRESS' },
        ],
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        ...(seenAppointmentIds.size > 0
          ? { id: { notIn: Array.from(seenAppointmentIds) } }
          : {}),
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { startTime: 'asc' },
      take: 20,
    });

    for (const apt of videoAppointments) {
      const patient = apt.patient
        ? safeDecryptPatient(apt.patient)
        : null;
      sessionResults.push({
        id: apt.id,
        topic: apt.title ?? apt.reason ?? 'Video Consultation',
        scheduledAt: apt.startTime.toISOString(),
        duration: apt.duration ?? 30,
        status: apt.status === 'CONFIRMED' ? 'SCHEDULED' : apt.status,
        joinUrl: apt.zoomJoinUrl ?? apt.videoLink ?? '',
        hostUrl: null,
        meetingId: apt.zoomMeetingId,
        password: null,
        patient,
        appointment: {
          id: apt.id,
          title: apt.title,
          reason: apt.reason,
        },
        source: 'appointment',
      });
    }
    } catch (aptErr) {
      logger.error('Error querying video appointments', {
        error: aptErr instanceof Error ? aptErr.message : 'Unknown',
        providerId: provider.id,
      });
    }

    // Sort combined results by scheduled time
    sessionResults.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    return NextResponse.json({
      sessions: sessionResults.slice(0, 20),
      totalCount: sessionResults.length,
      zoomEnabled: isZoomConfigured(),
      debug: {
        providerId: provider.id,
        zoomConfigured: isZoomConfigured(),
        telehealthSessionCount: seenAppointmentIds.size,
        videoAppointmentCount: videoAppointments.length,
        dateRange: { from: now.toISOString(), to: endDate.toISOString() },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch upcoming telehealth sessions', { error: errorMessage });
    return NextResponse.json({
      error: 'Failed to fetch sessions',
      debug: { message: errorMessage },
    }, { status: 500 });
  }
});
