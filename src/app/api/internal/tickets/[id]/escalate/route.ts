import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// POST /api/internal/tickets/[id]/escalate - Escalate a ticket
async function postHandler(
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
      escalatedById,
      escalatedToId,
      reason,
      level = 1
    } = body;

    if (!escalatedById || !escalatedToId || !reason) {
      return NextResponse.json(
        { error: 'Escalation details are required' },
        { status: 400 }
      );
    }

    // Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        escalations: {
          where: { isActive: true }
        }
      }
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Deactivate previous escalations
    if (ticket.escalations.length > 0) {
      await prisma.ticketEscalation.updateMany({
        where: {
          ticketId,
          isActive: true
        },
        data: {
          isActive: false,
          resolvedAt: new Date()
        }
      });
    }

    // Create new escalation
    const escalation = await prisma.ticketEscalation.create({
      data: {
        ticketId,
        escalatedById: parseInt(escalatedById),
        escalatedToId: parseInt(escalatedToId),
        level,
        reason,
        isActive: true
      },
      include: {
        escalatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        escalatedTo: {
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

    // Update ticket status to ESCALATED
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'ESCALATED',
        priority: 'HIGH', // Escalated tickets become high priority
        currentOwnerId: parseInt(escalatedToId)
      }
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        fromStatus: ticket.status as any,
        toStatus: 'ESCALATED',
        changedById: parseInt(escalatedById),
        reason: `Escalated to ${escalation.escalatedTo.firstName} ${escalation.escalatedTo.lastName}: ${reason}`
      }
    });

    // Create work log entry
    await prisma.ticketWorkLog.create({
      data: {
        ticketId,
        userId: parseInt(escalatedById),
        action: 'ESCALATED',
        description: `Escalated to ${escalation.escalatedTo.firstName} ${escalation.escalatedTo.lastName} (Level ${level}): ${reason}`,
        isInternal: true,
        metadata: {
          escalationId: escalation.id,
          level,
          escalatedToId
        }
      }
    });

    return NextResponse.json(escalation, { status: 201 });
  } catch (error) {
    logger.error('Error escalating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to escalate ticket' },
      { status: 500 }
    );
  }
}

// DELETE /api/internal/tickets/[id]/escalate - De-escalate a ticket
async function deleteHandler(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get('userId') || '0');

    if (isNaN(ticketId) || !userId) {
      return NextResponse.json(
        { error: 'Invalid ticket ID or user ID' },
        { status: 400 }
      );
    }

    // Find active escalation
    const escalation = await prisma.ticketEscalation.findFirst({
      where: {
        ticketId,
        isActive: true
      }
    });

    if (!escalation) {
      return NextResponse.json(
        { error: 'No active escalation found' },
        { status: 404 }
      );
    }

    // Deactivate escalation
    await prisma.ticketEscalation.update({
      where: { id: escalation.id },
      data: {
        isActive: false,
        resolvedAt: new Date()
      }
    });

    // Update ticket status
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'IN_PROGRESS',
        priority: 'MEDIUM'
      }
    });

    // Create work log entry
    await prisma.ticketWorkLog.create({
      data: {
        ticketId,
        userId,
        action: 'DE_ESCALATED',
        description: 'Ticket de-escalated and returned to normal priority',
        isInternal: true
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error de-escalating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to de-escalate ticket' },
      { status: 500 }
    );
  }
}

// Export handlers
export { postHandler as POST, deleteHandler as DELETE };
