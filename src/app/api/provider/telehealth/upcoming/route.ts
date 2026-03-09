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
import { isZoomEnabled } from '@/lib/integrations/zoom/config';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

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

      // Fallback: show VIDEO appointments in the user's clinic
      try {
        const where: Record<string, unknown> = {
          type: 'VIDEO',
          startTime: { gte: now, lte: endDate },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        };
        // Scope by clinic if available
        if (user.clinicId) {
          where.clinicId = user.clinicId;
        }

        const fallbackAppointments = await prisma.appointment.findMany({
          where,
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { startTime: 'asc' },
          take: 20,
        });

        const fallbackSessions = fallbackAppointments.map((apt: any) => {
          // Skip decryption in fallback to avoid circular import issues
          const patient = apt.patient ?? null;
          return {
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
            appointment: { id: apt.id, title: apt.title, reason: apt.reason },
            source: 'fallback',
          };
        });

        return NextResponse.json({
          sessions: fallbackSessions,
          totalCount: fallbackSessions.length,
          zoomEnabled: isZoomEnabled(),
          debug: {
            reason: 'provider_not_found_using_clinic_fallback',
            userId: user.id,
            clinicId: user.clinicId,
            fallbackCount: fallbackSessions.length,
          },
        });
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown';
        logger.error('Fallback appointment query failed', { error: fbMsg });
        return NextResponse.json({
          sessions: [],
          totalCount: 0,
          zoomEnabled: isZoomEnabled(),
          debug: { reason: 'fallback_failed', userId: user.id, error: fbMsg },
        });
      }
    }

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const sessionResults: any[] = [];
    const seenAppointmentIds = new Set<number>();

    // 1. Try TelehealthSession records first (full Zoom integration)
    try {
      const telehealthSessions = await prisma.telehealthSession.findMany({
        where: {
          providerId: provider.id,
          scheduledAt: { gte: now, lte: endDate },
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
          ? decryptPatientPHI(s.patient, ['firstName', 'lastName'])
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
        startTime: { gte: now, lte: endDate },
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
        ? decryptPatientPHI(apt.patient, ['firstName', 'lastName'])
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
      zoomEnabled: isZoomEnabled(),
      debug: {
        providerId: provider.id,
        zoomConfigured: isZoomEnabled(),
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
