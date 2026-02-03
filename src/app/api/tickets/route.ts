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
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';

/**
 * Check if the error indicates a missing table or schema issue
 */
function isSchemaMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('p2010') || // Prisma: Raw query failed
    msg.includes('p2021') || // Prisma: Table does not exist
    msg.includes('p2022') || // Prisma: Column does not exist
    msg.includes('invalid input value for enum') ||
    (msg.includes('enum') && msg.includes('does not exist'))
  );
}

/**
 * GET /api/tickets
 * List tickets with pagination
 */
export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause - filter by clinic if not super admin
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
    console.error('[API] Tickets GET - error', errorMessage);

    // If schema is out of sync, return empty list gracefully
    if (isSchemaMismatchError(error)) {
      console.warn('[API] Tickets GET - schema mismatch detected, returning empty list');
      return NextResponse.json({
        tickets: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        warning: 'Ticket system is being upgraded. Please wait for migration to complete.',
      });
    }

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
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
        assignedToId: body.assignedToId || null,
        teamId: body.teamId || null,
        patientId: body.patientId || null,
        orderId: body.orderId || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        tags: body.tags || [],
        customFields: body.customFields || null,
        reporterEmail: body.reporterEmail || null,
        reporterName: body.reporterName || null,
        reporterPhone: body.reporterPhone || null,
        parentTicketId: body.parentTicketId || null,
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
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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
    console.error('[API] Tickets POST - error', errorMessage);

    // If schema is out of sync, return helpful error
    if (isSchemaMismatchError(error)) {
      return NextResponse.json(
        {
          error: 'Ticket creation temporarily unavailable',
          message: 'The ticket system is being upgraded. Please try again in a few minutes.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create ticket', details: errorMessage },
      { status: 500 }
    );
  }
});
