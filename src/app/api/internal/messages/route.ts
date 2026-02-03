import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// GET /api/internal/messages - Fetch messages
async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(request.url);
    // Use authenticated user's ID instead of accepting it from query
    const userId = user.id;

    // DEBUG: Log auth user info to diagnose one-way messaging bug
    console.log('[InternalMessages API] Auth user from middleware:', {
      userId: user.id,
      userIdType: typeof user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    });
    const channelId = searchParams.get('channelId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    
    // Log access for audit
    logger.api('GET', '/api/internal/messages', {
      userId: user.id,
      userRole: user.role,
      channelId,
      unreadOnly
    });

    // Build where clause based on parameters
    let whereClause: any;
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

    const messages = await prisma.internalMessage.findMany({
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
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Mark messages as read
    if (!unreadOnly) {
      const messageIds = messages
        .filter((m: { recipientId: number | null; isRead: boolean }) => m.recipientId === userId && !m.isRead)
        .map((m: { id: number }) => m.id);
      
      if (messageIds.length > 0) {
        await prisma.internalMessage.updateMany({
          where: {
            id: { in: messageIds }
          },
          data: {
            isRead: true,
            readAt: new Date()
          }
        });
      }
    }

    // Return messages with the authenticated user ID for client-side validation
    // This helps detect auth mismatches where localStorage user != JWT user
    return NextResponse.json({
      messages,
      _meta: {
        authenticatedUserId: userId,
        authenticatedUserRole: user.role,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error('Error fetching messages:', {
      error: errorMessage,
      stack: errorStack,
      userId: user?.id,
      userRole: user?.role
    });
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: errorMessage },
      { status: 500 }
    );
  }
}

// POST /api/internal/messages - Send a message
async function postHandler(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();
    // Use authenticated user as sender
    const senderId = user.id;
    const {
      recipientId,
      message,
      messageType = 'DIRECT',
      channelId,
      parentMessageId,
      attachments
    } = body;
    
    // Log message sending for audit
    logger.api('POST', '/api/internal/messages', {
      userId: user.id,
      userRole: user.role,
      recipientId,
      messageType,
      channelId
    });

    if (!message) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    if (messageType === 'DIRECT' && !recipientId) {
      return NextResponse.json(
        { error: 'Recipient ID is required for direct messages' },
        { status: 400 }
      );
    }

    const newMessage = await prisma.internalMessage.create({
      data: {
        senderId,
        recipientId,
        message,
        messageType,
        channelId,
        parentMessageId,
        attachments,
        metadata: body.metadata
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

    // TODO: Trigger real-time notification here (WebSocket/SSE)

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    logger.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
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
