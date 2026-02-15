import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Helper function to calculate SLA times based on priority
function calculateSLATimes(priority: string, createdAt: Date) {
  const now = new Date(createdAt);
  let firstResponseMinutes = 60; // Default 1 hour
  let resolutionMinutes = 1440; // Default 24 hours

  switch (priority) {
    case 'URGENT':
      firstResponseMinutes = 15;
      resolutionMinutes = 120; // 2 hours
      break;
    case 'HIGH':
      firstResponseMinutes = 30;
      resolutionMinutes = 240; // 4 hours
      break;
    case 'MEDIUM':
      firstResponseMinutes = 60;
      resolutionMinutes = 480; // 8 hours
      break;
    case 'LOW':
      firstResponseMinutes = 240; // 4 hours
      resolutionMinutes = 1440; // 24 hours
      break;
  }

  const firstResponseDue = new Date(now.getTime() + firstResponseMinutes * 60000);
  const resolutionDue = new Date(now.getTime() + resolutionMinutes * 60000);

  return { firstResponseDue, resolutionDue };
}

// GET /api/internal/tickets/[id]/sla - Get SLA status
async function getHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const sla = await prisma.ticketSLA.findUnique({
      where: { ticketId },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            priority: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!sla) {
      return NextResponse.json({ error: 'SLA not found for this ticket' }, { status: 404 });
    }

    // Calculate current status
    const now = new Date();
    const timeToFirstResponse = sla.firstResponseDue
      ? Math.floor((sla.firstResponseDue.getTime() - now.getTime()) / 60000)
      : null;
    const timeToResolution = sla.resolutionDue
      ? Math.floor((sla.resolutionDue.getTime() - now.getTime()) / 60000)
      : null;

    const firstResponseBreached =
      sla.firstResponseDue && !sla.firstResponseAt && now > sla.firstResponseDue;
    const resolutionBreached = sla.resolutionDue ? !sla.resolvedAt && now > sla.resolutionDue : false;

    return NextResponse.json({
      ...sla,
      status: {
        firstResponseBreached,
        resolutionBreached,
        timeToFirstResponse,
        timeToResolution,
        isBreached: sla.breached || firstResponseBreached || resolutionBreached,
      },
    });
  } catch (error) {
    logger.error('Error fetching SLA:', error);
    return NextResponse.json({ error: 'Failed to fetch SLA' }, { status: 500 });
  }
}

// POST /api/internal/tickets/[id]/sla - Create or update SLA
async function postHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);
    const body = await request.json();

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    // Get ticket details
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Check if SLA already exists
    const existingSLA = await prisma.ticketSLA.findUnique({
      where: { ticketId },
    });

    const slaData = body.customSLA || calculateSLATimes(ticket.priority, ticket.createdAt);

    if (existingSLA) {
      // Update existing SLA
      const updatedSLA = await prisma.ticketSLA.update({
        where: { ticketId },
        data: {
          firstResponseDue: slaData.firstResponseDue
            ? new Date(slaData.firstResponseDue)
            : existingSLA.firstResponseDue,
          resolutionDue: new Date(slaData.resolutionDue),
          breached: body.breached || existingSLA.breached,
          breachReason: body.breachReason || existingSLA.breachReason,
        },
      });

      return NextResponse.json(updatedSLA);
    } else {
      // Create new SLA
      const newSLA = await prisma.ticketSLA.create({
        data: {
          ticketId,
          firstResponseDue: slaData.firstResponseDue ? new Date(slaData.firstResponseDue) : null,
          resolutionDue: new Date(slaData.resolutionDue),
          breached: false,
        },
      });

      return NextResponse.json(newSLA, { status: 201 });
    }
  } catch (error) {
    logger.error('Error managing SLA:', error);
    return NextResponse.json({ error: 'Failed to manage SLA' }, { status: 500 });
  }
}

// PATCH /api/internal/tickets/[id]/sla - Update SLA (e.g., mark first response)
async function patchHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const ticketId = parseInt(params.id);
    const body = await request.json();

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const sla = await prisma.ticketSLA.findUnique({
      where: { ticketId },
    });

    if (!sla) {
      return NextResponse.json({ error: 'SLA not found' }, { status: 404 });
    }

    const updateData: any = {};
    const now = new Date();

    // Mark first response
    if (body.markFirstResponse && !sla.firstResponseAt) {
      updateData.firstResponseAt = now;

      // Check if breached
      if (sla.firstResponseDue && now > sla.firstResponseDue) {
        updateData.breached = true;
        updateData.breachReason = 'First response SLA breached';
      }
    }

    // Mark resolution
    if (body.markResolved && !sla.resolvedAt) {
      updateData.resolvedAt = now;

      // Check if breached
      if (sla.resolutionDue && now > sla.resolutionDue) {
        updateData.breached = true;
        updateData.breachReason = updateData.breachReason
          ? `${updateData.breachReason}, Resolution SLA breached`
          : 'Resolution SLA breached';
      }
    }

    // Manual breach
    if (body.breach !== undefined) {
      updateData.breached = body.breach;
      updateData.breachReason = body.breachReason || 'Manually marked as breached';
    }

    const updatedSLA = await prisma.ticketSLA.update({
      where: { ticketId },
      data: updateData,
    });

    return NextResponse.json(updatedSLA);
  } catch (error) {
    logger.error('Error updating SLA:', error);
    return NextResponse.json({ error: 'Failed to update SLA' }, { status: 500 });
  }
}

// Export handlers
export { getHandler as GET, postHandler as POST, patchHandler as PATCH };
