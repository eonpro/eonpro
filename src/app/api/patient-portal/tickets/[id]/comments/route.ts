/**
 * Patient Portal Ticket Comments API
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams { params: Promise<{ id: string }>; }

export const GET = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId, isInternal: false },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/patient-portal/tickets/${(await params).id}/comments` });
  }
});

export const POST = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const body = await request.json();
    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { createdById: true, patientId: true },
    });

    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    if (user.role.toLowerCase() === 'patient') {
      let patientId = (user as any).patientId;
      if (!patientId) {
        const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { patientId: true } });
        const patient = userRecord?.patientId ? { id: userRecord.patientId } : null;
        patientId = patient?.id;
      }
      if (ticket.createdById !== user.id && ticket.patientId !== patientId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: user.id,
        comment: body.content.trim(),
        isInternal: false,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { lastActivityAt: new Date() },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: `POST /api/patient-portal/tickets/${(await params).id}/comments` });
  }
});
