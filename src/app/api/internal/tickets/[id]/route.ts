import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';

// Validation schemas
const ticketIdSchema = z.string().transform(val => {
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) throw new Error('Invalid ticket ID');
  return num;
});

const updateTicketSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']).optional(),
  disposition: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  assignedToId: z.number().positive().nullable().optional(),
  resolutionNotes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
  updatedById: z.number().positive().optional(),
  statusChangeReason: z.string().max(1000).optional(),
  assignmentNotes: z.string().max(1000).optional(),
});

// Allowed roles for internal ticket management
const ALLOWED_ROLES = ['super_admin', 'admin', 'staff', 'support'];

// GET /api/internal/tickets/[id] - Get ticket details
const getHandler = withAuth(async (
  request: NextRequest,
  user,
  context?: { params: Promise<{ id: string }> }
) => {
  try {
    // Check role authorization
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!context?.params) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const params = await context.params;
    const parseResult = ticketIdSchema.safeParse(params.id);
    
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }
    
    const ticketId = parseResult.data;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address1: true,
            city: true,
            state: true,
            zip: true
          }
        },
        order: true,
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
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        assignments: {
          include: {
            assignedBy: {
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
          },
          orderBy: { createdAt: 'desc' },
          take: 50 // Limit assignment history
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
          orderBy: { createdAt: 'asc' },
          take: 100 // Limit comments
        },
        statusHistory: {
          include: {
            changedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: 'asc' },
          take: 50 // Limit history
        }
      }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    logger.info('Ticket fetched', { ticketId, userId: user.id });
    return NextResponse.json(ticket);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching ticket', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 });
  }
});

// PATCH /api/internal/tickets/[id] - Update ticket
const patchHandler = withAuth(async (
  request: NextRequest,
  user,
  context?: { params: Promise<{ id: string }> }
) => {
  try {
    // Check role authorization
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!context?.params) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const params = await context.params;
    const idParseResult = ticketIdSchema.safeParse(params.id);
    
    if (!idParseResult.success) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }
    
    const ticketId = idParseResult.data;
    
    // Parse and validate body
    const rawBody = await request.json();
    const bodyParseResult = updateTicketSchema.safeParse(rawBody);
    
    if (!bodyParseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: bodyParseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }
    
    const body = bodyParseResult.data;

    // Get current ticket for comparison
    const currentTicket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!currentTicket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.customFields !== undefined) updateData.customFields = body.customFields;

    const updatedById = body.updatedById || user.id;

    // Handle status changes
    if (body.status && body.status !== currentTicket.status) {
      updateData.status = body.status;
      
      // If resolving/closing, update resolution fields
      if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
        updateData.resolvedAt = new Date();
        updateData.resolvedById = updatedById;
        if (body.resolutionNotes) {
          updateData.resolutionNotes = body.resolutionNotes;
        }
      }

      // Create status history entry
      await prisma.ticketStatusHistory.create({
        data: {
          ticketId,
          fromStatus: currentTicket.status as string,
          toStatus: body.status,
          changedById: updatedById,
          reason: body.statusChangeReason
        }
      });
    }

    if (body.disposition !== undefined) {
      updateData.disposition = body.disposition;
    }

    // Handle assignment changes
    if (body.assignedToId !== undefined && body.assignedToId !== currentTicket.assignedToId) {
      updateData.assignedToId = body.assignedToId;
      
      // Create assignment record
      if (body.assignedToId) {
        await prisma.ticketAssignment.create({
          data: {
            ticketId,
            assignedById: updatedById,
            assignedToId: body.assignedToId,
            notes: body.assignmentNotes || 'Reassigned'
          }
        });
      }
    }

    // Update ticket
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
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

    logger.info('Ticket updated', { ticketId, userId: user.id, changes: Object.keys(updateData) });
    return NextResponse.json(updatedTicket);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating ticket', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
});

// Export handlers with proper typing
export const GET = getHandler;
export const PATCH = patchHandler;
