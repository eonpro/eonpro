/**
 * Single Appointment iCal Export
 * 
 * Generates downloadable .ics file for a single appointment.
 * Can be used by patients or providers to add appointments to their calendar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { generateAppointmentICS } from '@/lib/calendar-sync/ical.service';

interface RouteContext {
  params: Promise<{ appointmentId: string }>;
}

/**
 * GET /api/calendar/export/[appointmentId]
 * Download iCal file for a single appointment
 */
async function handler(req: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    if (!context) {
      return NextResponse.json({ error: 'Invalid route context' }, { status: 400 });
    }
    
    const { appointmentId } = await context.params;
    const id = parseInt(appointmentId);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid appointment ID' },
        { status: 400 }
      );
    }

    // Get appointment and verify access
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        providerId: true,
        patient: {
          select: { id: true }
        },
        provider: {
          select: { id: true, user: { select: { id: true } } }
        }
      }
    });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check access
    const isProvider = appointment.provider?.user?.id === user.id;
    const isPatient = user.patientId && appointment.patientId === user.patientId;
    const isClinicAdmin = user.role === 'admin' && user.clinicId === appointment.clinicId;
    const isSuperAdmin = user.role === 'super_admin';

    if (!isProvider && !isPatient && !isClinicAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Determine if we should include patient name
    // Only include for providers/admins, not for patient's own view
    const includePatientName = !isPatient;

    // Generate ICS content
    const icsContent = await generateAppointmentICS(id, includePatientName);

    if (!icsContent) {
      return NextResponse.json(
        { error: 'Failed to generate calendar file' },
        { status: 500 }
      );
    }

    // Return as downloadable file
    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="appointment-${id}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Failed to export appointment to iCal', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to export appointment' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
