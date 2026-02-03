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
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { TicketListFilters, TicketListOptions, CreateTicketInput } from '@/domains/ticket';
import type { TicketStatus, TicketPriority, TicketCategory, TicketSource } from '@prisma/client';

/**
 * GET /api/tickets
 * List tickets with optional filters and pagination
 */
export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters
    const filters: TicketListFilters = {};

    // Clinic filter (super admin can filter by clinic)
    const clinicIdParam = searchParams.get('clinicId');
    if (clinicIdParam) {
      filters.clinicId = parseInt(clinicIdParam, 10);
    }

    // Status filter (can be multiple)
    const statusParam = searchParams.getAll('status');
    if (statusParam.length > 0) {
      filters.status = statusParam as TicketStatus[];
    }

    // Priority filter
    const priorityParam = searchParams.getAll('priority');
    if (priorityParam.length > 0) {
      filters.priority = priorityParam as TicketPriority[];
    }

    // Category filter
    const categoryParam = searchParams.getAll('category');
    if (categoryParam.length > 0) {
      filters.category = categoryParam as TicketCategory[];
    }

    // Source filter
    const sourceParam = searchParams.getAll('source');
    if (sourceParam.length > 0) {
      filters.source = sourceParam as TicketSource[];
    }

    // Assignment filters
    const assignedToIdParam = searchParams.get('assignedToId');
    if (assignedToIdParam) {
      filters.assignedToId = assignedToIdParam === 'null' ? null : parseInt(assignedToIdParam, 10);
    }

    const teamIdParam = searchParams.get('teamId');
    if (teamIdParam) {
      filters.teamId = teamIdParam === 'null' ? null : parseInt(teamIdParam, 10);
    }

    // Boolean filters
    if (searchParams.get('isUnassigned') === 'true') {
      filters.isUnassigned = true;
    }
    if (searchParams.get('myTickets') === 'true') {
      filters.myTickets = true;
    }
    if (searchParams.get('myWatched') === 'true') {
      filters.myWatched = true;
    }
    if (searchParams.get('hasSlaBreach') === 'true') {
      filters.hasSlaBreach = true;
    }

    // Related entity filters
    const patientIdParam = searchParams.get('patientId');
    if (patientIdParam) {
      filters.patientId = parseInt(patientIdParam, 10);
    }

    const orderIdParam = searchParams.get('orderId');
    if (orderIdParam) {
      filters.orderId = parseInt(orderIdParam, 10);
    }

    // Search
    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    // Tags
    const tagsParam = searchParams.getAll('tags');
    if (tagsParam.length > 0) {
      filters.tags = tagsParam;
    }

    // Date filters
    const createdAfter = searchParams.get('createdAfter');
    if (createdAfter) {
      filters.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('createdBefore');
    if (createdBefore) {
      filters.createdBefore = new Date(createdBefore);
    }

    // Parse options
    const options: TicketListOptions = {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
      sortBy: (searchParams.get('sortBy') as TicketListOptions['sortBy']) || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };

    // Build user context
    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const result = await ticketService.list(filters, options, userContext);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/tickets' });
  }
});

/**
 * POST /api/tickets
 * Create a new ticket
 */
export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();

    // Build user context
    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    // Use user's clinic if not specified
    const clinicId = body.clinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    const input: CreateTicketInput = {
      clinicId,
      title: body.title,
      description: body.description,
      category: body.category,
      priority: body.priority,
      source: body.source,
      assignedToId: body.assignedToId,
      teamId: body.teamId,
      patientId: body.patientId,
      orderId: body.orderId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      tags: body.tags,
      customFields: body.customFields,
      reporterEmail: body.reporterEmail,
      reporterName: body.reporterName,
      reporterPhone: body.reporterPhone,
      parentTicketId: body.parentTicketId,
    };

    const ticket = await ticketService.create(input, userContext);

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
    return handleApiError(error, { route: 'POST /api/tickets' });
  }
});
