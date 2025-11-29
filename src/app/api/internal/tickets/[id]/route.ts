import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/internal/tickets/[id] - Get ticket details
async function getHandler(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

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
          orderBy: {
            createdAt: 'desc'
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
            createdAt: 'asc'
          }
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
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error('Error fetching ticket:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticket' },
      { status: 500 }
    );
  }
}

// PATCH /api/internal/tickets/[id] - Update ticket
async function patchHandler(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);
    const body = await request.json();

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      priority,
      status,
      disposition,
      category,
      assignedToId,
      resolutionNotes,
      tags,
      customFields,
      updatedById
    } = body;

    // Get current ticket for comparison
    const currentTicket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!currentTicket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (customFields !== undefined) updateData.customFields = customFields;

    // Handle status changes
    if (status && status !== currentTicket.status) {
      updateData.status = status;
      
      // If resolving/closing, update resolution fields
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updateData.resolvedAt = new Date();
        updateData.resolvedById = updatedById;
        if (resolutionNotes) {
          updateData.resolutionNotes = resolutionNotes;
        }
      }

      // Create status history entry
      await prisma.ticketStatusHistory.create({
        data: {
          ticketId,
          fromStatus: currentTicket.status as any,
          toStatus: status,
          changedById: updatedById,
          reason: body.statusChangeReason
        }
      });
    }

    if (disposition !== undefined) {
      updateData.disposition = disposition;
    }

    // Handle assignment changes
    if (assignedToId !== undefined && assignedToId !== currentTicket.assignedToId) {
      updateData.assignedToId = assignedToId;
      
      // Create assignment record
      if (assignedToId && updatedById) {
        await prisma.ticketAssignment.create({
          data: {
            ticketId,
            assignedById: updatedById,
            assignedToId,
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

    // TODO: Send notifications for status/assignment changes

    return NextResponse.json(updatedTicket);
  } catch (error) {
    logger.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to update ticket' },
      { status: 500 }
    );
  }
}

// Export handlers
export { getHandler as GET, patchHandler as PATCH };
