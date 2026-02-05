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
 * GET /api/tickets
 * List tickets with pagination and filtering
 *
 * Supports graceful degradation if enterprise features aren't migrated yet.
 */
export const GET = withAuth(async (request, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
    const skip = (page - 1) * limit;

    // Optional filters
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedToId = searchParams.get('assignedToId');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Build where clause - filter by clinic if not super admin
    const whereClause: Record<string, unknown> = {};

    if (user.role !== 'SUPER_ADMIN' && user.clinicId) {
      whereClause.clinicId = user.clinicId;
    }

    // Apply optional filters
    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (assignedToId) {
      whereClause.assignedToId = parseInt(assignedToId, 10);
    }
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy - only use supported fields
    const validSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy = { [orderByField]: sortOrder };

    // Try enterprise query first, fall back to basic if schema mismatch
    let tickets: unknown[];
    let total: number;

    try {
      // Full enterprise query with all relations
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
            _count: {
              select: {
                comments: true,
              },
            },
          },
        }),
        prisma.ticket.count({ where: whereClause }),
      ]);
    } catch (enterpriseError) {
      // Log the actual error for debugging
      logger.error('[API] Tickets GET - enterprise query failed', {
        error: enterpriseError instanceof Error ? enterpriseError.message : String(enterpriseError),
        stack: enterpriseError instanceof Error ? enterpriseError.stack : undefined,
      });

      // If enterprise features aren't available, try basic query
      if (isSchemaMismatchError(enterpriseError)) {
        logger.warn('[API] Tickets GET - using fallback basic query');

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
      } else {
        // Re-throw if it's not a schema issue
        throw enterpriseError;
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

    return NextResponse.json(
      { error: 'Failed to fetch tickets', message: errorMessage },
      { status: 500 }
    );
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

    // Generate ticket number atomically to prevent duplicates
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { subdomain: true },
    });
    const prefix = clinic?.subdomain?.toUpperCase().slice(0, 3) || 'TKT';

    // Use transaction for atomic ticket number generation
    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ticketCount = await tx.ticket.count({ where: { clinicId } });
      const ticketNumber = `${prefix}-${String(ticketCount + 1).padStart(6, '0')}`;

      // Build create data - only include enterprise fields if they exist in schema
      const createData: Record<string, unknown> = {
        clinicId,
        ticketNumber,
        title: body.title.trim(),
        description: body.description.trim(),
        category: body.category || 'GENERAL',
        priority: body.priority || 'P3_MEDIUM',
        status: 'NEW',
        createdById: user.id,
        assignedToId: body.assignedToId || null,
        patientId: body.patientId || null,
        orderId: body.orderId || null,
      };

      // Add enterprise fields if provided (these may fail if migration not run)
      if (body.source) createData.source = body.source;
      if (body.teamId) createData.teamId = body.teamId;
      if (body.dueDate) createData.dueDate = new Date(body.dueDate);
      if (body.tags) createData.tags = body.tags;
      if (body.customFields) createData.customFields = body.customFields;
      if (body.reporterEmail) createData.reporterEmail = body.reporterEmail;
      if (body.reporterName) createData.reporterName = body.reporterName;
      if (body.reporterPhone) createData.reporterPhone = body.reporterPhone;
      if (body.parentTicketId) createData.parentTicketId = body.parentTicketId;
      if (body.assignedToId) createData.assignedAt = new Date();

      try {
        // Try full enterprise create
        return await tx.ticket.create({
          data: createData as never,
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
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                patientId: true,
              },
            },
          },
        });
      } catch (createError) {
        // If enterprise fields fail, try basic create
        if (isSchemaMismatchError(createError)) {
          logger.warn('[API] Tickets POST - using basic create (enterprise migration pending)', {
            error: createError instanceof Error ? createError.message : String(createError),
          });

          // Basic create without enterprise fields
          return await tx.ticket.create({
            data: {
              clinicId,
              ticketNumber,
              title: body.title.trim(),
              description: body.description.trim(),
              category: body.category || 'GENERAL',
              priority: body.priority || 'MEDIUM', // Use basic enum value
              status: 'OPEN', // Use basic enum value
              createdById: user.id,
              assignedToId: body.assignedToId || null,
              patientId: body.patientId || null,
              orderId: body.orderId || null,
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
        }
        throw createError;
      }
    }, {
      timeout: 10000, // 10 second timeout
    });

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[API] Tickets POST - error', {
      error: errorMessage,
      userId: user.id,
      clinicId: user.clinicId,
    });

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
