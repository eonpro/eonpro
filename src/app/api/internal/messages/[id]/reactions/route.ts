import { NextResponse, NextRequest } from 'next/server';
import { basePrisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// Valid reaction types (iMessage-style)
const VALID_REACTIONS = ['love', 'like', 'dislike', 'question', 'exclamation', 'laugh'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

/**
 * POST /api/internal/messages/[id]/reactions - Add a reaction to a message
 *
 * Body: { emoji: "love" | "like" | "dislike" | "question" | "exclamation" | "laugh" }
 */
async function postHandler(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messageId = parseInt(id, 10);
    const userId = Number(user.id);

    if (isNaN(messageId) || messageId <= 0) {
      return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
    }

    const body = await request.json();
    const { emoji } = body;

    if (!emoji || !VALID_REACTIONS.includes(emoji as ReactionType)) {
      return NextResponse.json(
        { error: 'Invalid reaction. Must be one of: ' + VALID_REACTIONS.join(', ') },
        { status: 400 }
      );
    }

    // Verify message exists and user has access (is sender or recipient)
    const message = await basePrisma.internalMessage.findFirst({
      where: {
        id: messageId,
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found or access denied' }, { status: 404 });
    }

    // Add reaction (upsert to handle duplicate attempts gracefully)
    const reaction = await basePrisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
      update: {}, // Already exists, no update needed
      create: {
        messageId,
        userId,
        emoji,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info('[MessageReaction] Reaction added', {
      messageId,
      userId,
      emoji,
      reactionId: reaction.id,
    });

    return NextResponse.json(reaction);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Unique constraint - reaction already exists
        return NextResponse.json({ error: 'Reaction already exists' }, { status: 409 });
      }
    }

    logger.error('[MessageReaction] Error adding reaction:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
  }
}

/**
 * DELETE /api/internal/messages/[id]/reactions - Remove a reaction from a message
 *
 * Query: ?emoji=love
 */
async function deleteHandler(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messageId = parseInt(id, 10);
    const userId = Number(user.id);
    const { searchParams } = new URL(request.url);
    const emoji = searchParams.get('emoji');

    if (isNaN(messageId) || messageId <= 0) {
      return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
    }

    if (!emoji || !VALID_REACTIONS.includes(emoji as ReactionType)) {
      return NextResponse.json(
        { error: 'Invalid reaction. Must be one of: ' + VALID_REACTIONS.join(', ') },
        { status: 400 }
      );
    }

    // Delete the reaction (only if it belongs to this user)
    const deleted = await basePrisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId,
        emoji,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Reaction not found' }, { status: 404 });
    }

    logger.info('[MessageReaction] Reaction removed', {
      messageId,
      userId,
      emoji,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[MessageReaction] Error removing reaction:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
}

/**
 * GET /api/internal/messages/[id]/reactions - Get all reactions for a message
 */
async function getHandler(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messageId = parseInt(id, 10);
    const userId = Number(user.id);

    if (isNaN(messageId) || messageId <= 0) {
      return NextResponse.json({ error: 'Invalid message ID' }, { status: 400 });
    }

    // Verify user has access to this message
    const message = await basePrisma.internalMessage.findFirst({
      where: {
        id: messageId,
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found or access denied' }, { status: 404 });
    }

    const reactions = await basePrisma.messageReaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(reactions);
  } catch (error) {
    logger.error('[MessageReaction] Error fetching reactions:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }
}

// Export wrapped handlers with authentication
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
export const GET = withAuth(getHandler);
