import { NextResponse, NextRequest } from 'next/server';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/internal/messages - Fetch internal staff messages
 *
 * ENTERPRISE FEATURES:
 * - User-scoped messaging (not clinic-scoped)
 * - Unread message filtering
 * - Thread/reply support
 * - Channel messaging support
 */
async function getHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    // Use authenticated user's ID - must be a number
    const userId = Number(user.id);

    if (isNaN(userId) || userId <= 0) {
      logger.error('Invalid user ID in auth context', {
        rawUserId: user.id,
        userIdType: typeof user.id,
        email: user.email
      });
      return NextResponse.json(
        { error: 'Invalid user session', messages: [] },
        { status: 401 }
      );
    }

    const channelId = searchParams.get('channelId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Log access for audit (no PHI)
    logger.api('GET', '/api/internal/messages', {
      userId,
      userRole: user.role,
      channelId,
      unreadOnly,
      limit,
      offset
    });

    // Build where clause based on parameters
    // Using basePrisma since InternalMessage is user-scoped, not clinic-scoped
    type WhereClause = {
      recipientId?: number;
      isRead?: boolean;
      channelId?: string;
      OR?: Array<{ senderId: number } | { recipientId: number }>;
    };

    let whereClause: WhereClause;

    if (unreadOnly) {
      // For unread messages, only get messages sent TO the user that are unread
      whereClause = {
        recipientId: userId,
        isRead: false
      };
    } else if (channelId) {
      // For channel messages
      whereClause = { channelId };
    } else {
      // Default: get all messages where user is sender or recipient
      whereClause = {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ]
      };
    }

    const messages = await basePrisma.internalMessage.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        recipient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        replies: {
          include: {
            sender: {
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
          },
          take: 10 // Limit replies per message
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Mark messages as read (only when fetching all, not unreadOnly)
    if (!unreadOnly && messages.length > 0) {
      const unreadMessageIds = messages
        .filter(m => m.recipientId === userId && !m.isRead)
        .map(m => m.id);

      if (unreadMessageIds.length > 0) {
        await basePrisma.internalMessage.updateMany({
          where: {
            id: { in: unreadMessageIds },
            recipientId: userId // Extra safety check
          },
          data: {
            isRead: true,
            readAt: new Date()
          }
        });
      }
    }

    logger.debug('Internal messages fetched', {
      userId,
      count: messages.length,
      unreadOnly,
      durationMs: Date.now() - startTime
    });

    // Return messages with the authenticated user ID for client-side validation
    return NextResponse.json({
      messages,
      _meta: {
        authenticatedUserId: userId,
        authenticatedUserRole: user.role,
        timestamp: new Date().toISOString(),
        count: messages.length
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';

    logger.error('Error fetching internal messages:', {
      error: errorMessage,
      stack: errorStack,
      userId: user?.id,
      userRole: user?.role,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json(
      { error: 'Failed to fetch messages', messages: [], details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/messages - Send an internal message
 *
 * ENTERPRISE FEATURES:
 * - Input validation
 * - Audit logging
 * - Thread/reply support
 */
async function postHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    // Use authenticated user as sender - must be a number
    const senderId = Number(user.id);

    if (isNaN(senderId) || senderId <= 0) {
      return NextResponse.json(
        { error: 'Invalid user session' },
        { status: 401 }
      );
    }

    const {
      recipientId,
      message,
      messageType = 'DIRECT',
      channelId,
      parentMessageId,
      attachments
    } = body;

    // Log message sending for audit (no PHI)
    logger.api('POST', '/api/internal/messages', {
      userId: senderId,
      userRole: user.role,
      recipientId: recipientId ? Number(recipientId) : null,
      messageType,
      channelId: channelId || null
    });

    // Validate message content
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Validate message length
    if (message.length > 5000) {
      return NextResponse.json(
        { error: 'Message too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // Validate direct message recipient
    if (messageType === 'DIRECT' && !recipientId) {
      return NextResponse.json(
        { error: 'Recipient ID is required for direct messages' },
        { status: 400 }
      );
    }

    // Validate recipient exists if provided
    if (recipientId) {
      const recipientExists = await basePrisma.user.findUnique({
        where: { id: Number(recipientId) },
        select: { id: true }
      });

      if (!recipientExists) {
        return NextResponse.json(
          { error: 'Recipient not found' },
          { status: 404 }
        );
      }
    }

    // Validate parent message if this is a reply
    if (parentMessageId) {
      const parentMessage = await basePrisma.internalMessage.findUnique({
        where: { id: Number(parentMessageId) },
        select: { id: true }
      });

      if (!parentMessage) {
        return NextResponse.json(
          { error: 'Parent message not found' },
          { status: 404 }
        );
      }
    }

    // Sanitize message content (basic XSS prevention)
    const sanitizedMessage = message
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();

    const newMessage = await basePrisma.internalMessage.create({
      data: {
        senderId,
        recipientId: recipientId ? Number(recipientId) : null,
        message: sanitizedMessage,
        messageType,
        channelId: channelId || null,
        parentMessageId: parentMessageId ? Number(parentMessageId) : null,
        attachments: attachments || null,
        metadata: body.metadata || null,
        clinicId: user.clinicId || null
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        recipient: {
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

    logger.info('Internal message sent', {
      messageId: newMessage.id,
      senderId,
      recipientId: recipientId ? Number(recipientId) : null,
      messageType,
      durationMs: Date.now() - startTime
    });

    // TODO: Trigger real-time notification here (WebSocket/SSE)

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Error sending internal message:', {
      error: errorMessage,
      userId: user?.id,
      durationMs: Date.now() - startTime
    });

    return NextResponse.json(
      { error: 'Failed to send message', details: errorMessage },
      { status: 500 }
    );
  }
}

// Export handlers with authentication
// Include all staff roles that should have access to internal chat
export const GET = withAuth(getHandler, {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'support', 'influencer']
});

export const POST = withAuth(postHandler, {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'support', 'influencer']
});
