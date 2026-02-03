/**
 * Tickets API Route
 * =================
 *
 * GET  /api/tickets - List tickets with filters
 * POST /api/tickets - Create a new ticket
 *
 * @module app/api/tickets
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets
 * List tickets with optional filters and pagination
 */
export const GET = withAuth(async (request, { user }) => {
  try {
    logger.info('[API] Tickets GET - starting', { userId: user.id, role: user.role });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause based on user role
    const whereClause = user.role !== 'SUPER_ADMIN' && user.clinicId
      ? { clinicId: user.clinicId }
      : {};

    // Query tickets
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          lastActivityAt: true,
          dueDate: true,
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientId: true,
            },
          },
        },
      }),
      prisma.ticket.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info('[API] Tickets GET - success', { count: tickets.length, total });

    return NextResponse.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[API] Tickets GET - error', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to fetch tickets', details: errorMessage },
      { status: 500 }
    );
  }
});

/**
 * POST /api/tickets
 * Create a new ticket
 */
export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();

    // Use user's clinic if not specified
    const clinicId = body.clinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!body.description?.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Generate ticket number
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { subdomain: true },
    });
    const prefix = clinic?.subdomain?.toUpperCase().slice(0, 3) || 'TKT';
    const ticketCount = await prisma.ticket.count({ where: { clinicId } });
    const ticketNumber = `${prefix}-${String(ticketCount + 1).padStart(6, '0')}`;

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        clinicId,
        ticketNumber,
        title: body.title,
        description: body.description,
        category: body.category || 'GENERAL',
        priority: body.priority || 'P3_MEDIUM',
        source: body.source || 'INTERNAL',
        status: 'NEW',
        createdById: user.id,
        assignedToId: body.assignedToId,
        teamId: body.teamId,
        patientId: body.patientId,
        orderId: body.orderId,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        tags: body.tags || [],
        customFields: body.customFields,
        reporterEmail: body.reporterEmail,
        reporterName: body.reporterName,
        reporterPhone: body.reporterPhone,
        parentTicketId: body.parentTicketId,
        assignedAt: body.assignedToId ? new Date() : null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    logger.info('[API] Ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      createdById: user.id,
    });

    return NextResponse.json(
      {
        ticket,
        message: 'Ticket created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[API] Tickets POST - error', { error: errorMessage });
    return NextResponse.json(
      { error: 'Failed to create ticket', details: errorMessage },
      { status: 500 }
    );
  }
});
