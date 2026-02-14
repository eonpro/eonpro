/**
 * Tickets API Route
 * =================
 *
 * GET  /api/tickets - List tickets with filters
 * POST /api/tickets - Create a new ticket
 *
 * Enterprise-grade ticket system with graceful degradation.
 *
 * @module app/api/tickets
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { ticketService, reportTicketError } from '@/domains/ticket';
import type { TicketListFilters, TicketListOptions } from '@/domains/ticket';

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
    (msg.includes('enum') && msg.includes('does not exist')) ||
    msg.includes('unknown field') ||
    msg.includes('unknown argument')
  );
}

/**
 * Check if error is a database connection issue
 */
function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('p1001') || // Can't reach database
    msg.includes('p1002') || // Database timeout
    msg.includes('p1008') || // Operations timed out
    msg.includes('p1017') || // Server closed connection
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused')
  );
}

/**
 * OPTIONS /api/tickets
 * CORS preflight - middleware sets Allow-Origin; return 204 for preflight.
 */
export const OPTIONS = async () => {
  return new NextResponse(null, { status: 204 });
};

/**
 * GET /api/tickets
 * List tickets with pagination and filtering
 *
 * Supports graceful degradation if enterprise features aren't migrated yet.
 */
export const GET = withAuth(async (request, user) => {
  try {
    // Non–super_admin without clinicId: return empty list (no leak) so the UI still loads
    const effectiveClinicId =
      user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);
    const hasClinicContext = user.role === 'super_admin' || (user.clinicId != null && user.clinicId !== undefined);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
    const search = searchParams.get('search')?.trim() || undefined;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Multi-value and quick filters (from UI)
    const statusList = searchParams.getAll('status').filter(Boolean);
    const priorityList = searchParams.getAll('priority').filter(Boolean);
    const myTickets = searchParams.get('myTickets') === 'true';
    const isUnassigned = searchParams.get('isUnassigned') === 'true';
    const hasSlaBreach = searchParams.get('hasSlaBreach') === 'true';
    const assignedToIdParam = searchParams.get('assignedToId');
    const assignedToId = assignedToIdParam ? parseInt(assignedToIdParam, 10) : undefined;

    if (!hasClinicContext) {
      return NextResponse.json({
        tickets: [],
        pagination: {
          page: 1,
          limit,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        warning: 'Select a clinic to view tickets.',
      });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const filters: TicketListFilters = {
      clinicId: effectiveClinicId,
      status: statusList.length ? (statusList as import('@prisma/client').TicketStatus[]) : undefined,
      priority: priorityList.length ? (priorityList as import('@prisma/client').TicketPriority[]) : undefined,
      assignedToId,
      myTickets,
      isUnassigned,
      hasSlaBreach,
      search,
    };

    const options: TicketListOptions = {
      page,
      limit,
      sortBy: ['createdAt', 'updatedAt', 'lastActivityAt', 'priority', 'status', 'ticketNumber', 'dueDate'].includes(sortBy)
        ? sortBy as TicketListOptions['sortBy']
        : 'createdAt',
      sortOrder,
    };

    try {
      const result = await ticketService.list(filters, options, userContext);
      return NextResponse.json({
        tickets: result.tickets,
        pagination: result.pagination,
      });
    } catch (listError) {
      // If schema/domain fails (e.g. migration not run), fall back to inline query with same filters
      if (!isSchemaMismatchError(listError)) {
        throw listError;
      }
      logger.warn('[API] Tickets GET - list service failed, using fallback', {
        error: listError instanceof Error ? listError.message : String(listError),
      });
    }

    // Fallback: inline Prisma query with full filter support and lastActivityAt + sla
    const skip = (page - 1) * limit;
    const validSortFields = ['createdAt', 'updatedAt', 'lastActivityAt', 'priority', 'status', 'ticketNumber'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy = { [orderByField]: sortOrder };

    const whereClause: Prisma.TicketWhereInput = {
      clinicId: user.clinicId ?? undefined,
    };
    if (statusList.length) whereClause.status = { in: statusList as import('@prisma/client').TicketStatus[] };
    if (priorityList.length) whereClause.priority = { in: priorityList as import('@prisma/client').TicketPriority[] };
    if (myTickets) whereClause.assignedToId = user.id;
    else if (isUnassigned) whereClause.assignedToId = null;
    else if (assignedToId != null) whereClause.assignedToId = assignedToId;
    if (hasSlaBreach) whereClause.sla = { breached: true };
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    let tickets: unknown[];
    let total: number;

    try {
      [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where: whereClause,
          orderBy,
          skip,
          take: limit,
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            category: true,
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
            sla: {
              select: {
                firstResponseDue: true,
                resolutionDue: true,
                breached: true,
              },
            },
            _count: {
              select: {
                comments: true,
                attachmentFiles: true,
                watchers: true,
              },
            },
          },
        }),
        prisma.ticket.count({ where: whereClause }),
      ]);
    } catch (fallbackError) {
      if (isSchemaMismatchError(fallbackError)) {
        logger.warn('[API] Tickets GET - fallback also failed (lastActivityAt/sla may be missing)');
        [tickets, total] = await Promise.all([
          prisma.ticket.findMany({
            where: whereClause,
            orderBy: { createdAt: sortOrder },
            skip,
            take: limit,
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              category: true,
              createdAt: true,
              updatedAt: true,
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
              _count: { select: { comments: true } },
            },
          }),
          prisma.ticket.count({ where: whereClause }),
        ]);
      } else {
        throw fallbackError;
      }
    }

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
    reportTicketError(error, {
      route: 'GET /api/tickets',
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'list',
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[API] Tickets GET - error', {
      error: errorMessage,
      userId: user.id,
      clinicId: user.clinicId,
    });

    // Database connection errors should return 503 (Service Unavailable)
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'Please try again in a moment.',
          code: 'DATABASE_UNAVAILABLE',
        },
        {
          status: 503,
          headers: { 'Retry-After': '5' },
        }
      );
    }

    // If schema is out of sync, return empty list with warning
    if (isSchemaMismatchError(error)) {
      logger.warn('[API] Tickets GET - schema mismatch detected', { error: errorMessage });
      return NextResponse.json({
        tickets: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        warning: 'Ticket system migration in progress. Please wait a moment and refresh.',
      });
    }

    // Domain/validation/not-found/forbidden and other errors get consistent handling
    return handleApiError(error, {
      route: 'GET /api/tickets',
      context: { userId: user.id, clinicId: user.clinicId },
    });
  }
});

/**
 * POST /api/tickets
 * Create a new ticket
 *
 * Supports graceful degradation if enterprise features aren't migrated yet.
 */
export const POST = withAuth(async (request, user) => {
  try {
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Use user's clinic if not specified
    const clinicId = body.clinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Validate required fields
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!body.description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    const createData = {
      clinicId,
      title: body.title.trim(),
      description: body.description.trim(),
      category: body.category || 'GENERAL',
      priority: body.priority || 'P3_MEDIUM',
      source: body.source || 'INTERNAL',
      assignedToId: body.assignedToId ?? undefined,
      teamId: body.teamId ?? undefined,
      patientId: body.patientId ?? undefined,
      orderId: body.orderId ?? undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      customFields: body.customFields,
      reporterEmail: body.reporterEmail,
      reporterName: body.reporterName,
      reporterPhone: body.reporterPhone,
      parentTicketId: body.parentTicketId ?? undefined,
    };

    const ticket = await ticketService.create(createData, userContext);

    logger.info('[API] Tickets POST - ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      clinicId,
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
    reportTicketError(error, {
      route: 'POST /api/tickets',
      clinicId: user.clinicId ?? undefined,
      userId: user.id,
      operation: 'create',
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[API] Tickets POST - error', {
      error: errorMessage,
      userId: user.id,
      clinicId: user.clinicId,
    });

    // Domain errors (validation, forbidden, etc.) get correct status via handleApiError
    const response = handleApiError(error, { route: 'POST /api/tickets' });
    if (response.status !== 500) return response;

    // Database connection errors
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'Please try again in a moment.',
          code: 'DATABASE_UNAVAILABLE',
        },
        {
          status: 503,
          headers: { 'Retry-After': '5' },
        }
      );
    }

    // If schema is out of sync, return helpful error
    if (isSchemaMismatchError(error)) {
      return NextResponse.json(
        {
          error: 'Ticket creation temporarily unavailable',
          message: 'The ticket system is being upgraded. Please try again in a few minutes.',
          code: 'MIGRATION_PENDING',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create ticket', message: errorMessage },
      { status: 500 }
    );
  }
});
