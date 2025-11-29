import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/internal/tickets/[id]/comments - Get ticket comments
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

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId },
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
    });

    return NextResponse.json(comments);
  } catch (error) {
    logger.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/internal/tickets/[id]/comments - Add comment to ticket
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
      authorId,
      comment,
      isInternal = false,
      attachments
    } = body;

    if (!authorId || !comment) {
      return NextResponse.json(
        { error: 'Author ID and comment are required' },
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

    // Create comment
    const newComment = await prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: parseInt(authorId),
        comment,
        isInternal,
        attachments
      },
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
      }
    });

    // TODO: Send notification to ticket participants

    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    logger.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

// Export handlers
export { getHandler as GET, postHandler as POST };
