import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';

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
        gte: startOfMonth
      }
    }
  });
  
  const ticketNum = String(count + 1).padStart(4, '0');
  return `TKT-${year}${month}-${ticketNum}`;
}

// GET /api/internal/tickets - Fetch tickets
async function getHandler(request: NextRequest, user: any) {
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
      filters: { assignedToId, status, priority, patientId }
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
            email: true
          }
        },
        order: {
          select: {
            id: true,
            lifefileOrderId: true,
            primaryMedName: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5
        },
        _count: {
          select: {
            comments: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset
    });

    return NextResponse.json(tickets);
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}

// POST /api/internal/tickets - Create a ticket
async function postHandler(request: NextRequest, user: any) {
  try {
    const body = await request.json();
    // Use authenticated user as creator
    const createdById = user.id;
    const {
      title,
      description,
      priority = 'MEDIUM',
      category = 'GENERAL',
      patientId,
      orderId,
      assignedToId,
      tags,
      customFields,
      attachments,
      isNonClientIssue = false
    } = body;
    
    // Log ticket creation for audit
    logger.api('POST', '/api/internal/tickets', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      patientId,
      category
    });

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

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
        patientId: patientId ? parseInt(patientId) : null,
        orderId: orderId ? parseInt(orderId) : null,
        createdById: createdById,
        assignedToId: assignedToId ? parseInt(assignedToId) : null,
        clinicId: user.clinicId,
        tags,
        customFields,
        attachments,
        isNonClientIssue: !patientId || isNonClientIssue
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        order: {
          select: {
            id: true,
            lifefileOrderId: true,
            primaryMedName: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    // Create initial status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: newTicket.id,
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        changedById: createdById,
        reason: 'Ticket created'
      }
    });

    // If assigned, create assignment record
    if (assignedToId) {
      await prisma.ticketAssignment.create({
        data: {
          ticketId: newTicket.id,
          assignedById: createdById,
          assignedToId: parseInt(assignedToId),
          notes: 'Initial assignment'
        }
      });
    }

    // TODO: Send notification to assigned user

    return NextResponse.json(newTicket, { status: 201 });
  } catch (error) {
    logger.error('Error creating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket' },
      { status: 500 }
    );
  }
}

// Export handlers with authentication
export const GET = withAuth(getHandler, {
  roles: ['admin', 'provider', 'influencer']
});

export const POST = withAuth(postHandler, {
  roles: ['admin', 'provider', 'influencer']
});
