/**
 * Patient Portal Tickets API
 * ==========================
 *
 * GET  /api/patient-portal/tickets - List patient's own tickets
 * POST /api/patient-portal/tickets - Create a support request
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

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
      where.OR = [
        { patientId: effectivePatientId },
        { createdById: user.id },
      ];
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

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();

    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const ALLOWED_CATEGORIES = ['GENERAL', 'GENERAL_INQUIRY', 'BILLING', 'BILLING_ISSUE', 'PRESCRIPTION', 'PRESCRIPTION_ISSUE', 'APPOINTMENT', 'SCHEDULING_ISSUE', 'PORTAL_ACCESS', 'OTHER'];
    const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'GENERAL';

    let patientId = (user as any).patientId;
    if (!patientId && user.role.toLowerCase() === 'patient') {
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: { patientId: true },
      });
      patientId = userRecord?.patientId;
    }

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const ticketCount = await prisma.ticket.count({ where: { clinicId } });
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { subdomain: true } });
    const prefix = clinic?.subdomain?.toUpperCase().slice(0, 3) || 'TKT';
    const ticketNumber = `${prefix}-${String(ticketCount + 1).padStart(6, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        clinicId,
        ticketNumber,
        title: body.title.trim(),
        description: body.description.trim(),
        category,
        priority: 'P3_MEDIUM',
        source: 'PATIENT_PORTAL',
        status: 'NEW',
        createdById: user.id,
        patientId: patientId || null,
      },
    });

    logger.info('[PatientPortal] Ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      patientId,
      userId: user.id,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/patient-portal/tickets' });
  }
});
