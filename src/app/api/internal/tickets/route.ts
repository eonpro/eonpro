import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// Zod schema for ticket creation
const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(5000, 'Description must be under 5000 characters'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  category: z
    .enum([
      'GENERAL',
      'BILLING',
      'TECHNICAL',
      'CLINICAL',
      'SHIPPING',
      'REFUND',
      'COMPLAINT',
      'OTHER',
    ])
    .default('GENERAL'),
  patientId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return null;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? null : num;
    }),
  orderId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return null;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? null : num;
    }),
  assignedToId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return null;
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(num) ? null : num;
    }),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
  attachments: z.array(z.string()).optional(),
  isNonClientIssue: z.boolean().default(false),
});

// Generate unique ticket number
async function generateTicketNumber(): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  // Count existing tickets this month
  const startOfMonth = new Date(year, date.getMonth(), 1);
  const count = await prisma.ticket.count({
    where: {
      createdAt: {
        gte: startOfMonth,
      },
    },
  });

  const ticketNum = String(count + 1).padStart(4, '0');
  return `TKT-${year}${month}-${ticketNum}`;
}

// GET /api/internal/tickets - Fetch tickets
async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(request.url);
    const assignedToId = searchParams.get('assignedToId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const patientId = searchParams.get('patientId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Log access for audit
    logger.api('GET', '/api/internal/tickets', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      filters: { assignedToId, status, priority, patientId },
    });

    const whereClause: any = {};

    // Filter by clinic
    if (user.clinicId) {
      whereClause.clinicId = user.clinicId;
    }

    if (assignedToId) {
      whereClause.assignedToId = parseInt(assignedToId);
    }

    if (status) {
      whereClause.status = status;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (patientId) {
      whereClause.patientId = parseInt(patientId);
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        order: {
          select: {
            id: true,
            lifefileOrderId: true,
            primaryMedName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return NextResponse.json(tickets);
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

// POST /api/internal/tickets - Create a ticket
async function postHandler(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();

    // Validate request body with Zod schema
    const validationResult = createTicketSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid ticket data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      priority,
      category,
      patientId,
      orderId,
      assignedToId,
      tags,
      customFields,
      attachments,
      isNonClientIssue,
    } = validationResult.data;

    // Use authenticated user as creator
    const createdById = user.id;

    // Log ticket creation for audit
    logger.api('POST', '/api/internal/tickets', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      patientId,
      category,
    });

    // Generate ticket number
    const ticketNumber = await generateTicketNumber();

    const newTicket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title,
        description,
        priority,
        category,
        status: 'OPEN',
        patientId: patientId,
        orderId: orderId,
        createdById: createdById,
        assignedToId: assignedToId,
        clinicId: user.clinicId,
        tags,
        customFields,
        attachments,
        isNonClientIssue: !patientId || isNonClientIssue,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        order: {
          select: {
            id: true,
            lifefileOrderId: true,
            primaryMedName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Create initial status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: newTicket.id,
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        changedById: createdById,
        reason: 'Ticket created',
      },
    });

    // If assigned, create assignment record
    if (assignedToId !== null) {
      await prisma.ticketAssignment.create({
        data: {
          ticketId: newTicket.id,
          assignedById: createdById,
          assignedToId: assignedToId,
          notes: 'Initial assignment',
        },
      });
    }

    // TODO: Send notification to assigned user

    return NextResponse.json(newTicket, { status: 201 });
  } catch (error) {
    logger.error('Error creating ticket:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

// Export handlers with authentication
export const GET = withAuth(getHandler, {
  roles: ['admin', 'provider', 'influencer'],
});

export const POST = withAuth(postHandler, {
  roles: ['admin', 'provider', 'influencer'],
});
