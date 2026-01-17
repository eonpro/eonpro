import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/internal/tickets/[id]/worklog - Get work logs
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

    const workLogs = await prisma.ticketWorkLog.findMany({
      where: { ticketId },
      include: {
        user: {
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
    });

    // Calculate total work time
    const totalWorkTime = workLogs.reduce((total: number, log: { duration: number | null }) => total + (log.duration || 0), 0);

    return NextResponse.json({
      workLogs,
      totalWorkTime,
      summary: {
        totalEntries: workLogs.length,
        uniqueWorkers: new Set(workLogs.map((log: { userId: number }) => log.userId)).size
      }
    });
  } catch (error) {
    logger.error('Error fetching work logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch work logs' },
      { status: 500 }
    );
  }
}

// POST /api/internal/tickets/[id]/worklog - Add work log entry
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
      userId,
      action,
      duration,
      description,
      isInternal = true,
      metadata
    } = body;

    if (!userId || !action || !description) {
      return NextResponse.json(
        { error: 'User ID, action, and description are required' },
        { status: 400 }
      );
    }

    // Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Create work log entry
    const workLog = await prisma.ticketWorkLog.create({
      data: {
        ticketId,
        userId: parseInt(userId),
        action,
        duration: duration ? parseInt(duration) : null,
        description,
        isInternal,
        metadata
      },
      include: {
        user: {
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

    // Update ticket with last worked information
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        lastWorkedById: parseInt(userId),
        lastWorkedAt: new Date(),
        actualWorkTime: {
          increment: duration ? parseInt(duration) : 0
        }
      }
    });

    // If action indicates taking ownership, update current owner
    if (action === 'STARTED_WORK' || action === 'ASSIGNED') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          currentOwnerId: parseInt(userId),
          status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status
        }
      });
    }

    // If resolved, update resolution time
    if (action === 'RESOLVED' && !ticket.resolvedAt) {
      const createdAt = new Date(ticket.createdAt);
      const resolvedAt = new Date();
      const resolutionTime = Math.floor((resolvedAt.getTime() - createdAt.getTime()) / 60000); // in minutes
      
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          resolvedAt,
          resolvedById: parseInt(userId),
          resolutionTime
        }
      });
    }

    return NextResponse.json(workLog, { status: 201 });
  } catch (error) {
    logger.error('Error creating work log:', error);
    return NextResponse.json(
      { error: 'Failed to create work log' },
      { status: 500 }
    );
  }
}

// Export handlers
export { getHandler as GET, postHandler as POST };
