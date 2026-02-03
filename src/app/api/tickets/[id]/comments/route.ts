/**
 * Ticket Comments API Route
 * =========================
 *
 * GET  /api/tickets/[id]/comments - Get comments for a ticket
 * POST /api/tickets/[id]/comments - Add a comment to a ticket
 *
 * @module app/api/tickets/[id]/comments
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { CreateCommentInput } from '@/domains/ticket';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tickets/[id]/comments
 * Get all comments for a ticket
 */
export const GET = withAuth(async (request, { user }, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const comments = await ticketService.getComments(ticketId, userContext);

    return NextResponse.json({ comments });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/tickets/${(await params).id}/comments` });
  }
});

/**
 * POST /api/tickets/[id]/comments
 * Add a comment to a ticket
 */
export const POST = withAuth(async (request, { user }, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const input: CreateCommentInput = {
      ticketId,
      content: body.content,
      isInternal: body.isInternal || false,
      mentions: body.mentions,
      attachments: body.attachments,
    };

    const comment = await ticketService.addComment(input, userContext);

    logger.info('[API] Comment added to ticket', {
      ticketId,
      commentId: comment.id,
      isInternal: input.isInternal,
      authorId: user.id,
    });

    return NextResponse.json(
      {
        comment,
        message: 'Comment added successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { route: `POST /api/tickets/${(await params).id}/comments` });
  }
});
