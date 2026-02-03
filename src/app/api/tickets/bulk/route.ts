/**
 * Ticket Bulk Operations API Route
 * =================================
 *
 * POST /api/tickets/bulk - Bulk update tickets
 * POST /api/tickets/bulk/merge - Merge tickets
 *
 * @module app/api/tickets/bulk
 */

import { NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import type { BulkUpdateTicketsInput, MergeTicketsInput } from '@/domains/ticket';

/**
 * POST /api/tickets/bulk
 * Bulk update multiple tickets
 */
export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();

    // Check for merge operation
    if (body.operation === 'merge') {
      if (!body.sourceTicketId || !body.targetTicketId) {
        return NextResponse.json(
          { error: 'Source and target ticket IDs are required for merge' },
          { status: 400 }
        );
      }

      const userContext = {
        id: user.id,
        email: user.email,
        role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
        clinicId: user.clinicId,
      };

      const mergeInput: MergeTicketsInput = {
        sourceTicketId: body.sourceTicketId,
        targetTicketId: body.targetTicketId,
        reason: body.reason,
        transferComments: body.transferComments !== false,
        transferAttachments: body.transferAttachments !== false,
      };

      const ticket = await ticketService.merge(mergeInput, userContext);

      logger.info('[API] Tickets merged', {
        sourceTicketId: body.sourceTicketId,
        targetTicketId: body.targetTicketId,
        mergedById: user.id,
      });

      return NextResponse.json({
        ticket,
        message: 'Tickets merged successfully',
      });
    }

    // Bulk update operation
    if (!body.ticketIds || !Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return NextResponse.json(
        { error: 'Ticket IDs array is required' },
        { status: 400 }
      );
    }

    if (!body.updates || Object.keys(body.updates).length === 0) {
      return NextResponse.json(
        { error: 'Updates object is required' },
        { status: 400 }
      );
    }

    // Limit bulk operations
    if (body.ticketIds.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 tickets can be updated at once' },
        { status: 400 }
      );
    }

    const userContext = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId,
    };

    const input: BulkUpdateTicketsInput = {
      ticketIds: body.ticketIds,
      updates: {
        status: body.updates.status,
        priority: body.updates.priority,
        category: body.updates.category,
        assignedToId: body.updates.assignedToId,
        teamId: body.updates.teamId,
        addTags: body.updates.addTags,
        removeTags: body.updates.removeTags,
      },
    };

    const result = await ticketService.bulkUpdate(input, userContext);

    logger.info('[API] Bulk ticket update', {
      ticketCount: body.ticketIds.length,
      updatedCount: result.updated,
      updates: Object.keys(body.updates),
      updatedById: user.id,
    });

    return NextResponse.json({
      updated: result.updated,
      message: `${result.updated} tickets updated successfully`,
    });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/tickets/bulk' });
  }
});
