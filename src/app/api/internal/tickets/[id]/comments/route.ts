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

const createCommentSchema = z.object({
  comment: z.string().min(1, "Comment is required").max(10000, "Comment too long"),
  isInternal: z.boolean().default(false),
  attachments: z.array(z.string().url()).max(10).optional(),
});

// Allowed roles for internal ticket management
const ALLOWED_ROLES = ['super_admin', 'admin', 'staff', 'support', 'provider'];

// GET /api/internal/tickets/[id]/comments - Get ticket comments
const getHandler = withAuth(async (
  request: NextRequest,
  user,
  context?: { params: Promise<{ id: string }> }
) => {
  try {
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

    // Verify ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
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
      orderBy: { createdAt: 'asc' },
      take: 200 // Limit comments
    });

    return NextResponse.json({
      data: comments,
      meta: { count: comments.length, ticketId }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching comments', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
});

// POST /api/internal/tickets/[id]/comments - Add comment to ticket
const postHandler = withAuth(async (
  request: NextRequest,
  user,
  context?: { params: Promise<{ id: string }> }
) => {
  try {
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
    const bodyParseResult = createCommentSchema.safeParse(rawBody);
    
    if (!bodyParseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: bodyParseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }

    const { comment, isInternal, attachments } = bodyParseResult.data;

    // Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Create comment using the authenticated user's ID
    const newComment = await prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: user.id,
        comment,
        isInternal,
        attachments: attachments || []
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

    logger.info('Comment added to ticket', { ticketId, commentId: newComment.id, userId: user.id });
    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating comment', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
});

export const GET = getHandler;
export const POST = postHandler;
