/**
 * Patient Portal Tickets API
 * ==========================
 *
 * GET  /api/patient-portal/tickets - List patient's own tickets
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(async (request, user) => {
  try {
    const patientId = (user as any).patientId;

    if (!patientId && user.role.toLowerCase() === 'patient') {
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: { patientId: true },
      });
      if (!userRecord?.patientId) return NextResponse.json({ tickets: [] });
      (user as any).patientId = userRecord.patientId;
    }

    const effectivePatientId = (user as any).patientId;

    const where: any = {};
    if (user.role.toLowerCase() === 'patient') {
      where.OR = [{ patientId: effectivePatientId }, { createdById: user.id }];
    } else {
      where.clinicId = user.clinicId;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/patient-portal/tickets' });
  }
});
