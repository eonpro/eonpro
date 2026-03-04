/**
 * Patient Portal Ticket Detail API
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const GET = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        category: true,
        source: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        resolutionNotes: true,
        createdById: true,
        patientId: true,
        clinicId: true,
        assignedTo: { select: { firstName: true, lastName: true } },
        _count: { select: { comments: true } },
      },
    });

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const role = user.role.toLowerCase();
    if (role === 'patient') {
      let patientId = (user as any).patientId;
      if (!patientId) {
        const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { patientId: true } });
        const patient = userRecord?.patientId ? { id: userRecord.patientId } : null;
        patientId = patient?.id;
      }
      if (ticket.createdById !== user.id && ticket.patientId !== patientId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    } else if (role !== 'super_admin') {
      if (user.clinicId != null && ticket.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/patient-portal/tickets/${(await params).id}` });
  }
});
