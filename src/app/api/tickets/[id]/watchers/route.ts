/**
 * Ticket Watchers API Route
 * =========================
 *
 * GET    /api/tickets/[id]/watchers - Get watchers for a ticket
 * POST   /api/tickets/[id]/watchers - Add a watcher to a ticket
 * DELETE /api/tickets/[id]/watchers - Remove a watcher from a ticket
 *
 * @module app/api/tickets/[id]/watchers
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { ticketRepository } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { AddWatcherInput } from '@/domains/ticket';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tickets/[id]/watchers
 * Get all watchers for a ticket
 */
export const GET = withAuth(async (request, user, { params }: RouteParams) => {
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

    // Verify access to ticket
    await ticketService.getById(ticketId, userContext);

    const watchers = await ticketRepository.getWatchers(ticketId);

    return NextResponse.json({ watchers });
  } catch (error) {
    return handleApiError(error, { route: `GET /api/tickets/${(await params).id}/watchers` });
  }
});

/**
 * POST /api/tickets/[id]/watchers
 * Add a watcher to a ticket
 */
export const POST = withAuth(async (request, user, { params }: RouteParams) => {
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

    if (!body.userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const input: AddWatcherInput = {
      userId: body.userId,
      notifyOnComment: body.notifyOnComment,
      notifyOnStatus: body.notifyOnStatus,
      notifyOnAssign: body.notifyOnAssign,
      notifyOnResolve: body.notifyOnResolve,
    };

    await ticketService.addWatcher(ticketId, input, userContext);

    logger.info('[API] Watcher added to ticket', {
      ticketId,
      watcherId: body.userId,
      addedById: user.id,
    });

    return NextResponse.json(
      { message: 'Watcher added successfully' },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { route: `POST /api/tickets/${(await params).id}/watchers` });
  }
});

/**
 * DELETE /api/tickets/[id]/watchers
 * Remove a watcher from a ticket
 */
export const DELETE = withAuth(async (request, user, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const watcherUserId = parseInt(userId, 10);

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    await ticketService.removeWatcher(ticketId, watcherUserId, userContext);

    logger.info('[API] Watcher removed from ticket', {
      ticketId,
      watcherId: watcherUserId,
      removedById: user.id,
    });

    return NextResponse.json({ message: 'Watcher removed successfully' });
  } catch (error) {
    return handleApiError(error, { route: `DELETE /api/tickets/${(await params).id}/watchers` });
  }
});
